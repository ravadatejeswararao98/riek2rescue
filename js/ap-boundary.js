// ================================================================
// AP-BOUNDARY.JS — Andhra Pradesh State Operational Boundary Service
// ================================================================
// Authoritative spatial boundary service enforcing AP-only operations.
// Source of truth: data/andhra_pradesh_boundary.geojson

class APBoundary {
  constructor() {
    this.boundaryPoly = null;
    this.renderedLayer = null;
    this.ready = false;
    this._resolveReady = null;
    this.readyPromise = new Promise((resolve) => {
      this._resolveReady = resolve;
    });
    this.init();
  }

  async init() {
    try {
      const response = await fetch('data/andhra_pradesh_boundary.geojson');
      const data = await response.json();

      if (data && data.features && data.features.length > 0) {
        // The authoritative Andhra Pradesh boundary feature
        this.boundaryPoly = data.features[0];
        this.ready = true;
        if (this._resolveReady) this._resolveReady(this);
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('ap-boundary-ready', { detail: { service: this } }));
        }
      } else {
        console.error('[APBoundaryService] Invalid GeoJSON structure');
      }
    } catch (e) {
      console.error('[APBoundaryService] Failed to load AP boundary GeoJSON:', e);
    }
  }

  isReady() {
    return this.ready && typeof window !== 'undefined' && typeof window.turf !== 'undefined';
  }

  whenReady() {
    if (this.isReady()) return Promise.resolve(this);
    return this.readyPromise;
  }

  /** Render a distinct visual border for AP, keeping basemap visible */
  drawBorder(map) {
    if (!this.ready || !this.boundaryPoly || !map) return;

    if (this.renderedLayer) {
      try { map.removeLayer(this.renderedLayer); } catch (e) {}
    }

    this.renderedLayer = L.geoJSON(this.boundaryPoly, {
      style: {
        color: '#3b82f6', // subtle blue outline
        weight: 2.5,
        opacity: 0.85,
        fillColor: 'transparent',
        fillOpacity: 0,
        className: 'ap-boundary-line'
      },
      interactive: false // Should not interfere with marker clicks
    });

    this.renderedLayer.addTo(map);
  }

  /** Fits the given map to the AP boundary bounding box */
  fitMap(map) {
    if (!this.ready || !this.boundaryPoly || !map) return;
    try {
      const layer = L.geoJSON(this.boundaryPoly);
      map.fitBounds(layer.getBounds(), { padding: [20, 20] });
    } catch (e) {
      console.warn('[APBoundaryService] fitMap failed:', e);
    }
  }

  /**
   * Check if a given coordinate is inside AP.
   * Coordinate order: [longitude, latitude] matching GeoJSON conventions.
   * FAIL-CLOSED: returns false if boundary is not ready or evaluation fails.
   * @param {Array} coords - [lng, lat]
   * @returns {boolean}
   */
  isPointInside(coords) {
    if (!this.isReady() || !this.boundaryPoly) return false; // Fail closed
    if (!Array.isArray(coords) || coords.length < 2) return false;

    const lng = Number(coords[0]);
    const lat = Number(coords[1]);
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return false;
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return false;

    try {
      const pt = window.turf.point([lng, lat]);
      return window.turf.booleanPointInPolygon(pt, this.boundaryPoly);
    } catch (e) {
      return false; // Fail closed on evaluation error
    }
  }

  /**
   * Clips a given GeoJSON polygon to the AP boundary.
   * FAIL-CLOSED: returns null if completely outside AP or boundary is unready.
   * @param {Object} turfPolygon - Turf polygon feature
   * @returns {Object|null} - Clipped polygon, or null if completely outside
   */
  clipPolygon(turfPolygon) {
    if (!this.isReady() || !this.boundaryPoly || !turfPolygon) return null; // Fail closed
    try {
      const intersection = window.turf.intersect(turfPolygon, this.boundaryPoly);
      return intersection || null;
    } catch (e) {
      console.warn('[APBoundaryService] Error clipping polygon to AP:', e);
      return null;
    }
  }
}

// Global Singleton
if (typeof window !== 'undefined') {
  window.APBoundaryService = new APBoundary();

  /**
   * Core Reusable AP Spatial Validation Helper
   * @param {number} lat - Latitude
   * @param {number} lng - Longitude
   * @returns {boolean}
   */
  window.isInsideAndhraPradesh = function(lat, lng) {
    const nLat = Number(lat);
    const nLng = Number(lng);
    if (!Number.isFinite(nLat) || !Number.isFinite(nLng)) return false;
    if (nLat < -90 || nLat > 90 || nLng < -180 || nLng > 180) return false;

    if (!window.APBoundaryService || !window.APBoundaryService.isReady()) {
      return false; // Fail closed
    }

    // GeoJSON order is [longitude, latitude]
    return window.APBoundaryService.isPointInside([nLng, nLat]);
  };

  /**
   * Reusable Geographic Dataset Filter
   * Filters any array of items containing lat/lng down to AP only.
   * @param {Array} records
   * @returns {Array}
   */
  window.filterAPOnly = function(records) {
    if (!Array.isArray(records)) return [];
    return records.filter(item => {
      if (!item || typeof item !== 'object') return false;
      const lat = item.lat ?? item.latitude ?? item.locationCoords?.latitude ?? item.locationCoords?.lat ?? item.location?.lat ?? item.location?.latitude;
      const lng = item.lng ?? item.lon ?? item.longitude ?? item.locationCoords?.longitude ?? item.locationCoords?.lng ?? item.location?.lng ?? item.location?.longitude;
      return window.isInsideAndhraPradesh(lat, lng);
    });
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = APBoundary;
}
