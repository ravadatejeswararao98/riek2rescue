// ================================================================
// HAZARDS.JS — Hazard-Specific Intelligence Layers
// Each hazard carries: risk zones (red/orange/yellow/green),
// safe zones, live alerts, past disasters, affected habitations.
// ================================================================

const RISK_STYLE = {
  RED: {
    fill: '#ef4444',
    opacity: 0.38,
    stroke: '#ef4444',
    strokeOpacity: 0.95,
    label: 'CRITICAL',
    shortLabel: 'Critical',
    meaning: 'Ongoing/current hazard confirmed by live telemetry. Immediate danger core.',
    pulsing: true
  },
  ORANGE: {
    fill: '#f97316',
    opacity: 0.30,
    stroke: '#f97316',
    strokeOpacity: 0.85,
    label: 'HIGH ALERT',
    shortLabel: 'High Alert',
    meaning: 'Hazard estimated as imminent/high probability based on current conditions.',
    pulsing: false
  },
  YELLOW: {
    fill: '#eab308',
    opacity: 0.22,
    stroke: '#eab308',
    strokeOpacity: 0.75,
    label: 'MODERATE',
    shortLabel: 'Moderate',
    meaning: 'Elevated risk under monitoring corridor, not imminent.',
    pulsing: false
  },
  GREEN: {
    fill: '#22c55e',
    opacity: 0.16,
    stroke: '#22c55e',
    strokeOpacity: 0.65,
    label: 'LOW RISK',
    shortLabel: 'Low Risk',
    meaning: 'Verified low-risk perimeter and safe evacuation corridor.',
    pulsing: false
  }
};
if (typeof window !== 'undefined') {
  window.RISK_STYLE = RISK_STYLE;
}

const HAZARD_INTEL = {
  cyclone: {
    label: 'Cyclone', icon: '<i class="fi fi-rr-tornado" aria-hidden="true"></i>', iconClass: 'fi-rr-tornado', accent: '#ef4444',
    summary: 'Live telemetry and automated AI monitoring active.',
    zones: [],
    safeSites: [
      { name: 'Kakinada Port Relief Camp', lat: 16.9891, lng: 82.2475, capacity: 5000, current: 1240 },
      { name: 'Visakhapatnam Port Shelter', lat: 17.6868, lng: 83.2185, capacity: 4000, current: 890 },
      { name: 'Machilipatnam Cyclone Shelter', lat: 16.1875, lng: 81.1389, capacity: 3200, current: 640 }
    ],
    alerts: [],
    history: [
      { year: 2023, name: 'Cyclone Michaung', lat: 15.80, lng: 80.30, affected: 350000, note: 'Landfall Bapatla coast, AP' },
      { year: 2020, name: 'Cyclone Nivar',    lat: 14.44, lng: 80.00, affected: 180000, note: 'Severe damage in South AP' },
      { year: 2014, name: 'Cyclone Hudhud',   lat: 17.68, lng: 83.21, affected: 500000, note: 'Catastrophic impact Visakhapatnam' },
      { year: 1990, name: 'AP Super Cyclone', lat: 16.18, lng: 81.13, affected: 1000000, note: 'Historic Machilipatnam disaster' }
    ],
    habitations: [],
    hospitals: [
      { name: 'Kakinada Government General Hospital', lat: 16.9604, lng: 82.2381, beds: 450, trauma: true },
      { name: 'Visakhapatnam King George Hospital', lat: 17.7088, lng: 83.3056, beds: 1000, trauma: true },
      { name: 'Machilipatnam District Hospital', lat: 16.1820, lng: 81.1340, beds: 280, trauma: false }
    ]
  },

  flood: {
    label: 'Flood', icon: '<i class="fi fi-rr-water" aria-hidden="true"></i>', iconClass: 'fi-rr-water', accent: '#ef4444',
    summary: 'Live telemetry and automated AI monitoring active.',
    zones: [],
    safeSites: [
      { name: 'Rajahmundry Flood Relief Center', lat: 17.0005, lng: 81.8040, capacity: 6000, current: 1850 },
      { name: 'Vijayawada Indoor Stadium Shelter', lat: 16.5062, lng: 80.6480, capacity: 8000, current: 2100 },
      { name: 'Konaseema Delta Relief Hub', lat: 16.5500, lng: 81.9000, capacity: 3500, current: 980 }
    ],
    alerts: [],
    history: [
      { year: 2022, name: 'Godavari Deluge',   lat: 17.00, lng: 81.80, affected: 420000, note: 'Record discharge at Dowleswaram barrage' },
      { year: 2020, name: 'Krishna Flood',     lat: 16.51, lng: 80.65, affected: 250000, note: 'Prakasam barrage high flood discharge' },
      { year: 2009, name: 'Kurnool Megaflood', lat: 15.83, lng: 78.04, affected: 600000, note: 'Tungabhadra catastrophic backflow' }
    ],
    habitations: []
  },

  landslide: {
    label: 'Landslide', icon: '<i class="fi fi-rr-mountains" aria-hidden="true"></i>', iconClass: 'fi-rr-mountains', accent: '#f97316',
    summary: 'Live telemetry and automated AI monitoring active.',
    zones: [],
    safeSites: [
      { name: 'Araku Valley Relief Center', lat: 18.3273, lng: 82.8775, capacity: 2500, current: 180 },
      { name: 'Tirumala First Ghat Road Shelter', lat: 13.6750, lng: 79.3500, capacity: 3000, current: 220 }
    ],
    alerts: [],
    history: [
      { year: 2023, name: 'Araku Hill Slope Slip', lat: 18.33, lng: 82.88, affected: 1200, note: 'Ghat road rockfall and debris clearing' },
      { year: 2021, name: 'Tirumala Ghat Landslide', lat: 13.68, lng: 79.35, affected: 5000, note: 'Slope breach after heavy depression rain' }
    ],
    habitations: []
  },

  earthquake: {
    label: 'Earthquake', icon: '<i class="fi fi-rr-waveform-path" aria-hidden="true"></i>', iconClass: 'fi-rr-waveform-path', accent: '#f97316',
    summary: 'Live telemetry and automated AI monitoring active.',
    zones: [],
    safeSites: [
      { name: 'Vijayawada Civil Defense Ground', lat: 16.5100, lng: 80.6400, capacity: 5000, current: 400 },
      { name: 'Guntur Police Parade Ground', lat: 16.3000, lng: 80.4400, capacity: 4500, current: 200 }
    ],
    alerts: [],
    history: [
      { year: 2020, name: 'Prakasam Tremor M4.1', lat: 15.50, lng: 80.05, affected: 15000, note: 'Felt across Ongole and coastal fault lines' }
    ],
    habitations: []
  },

  tsunami: {
    label: 'Tsunami', icon: '<i class="fi fi-rr-wave" aria-hidden="true"></i>', iconClass: 'fi-rr-wave', accent: '#ef4444',
    summary: 'Live telemetry and automated AI monitoring active.',
    zones: [],
    safeSites: [
      { name: 'Visakhapatnam High Ground Evacuation Hub', lat: 17.7200, lng: 83.3100, capacity: 6000, current: 0 },
      { name: 'Machilipatnam Elevated Center', lat: 16.1900, lng: 81.1400, capacity: 3500, current: 0 }
    ],
    alerts: [],
    history: [
      { year: 2004, name: '2004 Indian Ocean Tsunami', lat: 15.90, lng: 80.47, affected: 250000, note: 'Catastrophic wave run-up along Nizampatnam, Machilipatnam, and Vizag coasts' }
    ],
    habitations: []
  },

  cloudburst: {
    label: 'Cloudburst', icon: '<i class="fi fi-rr-thunderstorm" aria-hidden="true"></i>', iconClass: 'fi-rr-thunderstorm', accent: '#f97316',
    summary: 'Live telemetry and automated AI monitoring active.',
    zones: [],
    safeSites: [
      { name: 'Alluri Sitharama Raju Relief Hub', lat: 17.9500, lng: 82.3500, capacity: 2000, current: 150 },
      { name: 'Paderu Agency Center', lat: 18.0833, lng: 82.6667, capacity: 1800, current: 90 }
    ],
    alerts: [],
    history: [
      { year: 2022, name: 'Eastern Ghats Agency Inundation', lat: 18.08, lng: 82.67, affected: 35000, note: 'Agency tract flash torrents' }
    ],
    habitations: []
  },

  erosion: {
    label: 'Coastal Erosion', icon: '<i class="fi fi-rr-island-tropical" aria-hidden="true"></i>', iconClass: 'fi-rr-island-tropical', accent: '#eab308',
    summary: 'Live telemetry and automated AI monitoring active.',
    zones: [],
    safeSites: [
      { name: 'Uppada Coastal Relocation Center', lat: 17.0900, lng: 82.3400, capacity: 3000, current: 520 },
      { name: 'Suryalanka Sea Wall Camp', lat: 15.8700, lng: 80.5300, capacity: 2200, current: 140 }
    ],
    alerts: [],
    history: [
      { year: 2023, name: 'Uppada Beach Road Inundation', lat: 17.08, lng: 82.33, affected: 12000, note: 'Severe sea erosion along Kakinada-Uppada coastal corridor' }
    ],
    habitations: []
  }
};
if (typeof window !== 'undefined') {
  window.HAZARD_INTEL = HAZARD_INTEL;
}

// ================================================================
// ORGANIC ZONE POLYGON GENERATOR (Choropleth / Terrain Contour)
// ================================================================
function generateOrganicZonePolygon(lat, lng, radiusMeters, name, hazardType = 'cyclone') {
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

  // Directional elongation depending on hazard physics:
  // Coastal (Cyclone, Tsunami, Erosion): stretches along coastline (NE-SW: ~45 deg)
  // Flood: stretches along river flow channel
  // Landslide: stretches along contour ridge
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

class HazardEngine {
  constructor(map) {
    this.map = map;
    this.group = L.layerGroup().addTo(map);
    this.revealedSafeSitesGroup = L.layerGroup().addTo(map);
    this.visible = { zones: true, safe: false, alerts: true, habitations: true, hospitals: true };
    this.activeKey = null;
    this.layerCache = {}; // Cache compiled Leaflet layers by hazard key
    this.timelineStep = 0; // 0=Now, 1=+3h, 2=+6h, 3=+12h, 4=+24h, 5=+48h
    this.renderedZoneLayers = [];
    this.aiState = null;
    this.isFetchingState = false;
    this.onStatsChange = null;

    // Trigger initial fetch of unified AI engine state
    this.loadAIEngineState();
  }

  async loadAIEngineState(force = false) {
    if (this.aiState && !force) return this.aiState;
    if (this.isFetchingState) return null;
    this.isFetchingState = true;
    try {
      const res = await fetch('/api/ai-engine/state');
      if (res.ok) {
        const data = await res.json();
        this.aiState = data;
        if (data.zonesByHazard) {
          Object.keys(data.zonesByHazard).forEach(key => {
            if (HAZARD_INTEL[key]) {
              HAZARD_INTEL[key].zones = data.zonesByHazard[key];
              HAZARD_INTEL[key].habitations = data.zonesByHazard[key].map(z => ({
                name: z.village_name || z.name,
                lat: z.lat,
                lng: z.lng,
                pop: z.pop || 0,
                risk: z.current_tier || z.level || 'GREEN',
                evacuated: false
              }));
            }
          });
        }
        if (data.alerts && data.alerts.length) {
          Object.keys(HAZARD_INTEL).forEach(key => {
            HAZARD_INTEL[key].alerts = data.alerts;
          });
        }
        if (data.situationalBrief && data.situationalBrief.text) {
          Object.keys(HAZARD_INTEL).forEach(key => {
            HAZARD_INTEL[key].summary = data.situationalBrief.text;
          });
        }
        this.invalidateCache();
        if (this.activeKey) {
          this.render(this.activeKey, true);
        }
        if (typeof window !== 'undefined' && typeof window.updateCitizenRiskBadge === 'function') {
          window.updateCitizenRiskBadge();
        }
        return data;
      }
    } catch (e) {
      console.warn('[HazardEngine] Could not load live AI engine state:', e.message);
    } finally {
      this.isFetchingState = false;
    }
    return null;
  }

  /**
   * Authority alert-to-zone synchronization:
   * Injects or force-escalates a zone at the exact declared location and tier,
   * rendering identically to any AI-engine-generated zone (same organic polygon,
   * concentric rings / land clipping, tier styling).
   */
  injectOrEscalateAuthorityZone(alert) {
    if (!alert) return null;

    const rawHazard = (alert.hazardType || alert.hazard_type || alert.type || alert.title || this.activeKey || 'cyclone').toLowerCase();
    let normHazard = 'cyclone';
    if (rawHazard.includes('flood') || rawHazard.includes('inundat')) normHazard = 'flood';
    else if (rawHazard.includes('landslide') || rawHazard.includes('slope') || rawHazard.includes('debris')) normHazard = 'landslide';
    else if (rawHazard.includes('earthquake') || rawHazard.includes('seismic')) normHazard = 'earthquake';
    else if (rawHazard.includes('cloudburst') || rawHazard.includes('squall')) normHazard = 'cloudburst';
    else if (rawHazard.includes('tsunami')) normHazard = 'tsunami';
    else if (rawHazard.includes('erosion')) normHazard = 'erosion';

    const rawTier = (alert.level || alert.severity || alert.tier || 'RED').toUpperCase();
    let targetTier = 'RED';
    if (rawTier.includes('CRIT') || rawTier.includes('RED') || rawTier === '4') targetTier = 'RED';
    else if (rawTier.includes('HIGH') || rawTier.includes('ORANGE') || rawTier === '3') targetTier = 'ORANGE';
    else if (rawTier.includes('MOD') || rawTier.includes('YELLOW') || rawTier.includes('ADVISORY') || rawTier === '2') targetTier = 'YELLOW';
    else if (rawTier.includes('SAFE') || rawTier.includes('GREEN') || rawTier === '1') targetTier = 'GREEN';

    const lat = Number(alert.lat != null ? alert.lat : alert.latitude);
    const lng = Number(alert.lng != null ? alert.lng : alert.longitude);
    if (isNaN(lat) || isNaN(lng)) return null;

    const radiusMeters = Number(alert.radius ? (alert.radius > 1000 ? alert.radius : alert.radius * 1000) : 28000);
    const zoneName = alert.zone || alert.area || alert.name || alert.title || `${normHazard.toUpperCase()} Warning Zone`;
    const message = alert.message || alert.desc || 'Official Emergency Directive Issued.';

    if (!HAZARD_INTEL[normHazard]) {
      HAZARD_INTEL[normHazard] = {
        label: normHazard.charAt(0).toUpperCase() + normHazard.slice(1),
        icon: '⚠️',
        accent: '#ef4444',
        summary: 'Live official emergency monitoring active.',
        zones: [],
        safeSites: [],
        alerts: []
      };
    }

    const zones = HAZARD_INTEL[normHazard].zones || (HAZARD_INTEL[normHazard].zones = []);

    const calcDist = (lat1, lng1, lat2, lng2) => {
      const R = 6371;
      const dLat = (lat2 - lat1) * Math.PI / 180;
      const dLng = (lng2 - lng1) * Math.PI / 180;
      const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180) * Math.cos(lat2*Math.PI/180) * Math.sin(dLng/2)**2;
      return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    };

    let existing = zones.find(z => {
      const zLat = z.epicenter ? z.epicenter.lat : z.lat;
      const zLng = z.epicenter ? z.epicenter.lng : z.lng;
      const zName = (z.name || z.village_name || '').toLowerCase();
      const targetName = zoneName.toLowerCase();
      if (zName && targetName && (zName.includes(targetName) || targetName.includes(zName))) return true;
      if (zLat == null || zLng == null) return false;
      return calcDist(lat, lng, zLat, zLng) <= 5;
    });

    if (existing) {
      existing.current_tier = targetTier;
      existing.level = targetTier;
      if (Array.isArray(existing.forecast_tier_by_hour)) {
        existing.forecast_tier_by_hour = [targetTier, targetTier, targetTier, targetTier, targetTier, targetTier];
      }
      existing.note = `OFFICIAL AUTHORITY ESCALATION: ${message}`;
      if (radiusMeters) {
        existing.baseRadius = radiusMeters;
        existing.radius = radiusMeters;
      }
    } else {
      existing = {
        id: `zone-auth-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        village_id: `auth-${Date.now()}`,
        name: zoneName,
        village_name: alert.zone || alert.area || zoneName,
        district: alert.district || 'Andhra Pradesh Sector',
        state: alert.state || 'Andhra Pradesh',
        hazardType: normHazard,
        lat: lat,
        lng: lng,
        baseRadius: radiusMeters,
        radius: radiusMeters,
        pop: alert.pop || 25000,
        current_tier: targetTier,
        level: targetTier,
        forecast_tier_by_hour: [targetTier, targetTier, targetTier, targetTier, targetTier, targetTier],
        note: `OFFICIAL AUTHORITY DECLARATION: ${message}`,
        isAuthorityDeclared: true
      };
      zones.push(existing);
    }

    // Sync into this.aiState as well if loaded
    if (this.aiState) {
      if (!this.aiState.zonesByHazard) this.aiState.zonesByHazard = {};
      if (!Array.isArray(this.aiState.zonesByHazard[normHazard])) this.aiState.zonesByHazard[normHazard] = [];
      const az = this.aiState.zonesByHazard[normHazard];
      const zIdx = az.findIndex(z => z.id === existing.id);
      if (zIdx >= 0) az[zIdx] = existing;
      else az.push(existing);

      if (Array.isArray(this.aiState.allZones)) {
        const allIdx = this.aiState.allZones.findIndex(z => z.id === existing.id);
        if (allIdx >= 0) this.aiState.allZones[allIdx] = existing;
        else this.aiState.allZones.push(existing);
      }
    }

    // Invalidate cache and re-render the map immediately
    this.invalidateCache(normHazard);
    const targetKey = (this.activeKey && HAZARD_INTEL[this.activeKey]) ? this.activeKey : normHazard;
    this.render(targetKey, true);

    // Sync to Firestore and Mesh
    if (window.firebaseLive && typeof window.firebaseLive.broadcastZoneCreation === 'function') {
      window.firebaseLive.broadcastZoneCreation(existing);
    }

    return existing;
  }

  injectOrEscalateZone(alert) {
    return this.injectOrEscalateAuthorityZone(alert);
  }

  setMap(newMap) {
    if (!newMap) return;
    if (this.group && this.map) {
      try { this.map.removeLayer(this.group); } catch (e) {}
    }
    if (this.revealedSafeSitesGroup && this.map) {
      try { this.map.removeLayer(this.revealedSafeSitesGroup); } catch (e) {}
    }
    this.map = newMap;
    this.group = L.layerGroup().addTo(newMap);
    this.revealedSafeSitesGroup = L.layerGroup().addTo(newMap);
    if (this.activeKey) {
      this.render(this.activeKey);
    }
  }

  invalidateCache(key = null) {
    if (key) {
      delete this.layerCache[key];
    } else {
      this.layerCache = {};
    }
  }

  setTimelineStep(stepIndex) {
    this.timelineStep = Math.max(0, Math.min(5, stepIndex));

    // Fully re-render the active hazard's zones for the new tier
    // This correctly transitions zones between merged green hulls and individual danger polygons
    if (this.activeKey) {
      this.invalidateCache(this.activeKey);
      this.render(this.activeKey, true);
    }

    if (typeof this.onStatsChange === 'function' && this.activeKey) {
      this.onStatsChange(this.stats(this.activeKey));
    }

    if (typeof window !== 'undefined' && typeof window.updateCitizenRiskBadge === 'function') {
      window.updateCitizenRiskBadge();
    }
  }

  render(key, force = false) {
    this.activeKey = key;
    const h = HAZARD_INTEL[key];
    if (!h) return null;

    this.group.clearLayers();
    this.renderedZoneLayers = [];

    // Fast-path: Reuse cached Leaflet layers if available and not forced
    if (!force && this.layerCache[key]) {
      const cached = this.layerCache[key];
      if (this.visible.zones && cached.zones) cached.zones.forEach(l => this.group.addLayer(l));
      if (this.visible.safe && cached.safe) cached.safe.forEach(l => this.group.addLayer(l));
      if (this.visible.alerts && cached.alerts) cached.alerts.forEach(l => this.group.addLayer(l));
      if (this.visible.habitations && cached.habitations) cached.habitations.forEach(l => this.group.addLayer(l));
      if (this.visible.hospitals && cached.hospitals) cached.hospitals.forEach(l => this.group.addLayer(l));
      return this.stats(key);
    }

    const bucket = {
      zones: [],
      safe: [],
      alerts: [],
      habitations: [],
      hospitals: []
    };

    const greenZoneData = [];    // Collect green zones for merging
    const dangerPolygons = [];   // Collect non-green polygons to carve out of green hull
    const tieredPolygons = { RED: [], ORANGE: [], YELLOW: [] }; // Collect danger polygons for smart union
    // 1. Dynamic GIS Hazard Zones (Derived directly from AI Engine live + forecast state)
    (h.zones || []).forEach(z => {
      const lat = z.epicenter ? z.epicenter.lat : z.lat;
      const lng = z.epicenter ? z.epicenter.lng : z.lng;
      const baseRadius = z.baseRadius || z.radius || 28000;
      const hazardType = z.hazardType || key;

      const currentTier = z.current_tier || z.level || 'GREEN';
      const activeTier = (this.timelineStep === 0)
        ? currentTier
        : (z.forecast_tier_by_hour?.[this.timelineStep] || currentTier);
      const s = RISK_STYLE[activeTier] || RISK_STYLE.GREEN;

      // ── GREEN zones: collect for merging into a single convex hull ──
      if (activeTier === 'GREEN' && typeof window !== 'undefined' && window.turf) {
        greenZoneData.push({ lat, lng, zone: z, hazard: h });

        // Still add the home icon marker for each green habitation
        const labelIcon = this.zoneLabelIcon({ ...z, level: activeTier });
        const labelMarker = L.marker([lat, lng], { icon: labelIcon, interactive: true });
        labelMarker.on('click', (ev) => {
          if (typeof window.openInspector === 'function') {
            L.DomEvent.stopPropagation(ev);
            window.openInspector(z, ev.latlng);
          }
        });
        bucket.zones.push(labelMarker);
        this.renderedZoneLayers.push({ labelMarker, zone: z, hazard: h, level: 'GREEN' });
        return; // Skip individual green polygon — will be merged below
      }

      // ── Non-green zones (RED / ORANGE / YELLOW): collect for union ──
      const polygonCoords = generateOrganicZonePolygon(lat, lng, baseRadius, z.name, hazardType);

      // Collect danger polygon geometry for carving out of the green hull later
      let dpPoly = null;
      if (typeof window !== 'undefined' && window.turf) {
        try {
          dpPoly = window.turf.polygon([polygonCoords]);
          dpPoly.properties = { level: activeTier, name: z.name, zone: z };
          dangerPolygons.push(dpPoly);
          if (tieredPolygons[activeTier]) {
            tieredPolygons[activeTier].push({ poly: dpPoly, zone: z, lat, lng, polygonCoords });
          }
        } catch (e) {}
      }

      const labelIcon = this.zoneLabelIcon({ ...z, level: activeTier });
      const labelMarker = L.marker([lat, lng], { icon: labelIcon, interactive: true });
      labelMarker.on('click', (ev) => {
        if (typeof window.openInspector === 'function') {
          L.DomEvent.stopPropagation(ev);
          window.openInspector(z, ev.latlng);
        }
      });
      bucket.zones.push(labelMarker);

      // Fallback: If Turf is missing, render individually immediately
      if (!window.turf || !dpPoly) {
        let geojsonFeature = {
          type: "Feature",
          properties: { name: z.name, level: activeTier },
          geometry: { type: "Polygon", coordinates: [polygonCoords] }
        };
        const s = RISK_STYLE[activeTier] || RISK_STYLE.RED;
        const polygonLayer = L.geoJSON(geojsonFeature, {
          style: () => ({
            fillColor: s.fill, fillOpacity: s.opacity || 0.28, color: s.stroke,
            weight: activeTier === 'RED' ? 2.6 : 1.8, opacity: s.strokeOpacity || 0.85,
            className: `hazard-polygon level-${activeTier.toLowerCase()}`
          })
        });
        bucket.zones.push(polygonLayer);
        this.renderedZoneLayers.push({ polygonLayer, labelMarker, zone: z, hazard: h, level: activeTier });
      } else {
        this.renderedZoneLayers.push({ labelMarker, zone: z, hazard: h, level: activeTier });
      }
    });

    // ── Smart Overlay for Non-Green Zones (No Darkening, Preserve Shape) ──
    ['RED', 'ORANGE', 'YELLOW'].forEach(tier => {
      const polys = tieredPolygons[tier];
      if (!polys || polys.length === 0) return;

      const s = RISK_STYLE[tier] || RISK_STYLE.RED;
      const paneName = `hazardFillPane-${tier}`;
      
      // Create a custom pane for this tier's fills to prevent opacity stacking
      if (this.map && !this.map.getPane(paneName)) {
        this.map.createPane(paneName);
        this.map.getPane(paneName).style.opacity = s.opacity || 0.28;
        // Keep it above the base map, but below markers
        this.map.getPane(paneName).style.zIndex = 390; 
      }

      // Convert the polygons back into a standard FeatureCollection
      const featureCollection = {
         type: "FeatureCollection",
         features: polys.map(p => {
            let finalGeom = p.poly.geometry;
            // Strict Andhra Pradesh Boundary Clipping
            if (window.APBoundaryService && window.APBoundaryService.isReady()) {
              try {
                const clipped = window.APBoundaryService.clipPolygon(p.poly);
                if (clipped && clipped.geometry) {
                  finalGeom = clipped.geometry;
                } else {
                  return null; // Completely outside AP
                }
              } catch(e) {
                console.warn('[HazardEngine] Danger zone AP boundary clipping failed', e);
              }
            }
            return {
              type: "Feature",
              properties: { level: tier },
              geometry: finalGeom
            };
         }).filter(f => f !== null)
      };

      // 1. Render Fills: Opaque fills inside a translucent pane (No Stack Darkening!)
      if (this.map) {
        const fillLayer = L.geoJSON(featureCollection, {
          pane: paneName,
          style: () => ({
            fillColor: s.fill,
            fillOpacity: 1.0, // 100% inside the pane, but the pane itself is 28%
            stroke: false,
            className: `hazard-polygon-fill level-${tier.toLowerCase()}`
          }),
          interactive: false
        });
        bucket.zones.push(fillLayer);
      }

      // 2. Render Strokes: Normal overlay pane so borders stay crisp and visible
      const strokeLayer = L.geoJSON(featureCollection, {
        style: () => ({
          fill: false,
          color: s.stroke,
          weight: tier === 'RED' ? 2.6 : 1.8,
          opacity: s.strokeOpacity || 0.85,
          className: `hazard-polygon-stroke level-${tier.toLowerCase()}`
        }),
        interactive: false
      });
      bucket.zones.push(strokeLayer);
    });

    // ── Merge all GREEN zones into a single convex hull polygon ──
    let greenLayer = null;
    if (greenZoneData.length > 2 && typeof window !== 'undefined' && window.turf) {
      try {
        const greenPts = greenZoneData.map(g => window.turf.point([g.lng, g.lat]));
        let greenHull = window.turf.convex(window.turf.featureCollection(greenPts));
        if (greenHull) {
          // Buffer outward by 5 km so the hull fully encloses the habitation areas
          greenHull = window.turf.buffer(greenHull, 5, { units: 'kilometers' });

          // 1. Clip against land boundary FIRST so green zone stays on land before carving
          if (window.LandBoundaryService && window.LandBoundaryService.clipPolygonCoords) {
            try {
              const coords = greenHull.geometry.coordinates;
              const outerRing = greenHull.geometry.type === 'MultiPolygon'
                ? coords[0][0] : coords[0];
              const clipped = window.LandBoundaryService.clipPolygonCoords(outerRing, {
                name: `Merged_Safe_Zone_${greenZoneData.length}_pts`, hazardType: 'cyclone',
                lat: greenZoneData[0].lat, lng: greenZoneData[0].lng, radiusMeters: 50000
              });
              if (clipped && clipped.coordinates) {
                greenHull = {
                  type: 'Feature',
                  properties: greenHull.properties || {},
                  geometry: clipped
                };
              }
            } catch (clipErr) {}
          }

          // 1.5 Clip strictly to Andhra Pradesh operational boundary
          if (window.APBoundaryService && window.APBoundaryService.isReady()) {
            try {
              const clippedAP = window.APBoundaryService.clipPolygon(greenHull);
              if (clippedAP && clippedAP.geometry) {
                greenHull = clippedAP;
              } else {
                greenHullValid = false;
              }
            } catch (apClipErr) {
              console.warn('[HazardEngine] Green hull AP boundary clipping failed', apClipErr);
            }
          }

          // 2. Carve out (subtract) each danger zone with a 2km buffer so red/yellow/orange never overlap green
          // Doing this after land clipping ensures all carved holes & cutouts are fully preserved!
          let greenHullValid = true;

          for (let i = 0; i < dangerPolygons.length; i++) {
            const dp = dangerPolygons[i];
            const dpName = dp?.properties?.name || `Danger Zone #${i + 1}`;
            let carvedResult = null;
            let carveSuccess = false;

            const bufferedDanger = (typeof window.turf.buffer === 'function')
              ? (window.turf.buffer(dp, 2, { units: 'kilometers' }) || dp)
              : dp;

            // 1. Primary difference: 2-arg difference with 2km buffered danger (Turf v5/v6)
            try {
              carvedResult = window.turf.difference(greenHull, bufferedDanger);
              carveSuccess = true;
            } catch (e1) {
              // 2. Fallback: try FeatureCollection format (Turf v7+) or per-polygon MultiPolygon difference
              try {
                carvedResult = window.turf.difference(
                  window.turf.featureCollection([greenHull, bufferedDanger])
                );
                carveSuccess = true;
              } catch (e2) {
                // If MultiPolygon, difference each component polygon
                if (greenHull && greenHull.geometry && greenHull.geometry.type === 'MultiPolygon') {
                  try {
                    const polys = greenHull.geometry.coordinates.map(c => window.turf.polygon(c));
                    const remaining = [];
                    polys.forEach(p => {
                      try {
                        const subDiff = window.turf.difference(p, bufferedDanger);
                        if (subDiff) remaining.push(subDiff);
                      } catch (subErr) {
                        remaining.push(p);
                      }
                    });
                    if (remaining.length > 0) {
                      carvedResult = (remaining.length === 1) ? remaining[0] : {
                        type: 'Feature',
                        properties: greenHull.properties || {},
                        geometry: {
                          type: 'MultiPolygon',
                          coordinates: remaining.map(p => p.geometry.type === 'MultiPolygon' ? p.geometry.coordinates[0] : p.geometry.coordinates)
                        }
                      };
                      carveSuccess = true;
                    }
                  } catch (e3) {
                    console.error('[HazardEngine] Failed to carve danger zone from green hull:', dpName, e3);
                    carveSuccess = false;
                  }
                } else {
                  console.error('[HazardEngine] Failed to carve danger zone from green hull:', dpName, e2);
                  carveSuccess = false;
                }
              }
            }

            if (!carveSuccess) {
              // Primary and fallback both failed
              let doesIntersect = true;
              try {
                if (typeof window.turf.booleanIntersects === 'function') {
                  doesIntersect = window.turf.booleanIntersects(greenHull, dp);
                }
              } catch (intErr) {
                doesIntersect = true;
              }

              if (doesIntersect) {
                console.warn(`[HazardEngine] Carving failed and danger zone "${dpName}" intersects green hull. Skipping green hull for this render pass to prevent visual overlap.`);
                greenHullValid = false;
                break;
              }
            } else {
              if (carvedResult) {
                greenHull = carvedResult;
              } else {
                // Difference returned null, meaning green hull was completely consumed
                console.log(`[HazardEngine] Green hull fully consumed by danger zone: ${dpName}`);
                greenHull = null;
                break;
              }
            }
          }

          if (greenHull && greenHullValid) {
            const gs = RISK_STYLE.GREEN;
            greenLayer = L.geoJSON(greenHull, {
              style: () => ({
                fillColor: gs.fill,
                fillOpacity: 0.14,
                color: gs.stroke,
                weight: 2,
                opacity: 0.7,
                dashArray: '6 4',
                className: 'hazard-polygon level-green merged-safe-zone'
              }),
              interactive: false
            });

            bucket.zones.unshift(greenLayer);  // Add FIRST in array so it renders behind danger zones
            this.renderedZoneLayers.push({ polygonLayer: greenLayer, geojson: greenHull, zone: { level: 'GREEN', name: 'Andhra Pradesh Safe Perimeter' }, hazard: h, level: 'GREEN' });
          } else if (!greenHullValid) {
            console.warn('[HazardEngine] Green hull omitted due to carving failure against danger zones.');
          }
        }
      } catch (e) {
        console.warn('[HazardManager] Failed to merge green zones into hull:', e);
      }
    }

    // Add all zone layers to this.group in strictly controlled z-order:
    // Green hull first (lowest), danger polygons next, label markers on top
    if (this.visible.zones) {
      bucket.zones.forEach(l => {
        if (!this.group.hasLayer(l)) {
          this.group.addLayer(l);
        }
      });
      // Defensive z-order enforcement
      if (greenLayer && typeof greenLayer.bringToBack === 'function') {
        greenLayer.bringToBack();
      }
      this.renderedZoneLayers.forEach(item => {
        if (item.polygonLayer && item.polygonLayer !== greenLayer && typeof item.polygonLayer.bringToFront === 'function') {
          item.polygonLayer.bringToFront();
        }
      });
    }

    // 2. Designated Safe Shelters
    (h.safeSites || []).forEach((s, idx) => {
      if (window.APBoundaryService && !window.APBoundaryService.isPointInside([s.lng, s.lat])) return;
      const free = s.capacity - s.current;
      const marker = L.marker([s.lat, s.lng], { icon: this.shelterIcon(idx * 40) })
        .bindPopup(this.popup('Safe Zone', 'green', s.name, [
          ['Capacity', s.capacity.toLocaleString()],
          ['Occupancy', `${s.current.toLocaleString()} (${Math.round((s.current / s.capacity) * 100)}%)`],
          ['Available beds', free.toLocaleString()],
          ['Resources', s.resources ? s.resources.join(', ') : 'Medical, Water, Power']
        ], 'Designated cyclone / flood multi-purpose safe shelter.'), { className: 'custom-popup' });
      bucket.safe.push(marker);
      if (this.visible.safe) this.group.addLayer(marker);
    });

    // 3. Live Sensor Threat Warnings / Alerts
    (h.alerts || []).forEach((a, i) => {
      if (!a.lat || !a.lng || !Number.isFinite(Number(a.lat)) || !Number.isFinite(Number(a.lng))) {
        return; // Do not fabricate map geometry for alerts lacking valid coordinates
      }
      const coords = [Number(a.lat), Number(a.lng)];
      if (window.APBoundaryService && !window.APBoundaryService.isPointInside([coords[1], coords[0]])) return;
      const color = a.level === 'CRITICAL' ? 'red' : a.level === 'HIGH' ? 'orange' : 'yellow';
      const marker = L.marker(coords, { icon: this.alertIcon(color, i * 40) })
        .bindPopup(this.popup('Live Warning', color, a.title, [
          ['Severity', a.level],
          ['Area', a.area],
          ['Issued', a.time]
        ], 'Real-time alert propagated from IMD/NDMA early-warning grid.'), { className: 'custom-popup' });
      bucket.alerts.push(marker);
      if (this.visible.alerts) this.group.addLayer(marker);
    });

    // 4. At-Risk Habitations
    let habCluster = null;
    if (h.habitations && h.habitations.length > 0) {
      habCluster = L.markerClusterGroup({
        maxClusterRadius: 70,
        disableClusteringAtZoom: 11
      });

      h.habitations.forEach((hab, i) => {
        if (window.APBoundaryService && !window.APBoundaryService.isPointInside([hab.lng || hab.lon, hab.lat])) return;
        
        // Turf dynamic risk check vs rendered non-green danger polygons for THIS hazard
        let computedRisk = 'GREEN';
        if (typeof window.turf !== 'undefined' && dangerPolygons.length > 0) {
          const pt = window.turf.point([hab.lng || hab.lon, hab.lat]);
          let maxRank = 0;
          const rankMap = { 'GREEN': 1, 'YELLOW': 2, 'ORANGE': 3, 'RED': 4 };
          
          dangerPolygons.forEach(dp => {
            if (window.turf.booleanPointInPolygon(pt, dp)) {
              const dpRank = rankMap[dp.properties?.level || 'RED'];
              if (dpRank > maxRank) {
                maxRank = dpRank;
                computedRisk = dp.properties?.level || 'RED';
              }
            }
          });
        }
        hab.risk = computedRisk;
        
        const riskColors = { RED:'#ef4444', ORANGE:'#f97316', YELLOW:'#eab308', GREEN:'#22c55e' };
        const col = riskColors[hab.risk] || '#94a3b8';

        const marker = L.circleMarker([hab.lat, hab.lng || hab.lon], {
          radius: 4,
          color: '#ffffff',
          weight: 1.5,
          fillColor: col,
          fillOpacity: 0.95
        })
          .bindPopup(`
            <div class="map-popup light-theme">
              <div class="popup-header">
                <span class="risk-badge" style="background:${hab.risk==='RED'?'#fef2f2':hab.risk==='ORANGE'?'#fff7ed':hab.risk==='YELLOW'?'#fefce8':'#f0fdf4'}; color:${hab.risk==='RED'?'#b91c1c':hab.risk==='ORANGE'?'#c2410c':hab.risk==='YELLOW'?'#a16207':'#15803d'}; border:1px solid ${col}66; font-weight:700;">${hab.risk} RISK</span>
                <span class="popup-name" style="color:#0f172a; font-weight:700;">${hab.name}</span>
              </div>
              <div class="popup-body" style="background:#ffffff; color:#334155;">
                <div class="popup-stat" style="color:#475569;"><span>Population:</span><strong style="color:#0f172a;">${(hab.pop || hab.growth_adjusted_pop || 0).toLocaleString()}</strong></div>
                <div class="popup-stat" style="color:#475569;"><span>Status:</span><strong style="color:#0f172a;">${hab.evacuated ? 'Evacuated' : 'In Place'}</strong></div>
                <div class="popup-stat" style="color:#475569;"><span>Immediate Threat:</span><strong style="color:#0f172a;">${hab.risk === 'GREEN' ? 'None' : h.label}</strong></div>
              </div>
            </div>
          `, { className: 'custom-popup-light' });
        
        habCluster.addLayer(marker);
      });
      
      bucket.habitations.push(habCluster);
      if (this.visible.habitations) this.group.addLayer(habCluster);
    }

    // 6. Emergency Hospitals & Trauma Centers
    if (h.hospitals) {
      h.hospitals.forEach((hosp, i) => {
        const marker = L.marker([hosp.lat, hosp.lng], { icon: this.hospitalIcon(i * 35) })
          .bindPopup(this.popup('Emergency Care', 'red', hosp.name, [
            ['Total Beds', hosp.beds.toLocaleString()],
            ['Trauma Care', hosp.trauma ? 'Level 1 Trauma Available' : 'Basic Emergency Unit']
          ], 'Designated primary receiving hospital for disaster casualties.'), { className: 'custom-popup' });
        bucket.hospitals.push(marker);
        if (this.visible.hospitals) this.group.addLayer(marker);
      });
    }

    // Apply active status visibility filter if one is active
    if (typeof window !== 'undefined' && window.currentHazardStatusFilter && window.currentHazardStatusFilter !== 'ALL') {
      const status = window.currentHazardStatusFilter;
      this.renderedZoneLayers.forEach(item => {
        const zTier = (item.level || (item.zone && (item.zone.level || item.zone.current_tier)) || '').toUpperCase();
        let matches = true;
        if (status === 'Active') {
          matches = (zTier === 'RED' || zTier === 'CRITICAL');
        } else if (status === 'Monitoring') {
          matches = (zTier === 'YELLOW' || zTier === 'ORANGE' || zTier === 'MODERATE' || zTier === 'HIGH' || zTier === 'HIGH ALERT');
        } else if (status === 'Normal') {
          matches = (zTier === 'GREEN' || zTier === 'SAFE' || zTier === 'LOW RISK');
        }
        const poly = item.polygonLayer;
        const marker = item.labelMarker;
        if (!matches) {
          if (poly && this.group.hasLayer(poly)) this.group.removeLayer(poly);
          if (marker && this.group.hasLayer(marker)) this.group.removeLayer(marker);
        }
      });
    }

    this.layerCache[key] = bucket;
    return this.stats(key);
  }

  setVisibility(part, on) {
    this.visible[part] = on;
    if (this.activeKey) this.render(this.activeKey);
  }

  stats(key) {
    const h = HAZARD_INTEL[key];
    if (!h) return { label: '', redZones: 0, atRisk: 0, shelter: 0 };
    const step = this.timelineStep || 0;
    const zones = h.zones || [];
    const atRisk = zones.reduce((sum, z) => {
      const tier = (step === 0) ? (z.current_tier || z.level) : (z.forecast_tier_by_hour?.[step] || z.current_tier || z.level);
      if (tier === 'RED' || tier === 'ORANGE') return sum + (z.pop || 0);
      return sum;
    }, 0);
    const redZones = zones.filter(z => {
      const tier = (step === 0) ? (z.current_tier || z.level) : (z.forecast_tier_by_hour?.[step] || z.current_tier || z.level);
      return tier === 'RED';
    }).length;
    const shelter = h.safeSites ? h.safeSites.reduce((a, s) => a + (s.capacity - s.current), 0) : 0;
    const focusZone = zones[0];
    const focus = focusZone ? { lat: focusZone.lat, lng: focusZone.lng, ...focusZone } : null;
    return {
      label: h.label, icon: h.icon, accent: h.accent, summary: h.summary,
      redZones,
      atRisk, shelter,
      alerts: h.alerts, history: h.history, habitations: h.habitations,
      focus
    };
  }

  zonePopup(s, z, h, stepIndex = 0) {
    const currentTier = z.current_tier || z.level || 'GREEN';
    const activeTier = (stepIndex === 0) ? currentTier : (z.forecast_tier_by_hour?.[stepIndex] || currentTier);
    const tierStyle = RISK_STYLE[activeTier] || s;
    const levelClass = activeTier.toLowerCase();
    const tierName = tierStyle.label || activeTier;

    const stepLabels = ['Now (Live Telemetry)', '+3h Forecast', '+6h Forecast', '+12h Projected Peak', '+24h Forward', '+48h Horizon'];
    const currentStepLabel = stepLabels[stepIndex] || 'Live';

    const seriesItem = z.forecast_series?.[stepIndex];
    const windDisplay = seriesItem ? `${seriesItem.gustKmh} km/h (peak gusts)` : (z.current_telemetry ? `${z.current_telemetry.windGustKmh} km/h` : '38 km/h');
    const pressureDisplay = seriesItem ? `${seriesItem.pressureHpa} hPa` : (z.current_telemetry ? `${z.current_telemetry.pressureHpa} hPa` : '1008 hPa');

    return `
      <div class="map-popup zone-unified-popup">
        <div class="popup-header">
          <div class="popup-tier-chip tier-${levelClass}">
            <span class="chip-dot"></span>
            <span class="chip-label">${tierName}</span>
          </div>
          <span class="popup-name">${z.name}</span>
        </div>
        <div class="popup-meaning-bar tier-${levelClass}">
          <strong>${currentStepLabel}:</strong> ${tierStyle.meaning}
        </div>
        <div class="popup-body">
          <div class="popup-stat"><span>Timeline State</span><strong>${currentStepLabel}</strong></div>
          <div class="popup-stat"><span>Current Live Obs</span><strong style="color:${(RISK_STYLE[currentTier]||{}).fill||'#22c55e'};">${currentTier}</strong></div>
          <div class="popup-stat"><span>Timeline Step Tier</span><strong style="color:${tierStyle.fill};">${activeTier}</strong></div>
          <div class="popup-stat"><span>Wind / Gust</span><strong>${windDisplay}</strong></div>
          <div class="popup-stat"><span>Atmospheric Pressure</span><strong>${pressureDisplay}</strong></div>
          <div class="popup-stat"><span>People in Zone</span><strong>${(z.pop || 0).toLocaleString()}</strong></div>
          ${z.satellite ? `
          <div class="popup-stat"><span>NASA FIRMS Active Fires</span><strong>${z.satellite.activeHotspotCount > 0 ? `${z.satellite.activeHotspotCount} spot(s) (${z.satellite.maxFrpMw} MW)` : '0 detected (VIIRS)'}</strong></div>
          <div class="popup-stat"><span>Sentinel Flood Inundation</span><strong>${z.satellite.floodExpansionPct > 0 ? `+${z.satellite.floodExpansionPct}% (${z.satellite.floodRiskStatus})` : 'Normal'}</strong></div>
          ` : ''}
          ${z.disaster_recurrence && z.disaster_recurrence.reasoning ? `
          <div class="popup-desc" style="margin-top:6px; background:rgba(234,179,8,0.08); border-left:3px solid #eab308; padding:5px 8px; border-radius:3px; color:#fde047; font-size:11px;">
            <strong>Historical Recurrence Risk:</strong> ${z.disaster_recurrence.reasoning}
          </div>` : ''}
          <div class="popup-desc" style="margin-top:6px;">${z.note || 'Dynamic habitation zone derived from live telemetry & Census baseline.'}</div>
        </div>
      </div>
    `;
  }

  popup(badge, badgeClass, title, rows, note) {
    return `
      <div class="map-popup">
        <div class="popup-header">
          <span class="risk-badge risk-${badgeClass}">${badge}</span>
          <span class="popup-name">${title}</span>
        </div>
        <div class="popup-body">
          ${rows.map(([k, v]) => `<div class="popup-stat"><span>${k}</span><strong>${v}</strong></div>`).join('')}
          <div class="popup-desc">${note}</div>
        </div>
      </div>`;
  }

  zoneLabelIcon(z) {
    const col = z.level === 'RED' ? '#ef4444' : z.level === 'ORANGE' ? '#f97316' : z.level === 'YELLOW' ? '#eab308' : '#22c55e';
    return L.divIcon({
      html: `<div style="width:10px; height:10px; border-radius:50%; background-color:${col}; border:2px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.4);"></div>`,
      className: '',
      iconSize: [10, 10],
      iconAnchor: [5, 5]
    });
  }

  shelterIcon(delayMs = 0) {
    return L.divIcon({
      html: `
        <div class="map-poi-pin poi-shelter" style="--drop-delay:${delayMs}ms;" title="Evacuation Shelter">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            <polyline points="9 12 11 14 15 10"/>
          </svg>
        </div>
      `,
      className: '',
      iconSize: [24, 24],
      iconAnchor: [12, 12]
    });
  }

  revealedShelterIcon(delayMs = 0) {
    return L.divIcon({
      html: `
        <div class="map-poi-pin poi-shelter safe-site-revealed" style="--drop-delay:${delayMs}ms;" title="Designated Safe Shelter">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            <polyline points="9 12 11 14 15 10"/>
          </svg>
        </div>
      `,
      className: '',
      iconSize: [28, 28],
      iconAnchor: [14, 14]
    });
  }

  calcDistanceKm(a1, b1, a2, b2) {
    const R = 6371, dLat = (a2 - a1) * Math.PI / 180, dLng = (b2 - b1) * Math.PI / 180;
    const x = Math.sin(dLat / 2) ** 2 + Math.cos(a1 * Math.PI / 180) * Math.cos(a2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(x));
  }

  revealSafeSitesNear(lat, lng, radiusKm = 120) {
    if (!this.revealedSafeSitesGroup) {
      this.revealedSafeSitesGroup = L.layerGroup().addTo(this.map);
    }
    this.revealedSafeSitesGroup.clearLayers();

    const h = HAZARD_INTEL[this.activeKey || 'cyclone'];
    if (!h || !h.safeSites) return [];

    const withDist = h.safeSites.map(s => ({
      ...s,
      distanceKm: this.calcDistanceKm(lat, lng, s.lat, s.lng)
    })).sort((a, b) => a.distanceKm - b.distanceKm);

    const nearby = withDist.filter(s => s.distanceKm <= radiusKm);
    const sitesToRender = nearby.length > 0 ? nearby : withDist.slice(0, 3);

    sitesToRender.forEach((s, idx) => {
      const free = s.capacity - s.current;
      const marker = L.marker([s.lat, s.lng], {
        icon: this.revealedShelterIcon(idx * 50)
      }).bindPopup(this.popup('Designated Safe Shelter', 'green', s.name, [
        ['Distance', `${s.distanceKm.toFixed(1)} km away`],
        ['Available Beds', free.toLocaleString()],
        ['Total Capacity', s.capacity.toLocaleString()],
        ['Occupancy', `${s.current.toLocaleString()} (${Math.round((s.current / s.capacity) * 100)}%)`],
        ['Coordinates', `${s.lat.toFixed(4)}° N, ${s.lng.toFixed(4)}° E`]
      ], 'Registered multi-purpose civil evacuation shelter.'), { className: 'custom-popup' });

      s._marker = marker;
      this.revealedSafeSitesGroup.addLayer(marker);
    });

    return sitesToRender;
  }

  hideRevealedSafeSites() {
    if (this.revealedSafeSitesGroup) {
      this.revealedSafeSitesGroup.clearLayers();
    }
  }



  alertIcon(level, delayMs = 0) {
    const col = level === 'CRITICAL' ? '#ef4444' : level === 'HIGH' ? '#f97316' : level === 'MODERATE' ? '#eab308' : '#22c55e';
    return L.divIcon({
      html: `<div class="alert-pin" style="--pin:${col}; --drop-delay:${delayMs}ms;"><span>!</span></div>`,
      className: '', iconSize: [24, 24], iconAnchor: [12, 12]
    });
  }

  hospitalIcon(delayMs = 0) {
    return L.divIcon({
      html: `<div class="map-poi-pin poi-hospital" style="--drop-delay:${delayMs}ms;" title="Emergency Hospital / Trauma Care">H</div>`,
      className: '',
      iconSize: [22, 22],
      iconAnchor: [11, 11]
    });
  }

  renderLiveEarthquakes(earthquakes) {
    if (!earthquakes || !Array.isArray(earthquakes)) return;
    earthquakes.forEach(eq => {
      const color = eq.mag >= 5.5 ? '#ef4444' : eq.mag >= 4.5 ? '#f97316' : '#eab308';
      const size = Math.min(36, Math.max(18, Math.round(eq.mag * 5.2)));
      const icon = L.divIcon({
        className: '',
        html: `
          <div class="usgs-live-marker" style="--eq-color:${color}; width:${size}px; height:${size}px;" title="M${eq.mag.toFixed(1)} - ${eq.place}">
            <span class="eq-pulse"></span>
            <span style="font-size:${size > 24 ? '10px' : '9px'}; font-weight:800;">${eq.mag.toFixed(1)}</span>
          </div>
        `,
        iconSize: [size, size],
        iconAnchor: [size / 2, size / 2]
      });

      const dateStr = new Date(eq.epochMs).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) + ' IST';
      const popupHtml = `
        <div class="map-popup">
          <div class="popup-header">
            <span class="risk-badge risk-${eq.mag >= 5.0 ? 'red' : 'orange'}">USGS Live (M${eq.mag.toFixed(1)})</span>
            <span class="popup-name">${eq.place}</span>
          </div>
          <div class="popup-body">
            <div class="popup-stat"><span>Magnitude</span><strong>M ${eq.mag.toFixed(1)}</strong></div>
            <div class="popup-stat"><span>Depth</span><strong>${eq.depthKm} km</strong></div>
            <div class="popup-stat"><span>Coordinates</span><strong>${eq.lat.toFixed(2)}° N, ${eq.lng.toFixed(2)}° E</strong></div>
            <div class="popup-stat"><span>Recorded</span><strong>${dateStr}</strong></div>
            <div class="popup-stat"><span>Tsunami Watch</span><strong>${eq.tsunamiAlert ? '⚠️ ALERT ACTIVE' : 'None'}</strong></div>
            <div class="popup-desc" style="margin-top:8px;">
              <div style="font-size:10px; color:#38bdf8; margin-bottom:6px; font-weight:600;">Data Source: USGS Earthquake Hazards Program</div>
              <a href="${eq.url}" target="_blank" rel="noopener noreferrer" style="display:inline-block; padding:4px 8px; border-radius:4px; background:#2563eb; color:#ffffff; text-decoration:none; font-size:11px; font-weight:600;">View Official USGS Record ↗</a>
            </div>
          </div>
        </div>
      `;

      L.marker([eq.lat, eq.lng], { icon })
        .bindPopup(popupHtml, { className: 'custom-popup' })
        .addTo(this.group);
    });
  }
}

if (typeof window !== 'undefined') {
  window.HazardEngine = HazardEngine;
}

// ================================================================
// CANONICAL ZONE STATUS & POINT-IN-POLYGON RESOLUTION ENGINE
// Single Source of Truth for Zone Status across Search & Maps
// ================================================================

function _hazardDistanceKm(a1, b1, a2, b2) {
  const R = 6371;
  const dLat = (a2 - a1) * Math.PI / 180;
  const dLng = (b2 - b1) * Math.PI / 180;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(a1 * Math.PI / 180) * Math.cos(a2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

function _pointInPolygonCoords(point, vs) {
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

function checkPointInsideGeometry(ptLng, ptLat, geomOrFeature) {
  if (!geomOrFeature) return false;
  if (typeof window !== 'undefined' && window.turf && typeof window.turf.booleanPointInPolygon === 'function') {
    try {
      const pt = window.turf.point([ptLng, ptLat]);
      return window.turf.booleanPointInPolygon(pt, geomOrFeature);
    } catch (e) {}
  }
  const geom = geomOrFeature.geometry || geomOrFeature;
  if (!geom || !geom.coordinates) return false;
  const pt = [ptLng, ptLat];
  if (geom.type === 'Polygon') {
    return _pointInPolygonCoords(pt, geom.coordinates[0]);
  } else if (geom.type === 'MultiPolygon') {
    return geom.coordinates.some(poly => _pointInPolygonCoords(pt, poly[0]));
  }
  return false;
}

function getZoneForCoordinates(lat, lng) {
  const nLat = Number(lat);
  const nLng = Number(lng);
  if (!Number.isFinite(nLat) || !Number.isFinite(nLng) || isNaN(nLat) || isNaN(nLng)) {
    return {
      level: 'GREEN',
      status: 'NORMAL',
      label: 'NORMAL / GREEN',
      color: '#22c55e',
      badgeBg: 'rgba(34, 197, 94, 0.15)',
      badgeColor: '#15803d',
      badgeBorder: 'rgba(34, 197, 94, 0.35)',
      zone: null,
      source: 'default'
    };
  }

  const rankMap = {
    'RED': 4, 'CRITICAL': 4,
    'ORANGE': 3, 'HIGH': 3,
    'YELLOW': 2, 'MODERATE': 2, 'MONITORING': 2, 'ADVISORY': 2,
    'GREEN': 1, 'NORMAL': 1, 'SAFE': 1, 'LOW': 1
  };

  let maxRank = 0;
  let bestLevel = null;
  let bestZone = null;
  let bestSource = null;

  const considerZone = (rawLevel, zoneObj, source) => {
    if (!rawLevel) return;
    let normLevel = String(rawLevel).toUpperCase();
    if (normLevel.includes('RED') || normLevel.includes('CRIT')) normLevel = 'RED';
    else if (normLevel.includes('ORANGE') || normLevel.includes('HIGH')) normLevel = 'ORANGE';
    else if (normLevel.includes('YELLOW') || normLevel.includes('MODERATE') || normLevel.includes('MONITOR')) normLevel = 'YELLOW';
    else normLevel = 'GREEN';

    const rank = rankMap[normLevel] || 1;
    if (rank > maxRank) {
      maxRank = rank;
      bestLevel = normLevel;
      bestZone = zoneObj;
      bestSource = source;
    }
  };

  // 1. Check visually rendered polygons in HazardEngine (The active map hazard polygons)
  const engine = (typeof window !== 'undefined') ? (window.hazardEngine || window.authHazardEngine) : null;
  if (engine && Array.isArray(engine.renderedZoneLayers)) {
    engine.renderedZoneLayers.forEach(rz => {
      const z = rz.zone;
      const zLevel = rz.level || z?.current_tier || z?.level;
      if (rz.geojson && checkPointInsideGeometry(nLng, nLat, rz.geojson)) {
        considerZone(zLevel, z, 'rendered_geojson');
      } else if (rz.polygonLayer && typeof rz.polygonLayer.toGeoJSON === 'function') {
        try {
          const gj = rz.polygonLayer.toGeoJSON();
          const features = gj.type === 'FeatureCollection' ? gj.features : [gj];
          for (const f of features) {
            if (checkPointInsideGeometry(nLng, nLat, f)) {
              considerZone(zLevel, z, 'rendered_layer');
              break;
            }
          }
        } catch (e) {}
      }
    });
  }

  // 2. Check DisasterMap.hazardPolygons (if present)
  const mapInst = (typeof window !== 'undefined') ? (window.authMapInstance || window.disasterMap) : null;
  if (mapInst && Array.isArray(mapInst.hazardPolygons)) {
    mapInst.hazardPolygons.forEach(hp => {
      if (checkPointInsideGeometry(nLng, nLat, hp.polygon)) {
        considerZone(hp.level, hp, 'map_hazard_polygon');
      }
    });
  }

  // 3. Check all active HAZARD_INTEL zones
  if (typeof HAZARD_INTEL !== 'undefined') {
    Object.values(HAZARD_INTEL).forEach(h => {
      if (Array.isArray(h.zones)) {
        h.zones.forEach(z => {
          const zLat = z.epicenter ? z.epicenter.lat : z.lat;
          const zLng = z.epicenter ? z.epicenter.lng : z.lng;
          const baseRadius = z.baseRadius || z.radius || 28000;
          const zLevel = z.current_tier || z.level || 'GREEN';

          if (typeof generateOrganicZonePolygon === 'function' && typeof zLat === 'number' && typeof zLng === 'number') {
            try {
              const polyCoords = generateOrganicZonePolygon(zLat, zLng, baseRadius, z.name, z.hazardType || 'cyclone');
              if (_pointInPolygonCoords([nLng, nLat], polyCoords)) {
                considerZone(zLevel, z, 'hazard_intel_organic_polygon');
                return;
              }
            } catch (e) {}
          }

          if (typeof zLat === 'number' && typeof zLng === 'number') {
            const d = _hazardDistanceKm(nLat, nLng, zLat, zLng);
            if (d * 1000 <= baseRadius * 1.1) {
              considerZone(zLevel, z, 'hazard_intel_radius');
            }
          }
        });
      }
    });
  }

  // 4. Check APP_DATA.riskZones
  if (typeof APP_DATA !== 'undefined' && Array.isArray(APP_DATA.riskZones)) {
    APP_DATA.riskZones.forEach(rz => {
      // Check exact polygon geometry if available (e.g. from live sensor feeds)
      const rawPoly = (rz.geometry && Array.isArray(rz.geometry.coordinates) && rz.geometry.coordinates[0]) ||
                      (Array.isArray(rz.polygon) && rz.polygon) ||
                      (Array.isArray(rz.coordinates) && rz.coordinates);
      if (Array.isArray(rawPoly) && rawPoly.length >= 3) {
        try {
          if (_pointInPolygonCoords([nLng, nLat], rawPoly)) {
            considerZone(rz.level || rz.current_tier || 'RED', rz, 'app_data_risk_zone_polygon');
            return;
          }
        } catch (e) {}
      }

      if (typeof rz.lat === 'number' && typeof rz.lng === 'number') {
        const d = _hazardDistanceKm(nLat, nLng, rz.lat, rz.lng);
        const radiusMeters = rz.radius || 28000;
        if (d * 1000 <= radiusMeters * 1.1) {
          considerZone(rz.level || rz.current_tier, rz, 'app_data_risk_zone');
        }
      }
    });
  }

  // 5. Check APP_DATA.habitations (for known habitations with pre-configured risk)
  if (typeof APP_DATA !== 'undefined' && Array.isArray(APP_DATA.habitations)) {
    APP_DATA.habitations.forEach(hab => {
      const hLng = hab.lng || hab.lon;
      if (typeof hab.lat === 'number' && typeof hLng === 'number') {
        const d = _hazardDistanceKm(nLat, nLng, hab.lat, hLng);
        if (d <= 8) {
          considerZone(hab.risk, hab, 'app_data_habitation');
        }
      }
    });
  }

  const finalLevel = bestLevel || 'GREEN';
  let statusText = 'NORMAL';
  let color = '#22c55e';
  let badgeText = '🟢 GREEN / NORMAL';
  let badgeBg = 'rgba(34, 197, 94, 0.15)';
  let badgeColor = '#15803d';
  let badgeBorder = 'rgba(34, 197, 94, 0.35)';

  if (finalLevel === 'RED') {
    statusText = 'RED ZONE';
    color = '#ef4444';
    badgeText = '🔴 RED RISK';
    badgeBg = 'rgba(239, 68, 68, 0.15)';
    badgeColor = '#dc2626';
    badgeBorder = 'rgba(239, 68, 68, 0.35)';
  } else if (finalLevel === 'ORANGE') {
    statusText = 'HIGH ALERT';
    color = '#f97316';
    badgeText = '🟠 ORANGE RISK';
    badgeBg = 'rgba(249, 115, 22, 0.15)';
    badgeColor = '#ea580c';
    badgeBorder = 'rgba(249, 115, 22, 0.35)';
  } else if (finalLevel === 'YELLOW') {
    statusText = 'MONITORING';
    color = '#eab308';
    badgeText = '🟡 YELLOW RISK';
    badgeBg = 'rgba(234, 179, 8, 0.18)';
    badgeColor = '#a16207';
    badgeBorder = 'rgba(234, 179, 8, 0.4)';
  }

  return {
    level: finalLevel,
    status: statusText,
    label: badgeText,
    color: color,
    badgeBg: badgeBg,
    badgeColor: badgeColor,
    badgeBorder: badgeBorder,
    zone: bestZone,
    source: bestSource,
    outsideZones: !bestZone
  };
}

// ================================================================
// CANONICAL LOCATION CLASSIFICATION & SEARCH RANKING ENGINE
// Authoritatively prioritizes true geographic entities over POIs/roads
// ================================================================

function classifyLocationType(item) {
  if (!item) return { tier: 4, type: 'Location' };

  const rawType = (item.type || item.addresstype || item.class || '').toLowerCase();
  const rawCategory = (item.category || item.source || '').toLowerCase();
  const rawName = (item.name || '').toLowerCase();
  const rawSub = (item.subtitle || item.region || '').toLowerCase();

  // Tier 1: Major administrative / geographic places (Cities, Towns, Villages, Mandals, Districts)
  const isMajorPlace =
    rawType === 'city' || rawType === 'town' || rawType === 'village' ||
    rawType === 'municipality' || rawType === 'locality' || rawType === 'mandal' ||
    rawType === 'district' || rawType === 'state' || rawType === 'county' ||
    rawType === 'administrative' || rawType === 'island' ||
    item.class === 'boundary' ||
    (item.class === 'place' && !['house', 'building', 'postcode', 'amenity'].includes(rawType));

  if (isMajorPlace) {
    let displayType = 'City / Locality';
    if (rawType === 'district' || rawSub.includes('district')) displayType = 'District';
    else if (rawType === 'mandal' || rawSub.includes('mandal')) displayType = 'Mandal';
    else if (rawType === 'village' || rawType.includes('village')) displayType = 'Village';
    else if (rawType === 'city') displayType = 'City';
    else if (rawType === 'town') displayType = 'Town';
    return { tier: 1, type: item.type && item.type !== 'OpenStreetMap' ? item.type : displayType };
  }

  // Tier 2: Sub-localities, Habitations, Sub-zones, Neighborhoods
  const isSubLocality =
    rawType === 'suburb' || rawType === 'neighbourhood' || rawType === 'neighborhood' ||
    rawType === 'quarter' || rawType === 'hamlet' || rawType === 'residential' ||
    rawType.includes('habitation') || rawCategory.includes('habitation') ||
    rawType.includes('sub-zone') || rawSub.includes('slum') || rawName.includes('slum');

  if (isSubLocality) {
    return { tier: 2, type: item.type || 'Locality / Habitation' };
  }

  // Tier 3: Emergency & Hazard facilities (Shelters, Relief Camps, Evacuation Hubs, Hospitals, Hazard Zones)
  const isEmergency =
    rawType.includes('shelter') || rawType.includes('relief') || rawType.includes('camp') ||
    rawType.includes('evacuation') || rawType.includes('hazard') || rawType.includes('danger') ||
    rawType.includes('hospital') || rawName.includes('relief camp') || rawName.includes('shelter') ||
    rawSub.includes('shelter') || rawSub.includes('relief');

  if (isEmergency) {
    let displayType = 'Civil Shelter';
    if (rawName.includes('relief camp') || rawSub.includes('relief')) displayType = 'Relief Camp';
    else if (rawType.includes('hospital') || rawName.includes('hospital')) displayType = 'Emergency Hospital';
    else if (rawType.includes('hazard') || rawType.includes('danger')) displayType = 'Hazard Zone';
    return { tier: 3, type: item.type || displayType };
  }

  // Tier 4: General POIs, Amenities, Institutions, Commercial
  const isPOI =
    item.class === 'amenity' || item.class === 'tourism' || item.class === 'leisure' ||
    item.class === 'shop' || item.class === 'office' || item.class === 'commercial' ||
    rawType.includes('school') || rawType.includes('college') || rawType.includes('university') ||
    rawType.includes('bank') || rawType.includes('temple') || rawType.includes('church') ||
    rawType.includes('mosque') || rawType.includes('hotel') || rawType.includes('restaurant');

  if (isPOI) {
    return { tier: 4, type: item.type || 'Point of Interest' };
  }

  // Tier 5: Roads, Streets, Highways, Transit
  const isRoadOrTransit =
    item.class === 'highway' || item.class === 'railway' ||
    ['road', 'street', 'highway', 'motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'path', 'track', 'railway', 'station', 'bus_stop', 'stop'].includes(rawType);

  if (isRoadOrTransit) {
    return { tier: 5, type: item.type || 'Road / Transit' };
  }

  return { tier: 4, type: item.type || 'Address / Landmark' };
}

function computeSearchRank(item, query) {
  if (!item) return 9999;
  const q = (query || '').toLowerCase().trim();
  if (!q) return 9999;

  const rawName = (item.name || '').toLowerCase().trim();
  const rawSub = (item.subtitle || item.region || item.district || '').toLowerCase().trim();
  const nameWords = rawName.split(/[\s,.-]+/).filter(Boolean);
  const qWords = q.split(/[\s,.-]+/).filter(Boolean);

  const classification = classifyLocationType(item);
  const tier = classification.tier; // 1 to 5

  // 1. Exact match with whole query: Tier 1 (10), Tier 2 (20), Tier 3 (30), Tier 4 (40), Tier 5 (50)
  if (rawName === q) {
    return (tier * 10);
  }

  // Check query words match
  const allQWordsInName = qWords.every(qw => rawName.includes(qw));
  const allQWordsInItem = qWords.every(qw => rawName.includes(qw) || rawSub.includes(qw));

  // If user searched multiple words, and an item doesn't contain the query words, penalize heavily
  if (!allQWordsInItem && !rawName.includes(q)) {
    return 2000 + (tier * 100);
  }

  let matchScore = 0;

  if (nameWords.length > 0 && nameWords[0] === q) {
    // First word is exact query (e.g. "Delhi, India" for "delhi", "Kakinada Urban" for "kakinada")
    matchScore = 20;
  } else if (rawName.startsWith(q)) {
    // Starts with query string (e.g. "Amalapuram" for "amala", "Hyderabad" for "hyd")
    matchScore = 30;
  } else if (nameWords.some(w => w === q)) {
    // Any word is exact match (e.g. "New Delhi" for "delhi")
    matchScore = 40;
  } else if (nameWords.some(w => w.startsWith(q))) {
    // Any word starts with query (e.g. "North Delhi" for "del")
    matchScore = 50;
  } else if (rawName.includes(q)) {
    // Name contains query
    matchScore = 60;
  } else if (allQWordsInName) {
    // All query words appear in name in different positions
    matchScore = 70;
  } else if (rawSub.includes(q)) {
    // Subtitle / region contains query
    matchScore = 90;
  } else {
    matchScore = 150;
  }

  const lengthPenalty = Math.min(rawName.length * 0.2, 10);
  return (tier * 100) + matchScore + lengthPenalty;
}

if (typeof window !== 'undefined') {
  window.getZoneForCoordinates = getZoneForCoordinates;
  window.determineZoneStatusForPoint = getZoneForCoordinates;
  window.classifyLocationType = classifyLocationType;
  window.computeSearchRank = computeSearchRank;
  if (window.HazardEngine) {
    window.HazardEngine.getZoneForPoint = getZoneForCoordinates;
    window.HazardEngine.classifyLocationType = classifyLocationType;
    window.HazardEngine.computeSearchRank = computeSearchRank;
  }
}
if (typeof global !== 'undefined') {
  global.getZoneForCoordinates = getZoneForCoordinates;
  global.classifyLocationType = classifyLocationType;
  global.computeSearchRank = computeSearchRank;
}

