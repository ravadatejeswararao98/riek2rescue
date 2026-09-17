// ================================================================
// LAND BOUNDARY SERVICE & COASTLINE CLIPPING (Turf.js)
// Loads India land boundary GeoJSON and clips hazard polygons
// so they do not extend over sea/ocean.
// ================================================================

(function(window) {
  'use strict';

  const LandBoundaryService = {
    data: null,
    promise: null,
    clippedCache: new Map(),

    async load() {
      if (this.data) return this.data;
      if (this.promise) return this.promise;

      const fetchPromise = (typeof process !== 'undefined' && process.versions && process.versions.node && typeof require === 'function')
        ? Promise.resolve().then(() => {
            const fs = require('fs');
            return JSON.parse(fs.readFileSync('data/india_land_boundary.geojson', 'utf8'));
          })
        : fetch('data/india_land_boundary.geojson').then(res => {
            if (!res.ok) throw new Error(`HTTP ${res.status} loading india_land_boundary.geojson`);
            return res.json();
          });

      this.promise = fetchPromise
        .then(geojson => {
          this.data = geojson;
          if (geojson && geojson.features) {
            geojson.features.forEach(f => {
              if (!f.bbox && window.turf) {
                try { f.bbox = window.turf.bbox(f); } catch (e) {}
              }
            });
          }
          console.log(`[LandBoundaryService] India land boundary GeoJSON loaded successfully (${geojson.features ? geojson.features.length : 0} features)`);
          // Automatically re-render active hazard zones to reflect clipped geometry
          try {
            if (window.hazardEngine) {
              window.hazardEngine.invalidateCache();
              if (window.hazardEngine.activeKey) {
                window.hazardEngine.render(window.hazardEngine.activeKey, true);
              }
            }
            if (window.mapApp && typeof window.mapApp.drawRiskZones === 'function') {
              window.mapApp.drawRiskZones();
            }
            if (window.authMapInstance && typeof window.authMapInstance.drawRiskZones === 'function') {
              window.authMapInstance.drawRiskZones();
            }
          } catch(e) {
            console.warn('[LandBoundaryService] Re-render error after load:', e);
          }
          return geojson;
        })
        .catch(err => {
          console.warn('[LandBoundaryService] Failed to load india_land_boundary.geojson:', err);
          return null;
        });

      return this.promise;
    },

    /**
     * Clips an organic polygon ring against the loaded land boundary.
     * @param {Array<[number, number]>} coords - [[lng, lat], ...] ring
     * @param {Object} options - { name, hazardType, lat, lng, radiusMeters }
     * @returns {Object} GeoJSON geometry (Polygon or MultiPolygon)
     */
    clipPolygonCoords(coords, options = {}) {
      const { name = 'zone', hazardType = 'cyclone', lat = 0, lng = 0, radiusMeters = 0 } = options;
      const cacheKey = `${name}_${hazardType}_${lat.toFixed(5)}_${lng.toFixed(5)}_${radiusMeters}`;

      if (this.clippedCache.has(cacheKey)) {
        return this.clippedCache.get(cacheKey);
      }

      const fallbackGeometry = {
        type: "Polygon",
        coordinates: [coords]
      };

      if (!window.turf || !this.data || !this.data.features || !this.data.features.length) {
        return fallbackGeometry;
      }

      try {
        const rawPoly = window.turf.polygon([coords]);
        const zoneBbox = window.turf.bbox(rawPoly);

        // Find candidate land features intersecting zone bbox
        const candidates = this.data.features.filter(f => {
          const b = f.bbox;
          if (!b) return true;
          return !(b[2] < zoneBbox[0] || b[0] > zoneBbox[2] || b[3] < zoneBbox[1] || b[1] > zoneBbox[3]);
        });

        if (!candidates.length) {
          console.warn(`[LandBoundaryService] No land polygon intersects bounding box for ${name}`);
          this.clippedCache.set(cacheKey, fallbackGeometry);
          return fallbackGeometry;
        }

        let clipped = null;
        for (let i = 0; i < candidates.length; i++) {
          try {
            const isect = window.turf.intersect(rawPoly, candidates[i]);
            if (isect) {
              clipped = !clipped ? isect : window.turf.union(clipped, isect);
            }
          } catch (clipErr) {
            console.warn(`[LandBoundaryService] Error intersecting ${name} with land feature:`, clipErr);
          }
        }

        if (!clipped || !clipped.geometry) {
          console.warn(`[LandBoundaryService] Intersection returned null for ${name} (possible ocean center). Falling back to original.`);
          this.clippedCache.set(cacheKey, fallbackGeometry);
          return fallbackGeometry;
        }

        const resultGeometry = clipped.geometry;
        this.clippedCache.set(cacheKey, resultGeometry);
        return resultGeometry;
      } catch (err) {
        console.warn(`[LandBoundaryService] Exception during clipping for ${name}:`, err);
        return fallbackGeometry;
      }
    },

    /**
     * Authoritative spatial validation: returns true if (lat, lng) is on LAND, false if OCEAN/WATER.
     * Uses India land boundary GeoJSON (all 37 states/UTs, islands, and coastlines).
     * @param {number} lat - Latitude
     * @param {number} lng - Longitude
     * @returns {boolean}
     */
    isPointOnLand(lat, lng) {
      const nLat = Number(lat);
      const nLng = Number(lng);
      if (!Number.isFinite(nLat) || !Number.isFinite(nLng)) return false;
      if (!this.data || !Array.isArray(this.data.features)) return false;

      const pt = [nLng, nLat]; // GeoJSON coordinate order: [longitude, latitude]

      for (let i = 0; i < this.data.features.length; i++) {
        const f = this.data.features[i];
        const b = f.bbox;
        if (b && (nLng < b[0] || nLng > b[2] || nLat < b[1] || nLat > b[3])) {
          continue; // Quick bounding box rejection
        }
        if (typeof window !== 'undefined' && window.turf && typeof window.turf.booleanPointInPolygon === 'function') {
          try {
            if (window.turf.booleanPointInPolygon(window.turf.point(pt), f)) {
              return true;
            }
          } catch (e) {}
        }
        const geom = f.geometry;
        if (geom && geom.coordinates) {
          if (geom.type === 'Polygon') {
            if (_pointInPolygonFast(pt, geom.coordinates[0])) return true;
          } else if (geom.type === 'MultiPolygon') {
            for (let j = 0; j < geom.coordinates.length; j++) {
              if (_pointInPolygonFast(pt, geom.coordinates[j][0])) return true;
            }
          }
        }
      }
      return false;
    }
  };

  function _pointInPolygonFast(point, vs) {
    if (!vs || vs.length < 3) return false;
    const x = point[0], y = point[1];
    let inside = false;
    for (let i = 0, j = vs.length - 1; i < vs.length; j = i++) {
      const xi = vs[i][0], yi = vs[i][1];
      const xj = vs[j][0], yj = vs[j][1];
      const intersect = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  }

  if (typeof window !== 'undefined') {
    window.LandBoundaryService = LandBoundaryService;
  }
  if (typeof global !== 'undefined') {
    global.LandBoundaryService = LandBoundaryService;
  }

  // Auto-init load on script execution
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => LandBoundaryService.load());
    } else {
      LandBoundaryService.load();
    }
  }
})(window);
