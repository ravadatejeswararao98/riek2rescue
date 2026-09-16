// ================================================================
// MAP.JS — Leaflet Map Setup, Risk Zones, Layers
// ================================================================

// ================================================================
// 4-TIER HAZARD ZONE SEVERITY SYSTEM
// Unified tokens and operational meanings across GIS platform
// ================================================================
const RISK_TIERS = {
  RED: {
    level: 'RED',
    name: 'CRITICAL',
    title: 'Critical Active Zone',
    shortLabel: 'Critical',
    meaning: 'Direct hazard epicenter. Active ongoing threat confirmed by live telemetry.',
    fill: '#ef4444',
    fillOpacity: 0.48,
    stroke: '#dc2626',
    strokeOpacity: 0.95,
    pulsing: true,
    cssClass: 'level-red'
  },
  ORANGE: {
    level: 'ORANGE',
    name: 'HIGH ALERT',
    title: 'High Alert Zone',
    shortLabel: 'High Alert',
    meaning: 'Imminent danger zone. Severe impact corridor under immediate evacuation watch.',
    fill: '#f97316',
    fillOpacity: 0.40,
    stroke: '#ea580c',
    strokeOpacity: 0.88,
    pulsing: false,
    cssClass: 'level-orange'
  },
  YELLOW: {
    level: 'YELLOW',
    name: 'MODERATE',
    title: 'Moderate Risk Zone',
    shortLabel: 'Moderate',
    meaning: 'Elevated risk under monitoring corridor. Precautionary advisory active.',
    fill: '#eab308',
    fillOpacity: 0.35,
    stroke: '#ca8a04',
    strokeOpacity: 0.85,
    pulsing: false,
    cssClass: 'level-yellow'
  },
  GREEN: {
    level: 'GREEN',
    name: 'LOW RISK',
    title: 'Low Risk / Buffer Zone',
    shortLabel: 'Low Risk',
    meaning: 'Verified low-risk perimeter and safe evacuation corridor.',
    fill: '#22c55e',
    fillOpacity: 0.28,
    stroke: '#16a34a',
    strokeOpacity: 0.75,
    pulsing: false,
    cssClass: 'level-green'
  }
};

const RISK_COLORS = RISK_TIERS;

const LAYER_CONFIG = {
  satellite: { name: 'Satellite', icon: '<i class="fi fi-rr-satellite" aria-hidden="true"></i>', iconClass: 'fi-rr-satellite', url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', maxZoom: 19 },
  standard: { name: 'Standard', icon: '<i class="fi fi-rr-map" aria-hidden="true"></i>', iconClass: 'fi-rr-map', url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', maxZoom: 19 },
  windy: { name: 'Windy Radar', icon: '<i class="fi fi-rr-wind" aria-hidden="true"></i>', iconClass: 'fi-rr-wind', url: 'https://tilecache.rainviewer.com/v2/radar/nowcast/256/{z}/{x}/{y}/2/1_1.png', maxZoom: 12, opacity: 0.75 },
  topo: { name: 'Elevation', icon: '<i class="fi fi-rr-mountains" aria-hidden="true"></i>', iconClass: 'fi-rr-mountains', url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', maxZoom: 17 }
};

if (typeof fetch !== 'undefined') {
  fetch('/api/windy/config')
    .then(res => res.json())
    .then(cfg => {
      if (cfg && cfg.configured && cfg.key) {
        LAYER_CONFIG.windy.url = `https://tiles.windy.com/tiles/v1.0/radar/{z}/{x}/{y}.png?key=${cfg.key}`;
      }
    })
    .catch(() => { });
}

if (typeof window !== 'undefined') {
  window.RISK_TIERS = RISK_TIERS;
  window.RISK_COLORS = RISK_COLORS;
  window.LAYER_CONFIG = LAYER_CONFIG;
}

// ================================================================
// ORGANIC ZONE POLYGON GENERATOR (Choropleth / Terrain Contour)
// ================================================================
function generateOrganicZonePolygon(lat, lng, radiusMeters, name = '', hazardType = 'cyclone') {
  let seed = 0;
  for (let i = 0; i < name.length; i++) seed = (seed * 31 + name.charCodeAt(i)) & 0xffffffff;
  const pseudo = (offset) => {
    const x = Math.sin(seed + offset) * 10000;
    return x - Math.floor(x);
  };

  const numPoints = 28;
  const coords = [];
  const rLat = radiusMeters / 111320;
  const rLng = rLat / Math.cos((lat * Math.PI) / 180);

  let angleOffset = 0;
  let elongation = 1.35;
  const h = (hazardType || '').toLowerCase();
  if (h.includes('cyclone') || h.includes('tsunami') || h.includes('erosion')) {
    angleOffset = 0.78; // ~45 degrees (Bay of Bengal AP coast alignment)
    elongation = 1.6;
  } else if (h.includes('flood')) {
    angleOffset = 0.35;
    elongation = 1.85;
  } else if (h.includes('landslide')) {
    angleOffset = 1.15;
    elongation = 1.6;
  } else if (h.includes('earthquake')) {
    angleOffset = 0.55;
    elongation = 1.3;
  }

  for (let i = 0; i < numPoints; i++) {
    const theta = (i / numPoints) * 2 * Math.PI;
    const harmonic1 = Math.sin(2 * (theta - angleOffset)) * 0.28;
    const harmonic2 = Math.cos(3 * theta + pseudo(i)) * 0.14;
    const harmonic3 = Math.sin(5 * theta) * 0.08;
    const noise = (pseudo(i * 7) - 0.5) * 0.12;

    const stretch = 1 + (elongation - 1) * Math.cos(theta - angleOffset) ** 2;
    const factor = Math.max(0.42, (1 + harmonic1 + harmonic2 + harmonic3 + noise) * stretch);

    const ptLat = lat + rLat * factor * Math.sin(theta);
    const ptLng = lng + rLng * factor * Math.cos(theta);
    coords.push([ptLng, ptLat]);
  }
  coords.push(coords[0]); // Close polygon

  // Clip against land boundary using Turf.js so coastal zones do not extend over sea
  if (typeof window !== 'undefined' && window.LandBoundaryService && window.turf) {
    try {
      const clipped = window.LandBoundaryService.clipPolygonCoords(coords, {
        name,
        hazardType,
        lat,
        lng,
        radiusMeters
      });
      if (clipped && clipped.coordinates) {
        if (clipped.type === 'Polygon' && clipped.coordinates[0]) {
          return clipped.coordinates[0];
        } else if (clipped.type === 'MultiPolygon' && clipped.coordinates.length) {
          let largest = clipped.coordinates[0][0];
          for (let p of clipped.coordinates) {
            if (p[0] && p[0].length > largest.length) largest = p[0];
          }
          return largest;
        }
      }
    } catch (clipErr) {
      console.warn(`[generateOrganicZonePolygon] Clipping error for ${name}, falling back to unclipped polygon:`, clipErr);
    }
  }

  return coords;
}
if (typeof window !== 'undefined') {
  window.generateOrganicZonePolygon = generateOrganicZonePolygon;
}

class DisasterMap {
  constructor(containerId, options = {}) {
    this.containerId = containerId;
    this.options = options;
    this.map = null;
    this.baseLayers = {};
    this.overlayLayers = {};
    this.activeBaseLayer = 'standard';
    this.riskZoneCircles = [];
    this.markers = { safeSites: [], hospitals: [], habitations: null, hazards: [] };
    this.userMarker = null;
    this.locateMarker = null;
    this._hasActiveLocate = false;
    this.init();
  }

  init() {
    const config = APP_DATA.mapConfig || {};
    const minZ = config.minZoom || 4;
    const maxZ = config.maxZoom || 18;

    // Constrain geographical bounding box strictly to Andhra Pradesh and surrounding coastal buffer
    const regionalBounds = L.latLngBounds(
      L.latLng(10.0, 74.0),   // Expanded Southwest corner
      L.latLng(22.0, 87.0)    // Expanded Northeast corner to allow panning up to see popups
    );

    this.map = L.map(this.containerId, {
      center: config.center || [15.9129, 80.5],
      zoom: config.zoom || 7,
      minZoom: Math.max(minZ, 6),
      maxZoom: maxZ,
      maxBounds: regionalBounds,
      maxBoundsViscosity: 0.85,
      zoomControl: true,
      attributionControl: false,
      scrollWheelZoom: false, // Disabled on startup to prevent scroll-locking during initial asset & tile loading
      wheelDebounceTime: 120, // Prevents event floods from trackpads and high-frequency wheels
      wheelPxPerZoomLevel: 120 // Smooth, gradual zoom control instead of sudden jumps
    });

    // Move zoom control to bottom-right
    this.map.zoomControl.setPosition('bottomright');

    this.map.on('zoomend', () => this.updateZoomVisibility());

    // Enable smooth scrollWheelZoom only once map is initialized and ready
    this.map.whenReady(() => {
      setTimeout(() => {
        if (this.map && this.map.scrollWheelZoom) {
          this.map.scrollWheelZoom.enable();
        }

        // AP Boundary Enforcement
        if (window.APBoundaryService) {
          window.APBoundaryService.whenReady().then(() => {
            window.APBoundaryService.drawBorder(this.map);
            // Only fit bounds if no specific coordinate was requested and no active locate has occurred
            if ((!config.center || config.center[0] === 15.9129 || config.center[0] === 16.99) && !this._hasActiveLocate) {
              window.APBoundaryService.fitMap(this.map);
            }
          });
        }
      }, 350);
    });

    // Setup base layers with idle update optimization (avoids tile thrashing on wheel scroll)
    this.baseLayers.standard = L.tileLayer(LAYER_CONFIG.standard.url, {
      maxZoom: 19,
      minZoom: minZ,
      attribution: '© OpenStreetMap',
      updateWhenIdle: true,
      keepBuffer: 2
    }).addTo(this.map);

    this.baseLayers.satellite = L.tileLayer(LAYER_CONFIG.satellite.url, {
      maxZoom: 19,
      minZoom: minZ,
      attribution: '© Esri',
      updateWhenIdle: true,
      keepBuffer: 2
    });

    this.baseLayers.windy = L.tileLayer(LAYER_CONFIG.windy.url, {
      maxZoom: 12,
      minZoom: minZ,
      attribution: 'Radar: RainViewer',
      opacity: LAYER_CONFIG.windy.opacity || 0.75,
      updateWhenIdle: true,
      keepBuffer: 2
    });

    this.baseLayers.topo = L.tileLayer(LAYER_CONFIG.topo.url, {
      maxZoom: 17,
      minZoom: minZ,
      attribution: '© OpenTopoMap',
      updateWhenIdle: true,
      keepBuffer: 2
    });

    // Dark styling for base tiles is applied via CSS filter (see .leaflet-tile-pane)

    // Draw default risk zones and markers once AP boundary is ready or immediately
    if (!this.options || !this.options.skipDefaultOverlays) {
      if (window.APBoundaryService && typeof window.APBoundaryService.whenReady === 'function') {
        window.APBoundaryService.whenReady().then(() => {
          this.renderAllOverlays();
        });
      } else {
        this.renderAllOverlays();
      }
    }

    return this;
  }

  renderAllOverlays() {
    this.drawRiskZones();
    this.addSafeSiteMarkers();
    this.addHazardMarkers();
    this.addHospitalMarkers();
    this.addHabitationMarkers();
    this.updateZoomVisibility(); // Initial visibility check
  }

  drawRiskZones() {
    if (this.riskZoneCircles && this.riskZoneCircles.length) {
      this.riskZoneCircles.forEach(rz => {
        if (rz.circle) try { this.map.removeLayer(rz.circle); } catch (e) { }
        if (rz.rings) rz.rings.forEach(r => { try { this.map.removeLayer(r); } catch (e) { } });
        if (rz.label) try { this.map.removeLayer(rz.label); } catch (e) { }
      });
    }
    this.riskZoneCircles = [];

    // Concentric multi-ring configuration:
    // Simplified to 2 rings to reduce visual clutter
    const CONCENTRIC_TIERS = [
      { level: 'YELLOW', multiplier: 1.00, subLabel: 'MODERATE', fillOpacity: 0.15, strokeOpacity: 0.60, ringName: 'Monitoring Zone' },
      { level: 'RED', multiplier: 0.35, subLabel: 'CRITICAL', fillOpacity: 0.30, strokeOpacity: 0.90, ringName: 'Critical Active Core' }
    ];

    APP_DATA.riskZones.forEach(zone => {
      const lat = zone.epicenter ? zone.epicenter.lat : zone.lat;
      const lng = zone.epicenter ? zone.epicenter.lng : zone.lng;
      // Removed strict isInsideAndhraPradesh filter here because hazard epicenters 
      // (like earthquakes or cyclones) can originate offshore or in neighboring states 
      // but their radius still impacts Andhra Pradesh.
      const baseRadius = zone.baseRadius || zone.radius;
      const hazardType = zone.hazardType || (zone.name.toLowerCase().includes('cyclone') ? 'cyclone' : zone.name.toLowerCase().includes('flood') ? 'flood' : zone.name.toLowerCase().includes('landslide') ? 'landslide' : zone.name.toLowerCase().includes('earthquake') ? 'earthquake' : 'cyclone');

      if (zone.epicenter || zone.baseRadius) {
        // Multi-ring concentric hazard epicenter rendering
        const rings = [];
        let primaryCircle = null;

        CONCENTRIC_TIERS.forEach(tier => {
          const colors = RISK_COLORS[tier.level] || RISK_COLORS.YELLOW;
          const rMeters = baseRadius * tier.multiplier;
          // All 4 rings share same lat, lng, hazardType, and orientation seed (zone.name)
          const polygonCoords = generateOrganicZonePolygon(lat, lng, rMeters, zone.name, hazardType);

          const ringZoneData = {
            ...zone,
            level: tier.level,
            radius: rMeters,
            ringLabel: tier.subLabel,
            ringName: `${zone.name} — ${tier.ringName} (${tier.subLabel})`,
            desc: tier.level === 'RED' ? (zone.desc || 'Critical active hazard core. Direct impact corridor.') :
              tier.level === 'ORANGE' ? 'High alert buffer zone. Imminent severe impact watch.' :
                tier.level === 'YELLOW' ? 'Moderate risk monitoring zone. Squall & waterlogging monitoring.' :
                  'Low risk perimeter. Advisory monitoring zone.'
          };

          const geojsonFeature = {
            type: "Feature",
            properties: {
              name: ringZoneData.ringName,
              level: tier.level,
              pop: tier.level === 'RED' ? zone.pop : Math.round(zone.pop * (1 + (tier.multiplier - 0.35) * 0.8)),
              desc: ringZoneData.desc
            },
            geometry: {
              type: "Polygon",
              coordinates: [polygonCoords]
            }
          };

          const polygonLayer = L.geoJSON(geojsonFeature, {
            style: () => ({
              fillColor: colors.fill,
              fillOpacity: tier.fillOpacity,
              color: colors.stroke,
              weight: tier.level === 'RED' ? 2.5 : 1.8,
              opacity: tier.strokeOpacity,
              className: `hazard-polygon level-${tier.level.toLowerCase()}`
            })
          }).addTo(this.map);

          polygonLayer.bindPopup(this.createRiskPopup(ringZoneData), { className: 'custom-popup' });
          polygonLayer.bindTooltip(zone.name, { permanent: false, sticky: true, className: 'zone-tooltip' });
          rings.push(polygonLayer);

          if (!this.hazardPolygons) this.hazardPolygons = [];
          this.hazardPolygons.push({
            polygon: geojsonFeature,
            level: tier.level,
            hazardType: hazardType
          });
          if (tier.level === 'RED') {
            primaryCircle = polygonLayer;
          }
        });

        this.riskZoneCircles.push({
          zone,
          circle: primaryCircle || rings[rings.length - 1],
          rings,
          label: null // removed floating labels to reduce visual clutter
        });

      } else {
        // Single Regional Zone (e.g. distinct district safe zone)
        const colors = RISK_COLORS[zone.level] || RISK_COLORS.YELLOW;
        const polygonCoords = generateOrganicZonePolygon(lat, lng, zone.radius, zone.name, hazardType);

        const geojsonFeature = {
          type: "Feature",
          properties: {
            name: zone.name,
            level: zone.level,
            pop: zone.pop,
            desc: zone.desc
          },
          geometry: {
            type: "Polygon",
            coordinates: [polygonCoords]
          }
        };

        const polygonLayer = L.geoJSON(geojsonFeature, {
          style: () => ({
            fillColor: colors.fill,
            fillOpacity: colors.fillOpacity || 0.28,
            color: colors.stroke,
            weight: 2,
            opacity: colors.strokeOpacity || 0.8,
            className: `hazard-polygon level-${zone.level.toLowerCase()}`
          })
        }).addTo(this.map);

        polygonLayer.bindPopup(this.createRiskPopup(zone), { className: 'custom-popup' });
        polygonLayer.bindTooltip(zone.name, { permanent: false, sticky: true, className: 'zone-tooltip' });

        this.riskZoneCircles.push({ zone, circle: polygonLayer, rings: [polygonLayer], label: null });
      }
    });
  }

  createRiskPopup(zone) {
    const tier = RISK_COLORS[zone.level] || RISK_COLORS.YELLOW;
    const levelClass = zone.level.toLowerCase();
    return `
      <div class="map-popup zone-unified-popup">
        <div class="popup-header">
          <div class="popup-tier-chip tier-${levelClass}">
            <span class="chip-dot"></span>
            <span class="chip-label">${tier.name}</span>
          </div>
          <span class="popup-name">${zone.name}</span>
        </div>
        <div class="popup-meaning-bar tier-${levelClass}">${tier.meaning}</div>
        <div class="popup-body">
          <div class="popup-stat"><span>Population at Risk</span><strong>${zone.pop.toLocaleString()}</strong></div>
          <div class="popup-desc">${zone.desc}</div>
        </div>
      </div>
    `;
  }

  addSafeSiteMarkers() {
    this.safeSitesMarkers = [];

    APP_DATA.safeSites.forEach(site => {
      // Safe sites must strictly be inside AP
      if (window.isInsideAndhraPradesh && !window.isInsideAndhraPradesh(site.lat, site.lng)) {
        return;
      }
      const hasOcc = typeof site.current === 'number' && !isNaN(site.current);
      const pct = hasOcc ? Math.round((site.current / site.capacity) * 100) : null;
      const capColor = !hasOcc ? '#94a3b8' : (pct > 85 ? '#ef4444' : pct > 60 ? '#f97316' : '#22c55e');
      const occText = hasOcc ? `${site.current.toLocaleString()} (${pct}%) [LIVE]` : 'UNKNOWN (No live signal)';
      const opStatus = site.live?.operationalStatus || 'UNKNOWN';
      const badgeClass = opStatus === 'open' ? 'risk-green' : (opStatus === 'full' ? 'risk-red' : (opStatus === 'closed' ? 'risk-gray' : 'risk-blue'));
      const badgeLabel = opStatus === 'open' ? 'SAFE SITE (OPEN)' : (opStatus === 'full' ? 'SHELTER FULL' : (opStatus === 'closed' ? 'SHELTER CLOSED' : 'BASELINE DIRECTORY'));

      const icon = L.divIcon({
        html: `
          <div class="map-poi-pin poi-shelter" title="Evacuation Shelter: ${site.name}">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
              <polyline points="9 12 11 14 15 10"/>
            </svg>
          </div>
        `,
        className: '', iconSize: [24, 24], iconAnchor: [12, 12]
      });
      const marker = L.marker([site.lat, site.lng], { icon }).addTo(this.map);

      marker.bindPopup(`
        <div class="map-popup">
          <div class="popup-header"><span class="risk-badge ${badgeClass}">${badgeLabel}</span><span class="popup-name">${site.name}</span></div>
          <div class="popup-body">
            <div class="popup-stat"><span>Reference Capacity</span><strong>${site.capacity.toLocaleString()}</strong></div>
            <div class="popup-stat"><span>Estimated Occupancy</span><strong style="color:${capColor}">${occText}</strong></div>
            <div class="popup-stat"><span>Operational Status</span><strong>${opStatus}</strong></div>
            <div class="popup-stat"><span>Source</span><span style="font-size:11px;color:#94a3b8;">AP SDMA (Baseline)</span></div>
            <div class="popup-stat"><span>Type</span><strong>${site.type}</strong></div>
            <div class="popup-amenities">${site.amenities.map(a => `<span>${a}</span>`).join('')}</div>
          </div>
        </div>
      `, { className: 'custom-popup' });
      marker._siteData = site;
      this.markers.safeSites.push(marker);
    });
  }

  addHazardMarkers() {
    const icons = {
      Cyclone: '<i class="fi fi-rr-tornado" aria-hidden="true"></i>',
      Flood: '<i class="fi fi-rr-water" aria-hidden="true"></i>',
      Landslide: '<i class="fi fi-rr-mountains" aria-hidden="true"></i>',
      Earthquake: '<i class="fi fi-rr-waveform-path" aria-hidden="true"></i>',
      Cloudburst: '<i class="fi fi-rr-thunderstorm" aria-hidden="true"></i>',
      Tsunami: '<i class="fi fi-rr-wave" aria-hidden="true"></i>',
      'Coastal Erosion': '<i class="fi fi-rr-island-tropical" aria-hidden="true"></i>'
    };
    APP_DATA.activeHazards.forEach(h => {
      if (window.isInsideAndhraPradesh && !window.isInsideAndhraPradesh(h.lat, h.lng)) {
        return;
      }
      const icon = L.divIcon({
        html: `<div style="font-size:22px;display:flex;align-items:center;justify-content:center;color:#ef4444;text-shadow:0 2px 6px rgba(0,0,0,0.6);animation:float 2s ease-in-out infinite">${icons[h.type] || '<i class="fi fi-rr-triangle-warning" aria-hidden="true"></i>'}</div>`,
        className: '', iconSize: [32, 32], iconAnchor: [16, 16]
      });
      const marker = L.marker([h.lat, h.lng], { icon }).addTo(this.map);
      const sevClass = h.severity === 'CRITICAL' ? 'risk-red' : h.severity === 'HIGH' ? 'risk-orange' : 'risk-yellow';
      marker.bindPopup(`
        <div class="map-popup">
          <div class="popup-header"><span class="risk-badge ${sevClass}">${h.severity}</span><span class="popup-name">${h.name}</span></div>
          <div class="popup-body">
            <div class="popup-stat"><span>Type</span><strong>${h.type}</strong></div>
            <div class="popup-stat"><span>State</span><strong>${h.state}</strong></div>
            <div class="popup-stat"><span>Confidence</span><strong>${h.confidence}%</strong></div>
            <div class="popup-stat"><span>ETA</span><strong>${h.eta}</strong></div>
            <div class="popup-desc">${h.desc}</div>
          </div>
        </div>
      `, { className: 'custom-popup' });
      this.markers.hazards.push(marker);
    });
  }

  addHospitalMarkers() {
    APP_DATA.hospitals.forEach(h => {
      if (window.isInsideAndhraPradesh && !window.isInsideAndhraPradesh(h.lat, h.lng)) {
        return;
      }
      const icon = L.divIcon({
        html: `<div class="map-poi-pin poi-hospital" title="Hospital: ${h.name}">H</div>`,
        className: '', iconSize: [22, 22], iconAnchor: [11, 11]
      });
      const marker = L.marker([h.lat, h.lng], { icon });
      marker.bindPopup(`
        <div class="map-popup">
          <div class="popup-header"><span class="risk-badge" style="background:rgba(220,38,38,0.2);color:#f87171;border:1px solid rgba(220,38,38,0.4)">HOSPITAL</span><span class="popup-name">${h.name}</span></div>
          <div class="popup-body">
            <div class="popup-stat"><span>Beds</span><strong>${h.beds || 'Available'}</strong></div>
            <div class="popup-stat"><span>Trauma Unit</span><strong>${h.trauma ? 'Yes' : 'Level 2'}</strong></div>
            <div class="popup-desc">${h.address || 'Emergency medical facility on standby'}</div>
          </div>
        </div>
      `, { className: 'custom-popup' });
      // Hidden by default, shown when hospital layer is active
      this.markers.hospitals.push(marker);
    });
  }

  addHabitationMarkers() {
    this.markers.habitations = L.markerClusterGroup({
      iconCreateFunction: function (cluster) {
        const count = cluster.getChildCount();
        const markers = cluster.getAllChildMarkers();
        let totalPop = 0;
        markers.forEach(m => {
          const p = Number(m._habData.pop || m._habData.growth_adjusted_pop || m._habData.census_2011_pop);
          if (Number.isFinite(p) && p > 0) totalPop += p;
        });

        return L.divIcon({
          html: `<div style="background: rgba(15,23,42,0.95); border: 2px solid rgba(255,255,255,0.2); color: #f1f5f9; padding: 6px 10px; border-radius: 12px; font-weight: 700; font-size: 11px; white-space: nowrap; box-shadow: 0 4px 12px rgba(0,0,0,0.5); text-align: center;">
            <span style="font-size:12px;"><i class="fi fi-rr-house-building" aria-hidden="true"></i> ${count} Habitations</span><br>
            <span style="color:#94a3b8; font-size:10px;">~${totalPop.toLocaleString()} pop</span>
          </div>`,
          className: 'custom-cluster-icon',
          iconSize: L.point(110, 40)
        });
      },
      maxClusterRadius: 70,
      disableClusteringAtZoom: 11
    });

    APP_DATA.habitations.forEach(hab => {
      const hLat = hab.lat;
      const hLng = hab.lng || hab.lon;
      if (window.isInsideAndhraPradesh && !window.isInsideAndhraPradesh(hLat, hLng)) {
        return;
      }
      // Compute dynamic risk based on Turf.js point-in-polygon vs active hazards
      let computedRisk = 'UNKNOWN';
      let activeThreat = 'No Active Threat Detected';
      if (typeof window.turf !== 'undefined' && this.hazardPolygons && this.hazardPolygons.length > 0) {
        const pt = turf.point([hLng, hLat]);
        let maxRank = 0;
        const rankMap = { 'GREEN': 1, 'LOW': 1, 'YELLOW': 2, 'MODERATE': 2, 'ORANGE': 3, 'HIGH': 3, 'RED': 4, 'CRITICAL': 4 };

        this.hazardPolygons.forEach(hp => {
          if (turf.booleanPointInPolygon(pt, hp.polygon)) {
            const level = (hp.level || 'MODERATE').toUpperCase();
            if ((rankMap[level] || 1) > maxRank) {
              maxRank = rankMap[level] || 1;
              computedRisk = level;
              activeThreat = hp.hazardType ? (hp.hazardType.charAt(0).toUpperCase() + hp.hazardType.slice(1)) : 'Active Hazard';
            }
          }
        });
        if (computedRisk === 'UNKNOWN') {
          computedRisk = 'LOW'; // Verified zero spatial intersection with current active hazard polygons
          activeThreat = 'Outside Active Hazard Zones';
        }
      } else {
        // No active hazard polygons loaded
        computedRisk = 'UNKNOWN';
        activeThreat = 'No Active Hazard Data';
      }

      hab.risk = computedRisk; // Dynamic operational risk based on current spatial relationship

      const riskColors = { RED: '#ef4444', CRITICAL: '#ef4444', ORANGE: '#f97316', HIGH: '#f97316', YELLOW: '#eab308', MODERATE: '#eab308', GREEN: '#22c55e', LOW: '#22c55e', UNKNOWN: '#94a3b8' };
      const col = riskColors[hab.risk] || '#94a3b8';

      const icon = L.divIcon({
        html: `
          <div class="map-poi-pin poi-habitation" style="--poi-accent:${col};" title="Habitation: ${hab.name} (${hab.risk} Risk)">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
              <path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/>
            </svg>
          </div>
        `,
        className: '', iconSize: [22, 22], iconAnchor: [11, 11]
      });
      const marker = L.marker([hab.lat, hab.lng || hab.lon], { icon });
      marker._habData = hab;

      // Light-theme, high-contrast popup for habitations
      const bgColors = { RED: '#fef2f2', CRITICAL: '#fef2f2', ORANGE: '#fff7ed', HIGH: '#fff7ed', YELLOW: '#fefce8', MODERATE: '#fefce8', GREEN: '#f0fdf4', LOW: '#f0fdf4', UNKNOWN: '#f8fafc' };
      const txtColors = { RED: '#b91c1c', CRITICAL: '#b91c1c', ORANGE: '#c2410c', HIGH: '#c2410c', YELLOW: '#a16207', MODERATE: '#a16207', GREEN: '#15803d', LOW: '#15803d', UNKNOWN: '#475569' };
      const riskBg = bgColors[hab.risk] || '#f8fafc';
      const riskTxt = txtColors[hab.risk] || '#0f172a';
      const riskBadgeLabel = hab.risk === 'UNKNOWN' ? 'UNKNOWN RISK' : `${hab.risk} RISK`;
      const actionText = (hab.risk === 'RED' || hab.risk === 'CRITICAL') ? 'Evacuate immediately' : (hab.risk === 'ORANGE' || hab.risk === 'HIGH') ? 'Prepare for evacuation' : (hab.risk === 'YELLOW' || hab.risk === 'MODERATE') ? 'Monitor local advisories' : hab.risk === 'LOW' ? 'Normal civil readiness' : 'Monitor situation';

      marker.bindPopup(`
        <div class="map-popup light-theme">
          <div class="popup-header">
            <span class="risk-badge" style="background:${riskBg}; color:${riskTxt}; border:1px solid ${col}66; font-weight:700;">${riskBadgeLabel}</span>
            <span class="popup-name">${hab.name}</span>
          </div>
          <div class="popup-body">
            <div class="popup-stat"><span>Census Reference Pop</span><strong>${(hab.censusPopulation || hab.pop || hab.growth_adjusted_pop || 0).toLocaleString()}</strong></div>
            <div class="popup-stat"><span>Status</span><strong>${hab.status || 'Registered Baseline'}</strong></div>
            <div class="popup-stat"><span>Immediate Threat</span><strong>${activeThreat}</strong></div>
            <div class="popup-stat"><span>Action</span><strong>${actionText}</strong></div>
          </div>
        </div>
      `, { className: 'custom-popup-light' });

      this.markers.habitations.addLayer(marker);
    });

    // Add cluster group to map immediately, zoom control is handled inside markercluster
    const isCitizen = window.location.pathname.includes('citizen');
    if (!isCitizen) {
      this.map.addLayer(this.markers.habitations);
    }
  }

  /**
   * @deprecated — No longer called from init().
   * The real pulsing citizenMarker in js/citizen.js is the single source of truth
   * for the citizen's location and only appears after genuine GPS resolution.
   * This method is retained only to avoid breaking any external callers (e.g., authority.html).
   */
  setUserLocation(latlng) {
    if (this.userMarker) this.map.removeLayer(this.userMarker);
    const icon = L.divIcon({
      html: `
        <div style="position:relative;width:20px;height:20px">
          <div style="width:20px;height:20px;border-radius:50%;background:#3b82f6;border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.4)"></div>
          <div style="position:absolute;inset:-8px;border-radius:50%;border:2px solid rgba(59,130,246,0.5);animation:pulse-ring 1.8s ease-out infinite"></div>
        </div>`,
      className: '', iconSize: [20, 20], iconAnchor: [10, 10]
    });
    this.userMarker = L.marker(latlng, { icon, zIndexOffset: 1000 }).addTo(this.map);
    this.userMarker.bindPopup('<div class="map-popup"><strong>Your Location</strong></div>', { className: 'custom-popup' });
  }

  toggleLayer(layerName, visible) {
    switch (layerName) {
      case 'satellite':
        if (visible) { this.baseLayers.satellite.addTo(this.map); }
        else { this.map.removeLayer(this.baseLayers.satellite); }
        break;
      case 'elevation':
        if (visible) { this.baseLayers.topo.addTo(this.map); }
        else { this.map.removeLayer(this.baseLayers.topo); }
        break;
      case 'flood': case 'cyclone': case 'landslide':
        this.riskZoneCircles.forEach(({ zone, circle, rings, label }) => {
          if (zone.level === 'RED' || zone.level === 'ORANGE' || zone.epicenter) {
            const targets = rings || (circle ? [circle] : []);
            targets.forEach(r => {
              if (visible) { if (!this.map.hasLayer(r)) r.addTo(this.map); }
              else { if (this.map.hasLayer(r)) this.map.removeLayer(r); }
            });
            if (label) {
              if (visible) { if (!this.map.hasLayer(label)) label.addTo(this.map); }
              else { if (this.map.hasLayer(label)) this.map.removeLayer(label); }
            }
          }
        });
        break;
      case 'hospitals':
        this.markers.hospitals.forEach(m => visible ? m.addTo(this.map) : this.map.removeLayer(m));
        break;
      case 'habitations':
        if (this.markers.habitations) {
          if (visible) this.map.addLayer(this.markers.habitations);
          else this.map.removeLayer(this.markers.habitations);
        }
        break;
      case 'shelters':
        this.markers.safeSites.forEach(m => visible ? m.addTo(this.map) : this.map.removeLayer(m));
        break;
      case 'redZones':
        this.riskZoneCircles.forEach(({ zone, circle, rings, label }) => {
          if (zone.level === 'RED' || zone.epicenter) {
            const targets = rings || (circle ? [circle] : []);
            targets.forEach(r => {
              if (visible) { if (!this.map.hasLayer(r)) r.addTo(this.map); }
              else { if (this.map.hasLayer(r)) this.map.removeLayer(r); }
            });
            if (label) {
              if (visible) { if (!this.map.hasLayer(label)) label.addTo(this.map); }
              else { if (this.map.hasLayer(label)) this.map.removeLayer(label); }
            }
          }
        });
        break;
    }
  }

  // Remove the generic demo overlays so a hazard-specific view can own the map.
  // Also removes any residual userMarker that may have been set externally.
  clearDefaultOverlays() {
    this.riskZoneCircles.forEach(({ circle, rings, label }) => {
      const targets = rings || (circle ? [circle] : []);
      targets.forEach(r => {
        if (this.map.hasLayer(r)) this.map.removeLayer(r);
      });
      if (label && this.map.hasLayer(label)) this.map.removeLayer(label);
    });
    Object.values(this.markers).forEach(list => {
      if (list) {
        if (typeof list.forEach === 'function') {
          list.forEach(m => { if (this.map.hasLayer(m)) this.map.removeLayer(m); });
        } else if (typeof list.eachLayer === 'function') {
          this.map.removeLayer(list);
        }
      }
    });
    // Clean up legacy userMarker if present (defensive — should not exist after the
    // setUserLocation() call was removed from init(), but kept for safety)
    if (this.userMarker && this.map.hasLayer(this.userMarker)) {
      this.map.removeLayer(this.userMarker);
      this.userMarker = null;
    }
  }

  setBasemap(name) {
    if (name === 'windy') {
      // Keep standard base map underneath so geography is visible beneath radar overlay
      if (!this.map.hasLayer(this.baseLayers.standard)) {
        this.baseLayers.standard.addTo(this.map);
      }
      if (this.baseLayers.windy && !this.map.hasLayer(this.baseLayers.windy)) {
        this.baseLayers.windy.addTo(this.map);
      }
      if (this.map.hasLayer(this.baseLayers.satellite)) this.map.removeLayer(this.baseLayers.satellite);
      if (this.map.hasLayer(this.baseLayers.topo)) this.map.removeLayer(this.baseLayers.topo);
    } else {
      if (this.baseLayers.windy && this.map.hasLayer(this.baseLayers.windy)) {
        this.map.removeLayer(this.baseLayers.windy);
      }
      Object.entries(this.baseLayers).forEach(([key, layer]) => {
        if (key === 'windy') return;
        if (key === name) { if (!this.map.hasLayer(layer)) layer.addTo(this.map); }
        else if (this.map.hasLayer(layer)) this.map.removeLayer(layer);
      });
    }
    this.activeBaseLayer = name;
  }

  flyToLocation(lat, lng, zoom = 10) {
    this.map.flyTo([lat, lng], zoom, { duration: 1.5, easeLinearity: 0.5 });
  }

  setLocatePointer(lat, lng, options = {}) {
    if (!this.map) return null;
    const nLat = Number(lat);
    const nLng = Number(lng);
    if (!Number.isFinite(nLat) || !Number.isFinite(nLng)) return null;

    // Strict Andhra Pradesh Boundary Check
    if (window.isInsideAndhraPradesh && !window.isInsideAndhraPradesh(nLat, nLng)) {
      console.warn('[Map] Attempted to locate coordinates outside Andhra Pradesh boundary:', nLat, nLng);
      if (typeof window.showToast === 'function') {
        window.showToast('Selected location is outside the Andhra Pradesh operational boundary.', 'warning');
      }
      return null;
    }

    this._hasActiveLocate = true;
    this._lastLocatedCoords = [nLat, nLng];

    // Remove any previous active locate pointer & accuracy circle cleanly
    if (this.locateMarker) {
      try {
        if (this.map.hasLayer(this.locateMarker)) {
          this.map.removeLayer(this.locateMarker);
        }
      } catch (e) {}
      this.locateMarker = null;
    }
    if (this.locateAccuracyCircle) {
      try {
        if (this.map.hasLayer(this.locateAccuracyCircle)) {
          this.map.removeLayer(this.locateAccuracyCircle);
        }
      } catch (e) {}
      this.locateAccuracyCircle = null;
    }

    const isSos = Boolean(options.isSos || (options.name && options.name.includes('SOS')));

    // Determine color & badges matching canonical zone status
    let lvl = (options.level || options.tier || options.severity || '').toUpperCase();
    if (!lvl || lvl === 'GREEN' || lvl === 'SAFE' || lvl === 'NORMAL' || lvl === 'LOW') {
      if (typeof window !== 'undefined' && typeof window.getZoneForCoordinates === 'function') {
        const zInfo = window.getZoneForCoordinates(nLat, nLng);
        if (zInfo && zInfo.level) {
          lvl = zInfo.level;
        }
      }
    }
    let markerColor = '#ef4444';
    let pulseBg = 'rgba(239,68,68,0.25)';
    let dotShadow = 'rgba(239,68,68,0.8)';
    let badgeLabel = 'SELECTED LOCATION';

    if (isSos) {
      markerColor = '#dc2626';
      pulseBg = 'rgba(220,38,38,0.38)';
      dotShadow = 'rgba(220,38,38,0.95)';
      badgeLabel = '🚨 SOS DISTRESS';
    } else if (lvl === 'ORANGE' || lvl === 'HIGH') {
      markerColor = '#f97316';
      pulseBg = 'rgba(249,115,22,0.25)';
      dotShadow = 'rgba(249,115,22,0.8)';
      badgeLabel = 'HIGH ALERT';
    } else if (lvl === 'YELLOW' || lvl === 'MODERATE' || lvl === 'MONITORING' || lvl === 'ADVISORY') {
      markerColor = '#eab308';
      pulseBg = 'rgba(234,179,8,0.25)';
      dotShadow = 'rgba(234,179,8,0.8)';
      badgeLabel = 'MONITORING';
    } else if (lvl === 'SAFE' || lvl === 'GREEN' || lvl === 'LOW' || lvl === 'NORMAL') {
      markerColor = '#22c55e';
      pulseBg = 'rgba(34,197,94,0.25)';
      dotShadow = 'rgba(34,197,94,0.8)';
      badgeLabel = 'NORMAL';
    } else if (lvl === 'RED' || lvl === 'CRITICAL') {
      markerColor = '#ef4444';
      pulseBg = 'rgba(239,68,68,0.25)';
      dotShadow = 'rgba(239,68,68,0.8)';
      badgeLabel = 'RED ZONE';
    }

    // Inject pulse CSS & popup styling if not already present
    if (typeof document !== 'undefined' && !document.getElementById('locate-pulse-style') && !document.getElementById('citizen-pulse-style')) {
      const style = document.createElement('style');
      style.id = 'locate-pulse-style';
      style.textContent = `
        @keyframes citizenPulse {
          0%   { transform: scale(0.8); opacity: 0.9; }
          70%  { transform: scale(2.5); opacity: 0;   }
          100% { transform: scale(2.5); opacity: 0;   }
        }
        .location-popup-header {
          padding-right: 32px !important;
        }
        .location-popup-risk {
          text-transform: uppercase !important;
        }
      `;
      document.head.appendChild(style);
    }

    // Optional accuracy circle around device location
    if (options.accuracy && Number.isFinite(Number(options.accuracy)) && Number(options.accuracy) > 0) {
      this.locateAccuracyCircle = L.circle([nLat, nLng], {
        radius: Math.min(Number(options.accuracy), 5000),
        color: isSos ? '#dc2626' : markerColor,
        weight: 1.5,
        fillColor: isSos ? '#dc2626' : markerColor,
        fillOpacity: 0.12,
        dashArray: '4, 4'
      }).addTo(this.map);
    }

    // Identical pulsing pointer/marker mechanism as My Location
    const pulseIcon = L.divIcon({
      className: '',
      html: `
        <div style="position:relative;width:38px;height:38px;">
          <div style="position:absolute;inset:0;border-radius:50%;background:${pulseBg};animation:citizenPulse 1.8s ease-out infinite;"></div>
          <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:18px;height:18px;background:${markerColor};border-radius:50%;border:3px solid #fff;box-shadow:0 0 12px ${dotShadow};"></div>
        </div>`,
      iconSize: [38, 38],
      iconAnchor: [19, 19],
    });

    this.locateMarker = L.marker([nLat, nLng], { icon: pulseIcon, zIndexOffset: 9500 })
      .addTo(this.map);

    // Build popup with identical structure as My Location
    const nameStr = options.name || (isSos ? 'Citizen Emergency SOS' : 'Selected Location');
    const titleStr = isSos ? 'CITIZEN SOS DISTRESS' : (options.title || 'Selected Location');
    const coordsStr = `${nLat.toFixed(5)}°N, ${nLng.toFixed(5)}°E`;
    const accStr = options.accuracy ? `<i class="fi fi-rr-satellite-dish" aria-hidden="true"></i> <strong>GPS Accuracy:</strong> ±${Math.round(options.accuracy)}m` : '';
    const descStr = options.desc || '';
    const popStr = options.population ? `<i class="fi fi-rr-users" aria-hidden="true"></i> <strong>${Number(options.population).toLocaleString()}</strong> population at risk` : '';

    const popupHtml = `
      <div class="location-popup">
        <div class="location-popup-header">
          <div class="location-popup-title-row">
            <span class="location-popup-icon">${isSos ? '<i class="fi fi-rr-alarm-exclamation" aria-hidden="true"></i>' : '<i class="fi fi-rr-marker" aria-hidden="true"></i>'}</span>
            <span class="location-popup-title">${titleStr}</span>
          </div>
          <div class="location-popup-risk" style="background:${markerColor}20; color:${markerColor}; font-weight:700; font-size:11px; padding:2.5px 8px; border-radius:12px;">
            ${badgeLabel}
          </div>
        </div>
        <div class="location-popup-place" style="font-size:13px; font-weight:700; color:#0f172a; margin-top:4px;">${nameStr}</div>
        <div class="location-popup-coords" style="font-size:11px; color:#64748b; font-family:monospace; margin-top:2px;">${coordsStr}</div>
        ${accStr ? `<div style="font-size:11px; color:#0284c7; margin-top:3px;">${accStr}</div>` : ''}
        ${descStr ? `<div class="location-popup-zone" style="font-size:11.5px; color:#334155; margin-top:4px;">${descStr}</div>` : ''}
        ${popStr ? `<div class="location-popup-advisory" style="font-size:11.5px; color:#0284c7; font-weight:600; margin-top:4px;">${popStr}</div>` : ''}
      </div>
    `;

    this.locateMarker.bindPopup(popupHtml, {
      className: 'location-popup-wrapper',
      maxWidth: 340,
      minWidth: 280
    });

    // Zoom extent: 16 for SOS street level, 12-14 for standard
    const targetZoom = (typeof options.zoom === 'number' && options.zoom >= 4)
      ? options.zoom
      : (isSos ? 16 : 14);

    // Map centering
    this.map.flyTo([nLat, nLng], targetZoom, {
      duration: 1.5,
      easeLinearity: 0.5
    });

    // Automatically reveal the popup once the map flies to the coordinates (just like My Location)
    if (options.openPopup !== false) {
      const openPop = () => {
        if (this.locateMarker && this.map.hasLayer(this.locateMarker)) {
          this.locateMarker.openPopup();
        }
      };
      this.map.once('moveend', openPop);
      setTimeout(openPop, 1200);
    }

    return this.locateMarker;
  }

  clearLocatePointer() {
    if (this.locateMarker) {
      try {
        if (this.map && this.map.hasLayer(this.locateMarker)) {
          this.map.removeLayer(this.locateMarker);
        }
      } catch (e) {}
      this.locateMarker = null;
    }
    this._hasActiveLocate = false;
  }

  updateZoomVisibility() {
    if (!this.map) return;
    const currentZoom = this.map.getZoom();

    // Habitations clustering logic is now handled internally by L.markerClusterGroup.
    // The disableClusteringAtZoom option will automatically reveal markers at high zoom levels.
  }

  getMap() { return this.map; }
}

// Leaflet popup styles (injected dynamically in browser)
if (typeof document !== 'undefined') {
  const popupStyles = document.createElement('style');
  popupStyles.textContent = `
    .custom-popup .leaflet-popup-content-wrapper {
      background: rgba(255,255,255,0.98); backdrop-filter: blur(20px);
      border: 1px solid rgba(15,23,42,0.12); border-radius: 14px;
      padding: 0; box-shadow: 0 8px 32px rgba(0,0,0,0.15); color: #0F172A;
    }
    .custom-popup .leaflet-popup-tip-container { display: none; }
    .custom-popup .leaflet-popup-content { margin: 0; }
    .map-popup { min-width: 220px; }
    .popup-header { padding: 12px 14px 8px; border-bottom: 1px solid rgba(15,23,42,0.12); display: flex; align-items: center; gap: 8px; }
    .popup-name { font-size: 14px; font-weight: 700; color: #0F172A; }
    .popup-body { padding: 10px 14px 14px; }
    .popup-stat { display: flex; justify-content: space-between; align-items: center; font-size: 12px; color: #64748B; margin-bottom: 5px; }
    .popup-stat span { color: #475569; font-weight: 500; }
    .popup-stat strong { color: #0F172A; font-weight: 700; }
    .popup-desc { font-size: 12px; color: #334155; line-height: 1.5; margin-top: 8px; }
    .popup-amenities { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 8px; }
    .popup-amenities span { padding: 2px 8px; border-radius: 5px; font-size: 11px; font-weight: 600; background: rgba(34,197,94,0.1); border: 1px solid rgba(34,197,94,0.2); color: #15803d; }
    .hab-tooltip { background: rgba(255,255,255,0.95); border: 1px solid rgba(15,23,42,0.12); color: #0F172A; font-size: 12px; border-radius: 6px; padding: 4px 10px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); }
    
    /* Light Theme Popups */
    .custom-popup-light .leaflet-popup-content-wrapper {
      background: #FFFFFF;
      border: 1px solid rgba(15,23,42,0.12); border-radius: 14px;
      padding: 0; box-shadow: 0 8px 32px rgba(0,0,0,0.15); color: #0f172a;
    }
    .custom-popup-light .leaflet-popup-tip-container { display: none; }
    .custom-popup-light .leaflet-popup-content { margin: 0; }
    .custom-popup-light .popup-header { border-bottom: 1px solid rgba(15,23,42,0.08); }
    .custom-popup-light .popup-name { color: #0f172a; font-weight: 700; }
    .custom-popup-light .popup-stat { color: #475569; }
    .custom-popup-light .popup-stat strong { color: #0f172a; }

    /* Google Maps-style Location Pin & Ground Pulse */
    .locate-pin-div-icon {
      background: transparent !important;
      border: none !important;
    }
    .locate-pin-wrapper {
      position: relative;
      width: 32px;
      height: 42px;
      pointer-events: auto;
      cursor: pointer;
    }
    .locate-pin-head {
      position: relative;
      z-index: 2;
      transition: transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
    }
    .locate-pin-wrapper:hover .locate-pin-head {
      transform: translateY(-4px) scale(1.08);
    }
    .locate-pin-pulse {
      position: absolute;
      bottom: 0px;
      left: 16px;
      width: 24px;
      height: 12px;
      margin-left: -12px;
      margin-bottom: -6px;
      border-radius: 50%;
      background: radial-gradient(ellipse at center, var(--pin-color, #ef4444) 0%, rgba(239,68,68,0) 70%);
      animation: locatePing 1.8s cubic-bezier(0, 0, 0.2, 1) infinite;
      pointer-events: none;
      z-index: 1;
    }
    @keyframes locatePing {
      0% { transform: scale(0.6); opacity: 0.9; }
      75%, 100% { transform: scale(2.8); opacity: 0; }
    }
    .locate-popup-container {
      padding: 12px 14px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      color: #0f172a;
    }
    .locate-popup-top {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 6px;
    }
    .locate-badge {
      font-size: 10px;
      font-weight: 800;
      letter-spacing: 0.5px;
      padding: 2px 6px;
      border-radius: 4px;
      text-transform: uppercase;
    }
    .locate-pin-icon-tag {
      font-size: 14px;
    }
    .locate-popup-title {
      font-size: 14px;
      font-weight: 700;
      color: #0f172a;
      line-height: 1.3;
      margin-bottom: 4px;
    }
    .locate-popup-coords code {
      font-size: 11px;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      color: #64748b;
      background: #f1f5f9;
      padding: 2px 6px;
      border-radius: 4px;
      border: 1px solid #e2e8f0;
      display: inline-block;
      margin-bottom: 6px;
    }
    .locate-popup-desc {
      font-size: 12px;
      color: #334155;
      line-height: 1.45;
      margin-top: 4px;
    }
    .locate-popup-pop {
      font-size: 11.5px;
      color: #0284c7;
      margin-top: 6px;
      padding-top: 6px;
      border-top: 1px dashed #e2e8f0;
    }

    @keyframes float { 0%,100% { transform: translateY(0px); } 50% { transform: translateY(-4px); } }
    @keyframes pulse-ring { 0% { opacity: 0.8; transform: scale(0.8); } 80% { opacity: 0; transform: scale(2.2); } 100% { opacity: 0; } }
  `;
  document.head.appendChild(popupStyles);
}

// Utility to isolate overlay panels from capturing or chaining wheel zoom into the Leaflet map
function isolateMapOverlays(selectorsOrElements) {
  if (typeof L === 'undefined' || !L.DomEvent) return;
  const list = Array.isArray(selectorsOrElements) ? selectorsOrElements : [selectorsOrElements];
  list.forEach(item => {
    const el = typeof item === 'string' ? document.querySelector(item) : item;
    if (el) {
      try {
        L.DomEvent.disableScrollPropagation(el);
        L.DomEvent.disableClickPropagation(el);
        el.addEventListener('wheel', (e) => {
          e.stopPropagation();
        }, { passive: true });
      } catch (err) {
        // Safe fallback
      }
    }
  });
}

if (typeof window !== 'undefined') {
  window.isolateMapOverlays = isolateMapOverlays;
  window.DisasterMap = DisasterMap;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { DisasterMap, RISK_TIERS, RISK_COLORS, LAYER_CONFIG };
}

