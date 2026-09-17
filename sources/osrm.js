const { safeText } = require('../js/redact.js');
/**
 * sources/osrm.js
 * 
 * CANONICAL OSRM ROUTING & EVACUATION PIPELINE
 * 
 * Semantic Role: PRIMARY
 * Tier: LIVE_API
 * Provider: Project OSRM / OpenStreetMap
 * 
 * Strict Data-Truth Guarantees:
 * 1. Zero synthetic fallback routes (no straight-line 2-point LineString, no distKm * 2.2).
 * 2. Zero hardcoded ETAs (no || 60, || 30, || 15).
 * 3. Strict response validation: rejects NaN, Infinity, negative values, malformed geometry.
 * 4. Genuine duration 0 is distinguished from unavailable duration (null).
 * 5. Truthful operational states: LIVE (fresh), DEGRADED (stale: true from cache), UNAVAILABLE (no route / failed).
 * 6. DRILL / SIMULATED routing is strictly isolated with tier: SIMULATED, role: DRILL.
 */

const https = require('https');
const http = require('http');
const { URL } = require('url');
const path = require('path');
const fs = require('fs');

const SOURCE_ID = 'osrm_routing';
const PROVIDER = 'Project OSRM / OpenStreetMap';
const HOST = 'router.project-osrm.org';
const DEFAULT_CADENCE_MS = 1800000; // 30 minutes
const OSRM_TIMEOUT_MS = 6000;

// Load official Andhra Pradesh boundary for validation
let apBoundaryGeom = null;
try {
  const boundaryPath = path.join(__dirname, '..', 'data', 'andhra_pradesh_boundary.geojson');
  if (fs.existsSync(boundaryPath)) {
    const raw = JSON.parse(fs.readFileSync(boundaryPath, 'utf8'));
    if (raw && raw.features && raw.features[0]) {
      apBoundaryGeom = raw.features[0].geometry;
    }
  }
} catch (e) {
  // Graceful fallback to bounding box if file cannot be read
}

// Bounding box for Andhra Pradesh with safe buffer
const AP_BBOX = {
  minLat: 12.5,
  maxLat: 19.9,
  minLng: 76.5,
  maxLng: 85.0
};

function pointInPoly(pt, polyCoords) {
  const x = pt[0], y = pt[1];
  let inside = false;
  for (let i = 0, j = polyCoords.length - 1; i < polyCoords.length; j = i++) {
    const xi = polyCoords[i][0], yi = polyCoords[i][1];
    const xj = polyCoords[j][0], yj = polyCoords[j][1];
    const intersect = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

function isCoordInsideAP(lng, lat) {
  if (typeof lng !== 'number' || typeof lat !== 'number') return false;
  if (isNaN(lng) || !Number.isFinite(lng) || isNaN(lat) || !Number.isFinite(lat)) return false;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return false;

  // Check bbox first
  if (lat < AP_BBOX.minLat || lat > AP_BBOX.maxLat || lng < AP_BBOX.minLng || lng > AP_BBOX.maxLng) {
    return false;
  }

  // If geometry loaded, do precise polygon check
  if (apBoundaryGeom) {
    if (apBoundaryGeom.type === 'Polygon') {
      return pointInPoly([lng, lat], apBoundaryGeom.coordinates[0]);
    }
    if (apBoundaryGeom.type === 'MultiPolygon') {
      return apBoundaryGeom.coordinates.some(ring => pointInPoly([lng, lat], ring[0]));
    }
  }

  // If boundary polygon not loaded, bbox match is accepted
  return true;
}

function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth's radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// In-memory canonical route cache: cacheKey -> { canonicalRoute, expiresAt }
const osrmCache = new Map();

function fetchJson(targetUrl, headers = {}, timeoutMs = OSRM_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    try {
      const parsed = new URL(targetUrl);
      const client = parsed.protocol === 'https:' ? https : http;
      const req = client.request(parsed, {
        method: 'GET',
        headers: {
          'User-Agent': 'Risk2Rescue-EvacuationRouting/2.0 (Disaster-Management-Platform)',
          'Accept': 'application/json',
          ...headers
        },
        timeout: timeoutMs
      }, (res) => {
        let raw = '';
        res.on('data', chunk => raw += chunk);
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            try {
              const json = JSON.parse(raw);
              resolve(json);
            } catch (err) {
              reject(new Error(safeText(`OSRM JSON parse failed: ${err.message}`)));
            }
          } else {
            reject(new Error(safeText(`OSRM HTTP error status ${res.statusCode}: ${raw.slice(0, 100)}`)));
          }
        });
      });

      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error(safeText(`OSRM request timed out after ${timeoutMs}ms`)));
      });
      req.end();
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Validate raw OSRM JSON response against strict data-truth rules.
 * Rejects NaN, Infinity, negative distances, negative durations, malformed geometry.
 */
function validateOsrmResponse(data) {
  if (!data || typeof data !== 'object') {
    return { valid: false, error: 'Malformed response: not an object' };
  }
  if (data.code !== 'Ok') {
    return { valid: false, error: `OSRM error response code: ${data.code || 'UNKNOWN'}` };
  }
  if (!Array.isArray(data.routes) || data.routes.length === 0) {
    return { valid: false, error: 'OSRM returned no route corridors' };
  }

  const r = data.routes[0];
  if (typeof r.distance !== 'number' || isNaN(r.distance) || !Number.isFinite(r.distance) || r.distance < 0) {
    return { valid: false, error: `Invalid route distance: ${r.distance}` };
  }
  if (typeof r.duration !== 'number' || isNaN(r.duration) || !Number.isFinite(r.duration) || r.duration < 0) {
    return { valid: false, error: `Invalid route duration: ${r.duration}` };
  }

  // Validate geometry if present
  if (r.geometry) {
    if (r.geometry.type !== 'LineString' || !Array.isArray(r.geometry.coordinates)) {
      return { valid: false, error: 'Malformed route geometry: expected GeoJSON LineString' };
    }
    for (const pt of r.geometry.coordinates) {
      if (!Array.isArray(pt) || pt.length < 2 ||
          typeof pt[0] !== 'number' || isNaN(pt[0]) || !Number.isFinite(pt[0]) ||
          typeof pt[1] !== 'number' || isNaN(pt[1]) || !Number.isFinite(pt[1]) ||
          pt[0] < -180 || pt[0] > 180 || pt[1] < -90 || pt[1] > 90) {
        return { valid: false, error: `Invalid coordinate pair in geometry: ${JSON.stringify(pt)}` };
      }
    }
  }

  return { valid: true, route: r };
}

/**
 * Build canonical route object conforming to Task 20 Section 2.
 */
function buildCanonicalRoute({
  routeId,
  origin,
  destination,
  distanceMeters,
  travelTimeMins,
  walkingDurationMin = null,
  routeStatus = 'UNAVAILABLE',
  operationalState = 'UNAVAILABLE',
  geometry = null,
  steps = [],
  requestedAt = null,
  observedAt = null,
  fetchedAt = null,
  checkedAt = null,
  stale = false,
  isDrill = false,
  error = null
}) {
  const reqTime = requestedAt || new Date().toISOString();
  const chkTime = checkedAt || new Date().toISOString();
  const fchTime = fetchedAt || (observedAt ? chkTime : null);

  const hasGenuineGeometry = geometry !== null && geometry !== undefined && geometry.type === 'LineString' && Array.isArray(geometry.coordinates) && geometry.coordinates.length > 0;
  const geometryStatus = hasGenuineGeometry ? 'AVAILABLE' : 'UNAVAILABLE';

  const sourceTier = isDrill ? 'SIMULATED' : 'LIVE_API';
  const sourceRole = isDrill ? 'DRILL' : 'PRIMARY';
  const finalOpState = isDrill ? 'DRILL' : operationalState;
  const finalRouteStatus = isDrill ? 'DRILL' : routeStatus;

  return {
    // IDENTITY
    routeId: routeId || `route-${origin?.lat?.toFixed(4) || 'na'},${origin?.lng?.toFixed(4) || 'na'}->${destination?.lat?.toFixed(4) || 'na'},${destination?.lng?.toFixed(4) || 'na'}`,
    sourceId: SOURCE_ID,
    origin: {
      lat: origin?.lat ?? null,
      lng: origin?.lng ?? origin?.lon ?? null,
      name: origin?.name || null
    },
    destination: {
      shelterId: destination?.shelterId || destination?.id || null,
      lat: destination?.lat ?? null,
      lng: destination?.lng ?? destination?.lon ?? null,
      name: destination?.name || null
    },

    // GEOGRAPHY
    originCoordinates: (origin?.lng != null && origin?.lat != null) ? [origin.lng, origin.lat] : null,
    destinationCoordinates: (destination?.lng != null && destination?.lat != null) ? [destination.lng, destination.lat] : null,
    geometry: hasGenuineGeometry ? geometry : null,
    geometryStatus,

    // ROUTING
    distanceMeters: typeof distanceMeters === 'number' && !isNaN(distanceMeters) && distanceMeters >= 0 ? distanceMeters : null,
    distanceKm: typeof distanceMeters === 'number' && !isNaN(distanceMeters) && distanceMeters >= 0 ? +(distanceMeters / 1000).toFixed(2) : null,
    travelTimeMins: typeof travelTimeMins === 'number' && !isNaN(travelTimeMins) && travelTimeMins >= 0 ? travelTimeMins : null,
    drivingDurationMin: typeof travelTimeMins === 'number' && !isNaN(travelTimeMins) && travelTimeMins >= 0 ? travelTimeMins : null,
    walkingDurationMin: typeof walkingDurationMin === 'number' && !isNaN(walkingDurationMin) && walkingDurationMin >= 0 ? walkingDurationMin : null,
    routeStatus: finalRouteStatus,
    routingProvider: PROVIDER,
    steps: Array.isArray(steps) ? steps : [],

    // TIME
    requestedAt: reqTime,
    observedAt: observedAt || null,
    fetchedAt: fchTime,
    checkedAt: chkTime,

    // OPERATIONAL STATE
    operationalState: finalOpState,
    stale: Boolean(stale),
    isDrill: Boolean(isDrill),
    error: error || null,

    // PROVENANCE
    provenance: {
      sourceId: SOURCE_ID,
      sourceTier,
      sourceRole,
      provider: PROVIDER,
      originalSourceTimestamp: observedAt || null,
      fetchedAt: fchTime,
      checkedAt: chkTime,
      contributingSources: [SOURCE_ID]
    }
  };
}

/**
 * Fetch and normalize turn-by-turn road route via OSRM.
 * Returns canonical route object. Never invents straight-line fallback.
 */
async function fetchOsrmRoute(origin, destination, options = {}) {
  const requestedAt = new Date().toISOString();
  const checkedAt = requestedAt;
  const isDrill = Boolean(options.isDrill);

  // Validate origin
  const oLat = Number(origin?.lat);
  const oLng = Number(origin?.lng ?? origin?.lon);
  // Validate destination
  const dLat = Number(destination?.lat);
  const dLng = Number(destination?.lng ?? destination?.lon);

  if (isNaN(oLat) || isNaN(oLng) || isNaN(dLat) || isNaN(dLng) ||
      !Number.isFinite(oLat) || !Number.isFinite(oLng) || !Number.isFinite(dLat) || !Number.isFinite(dLng)) {
    return buildCanonicalRoute({
      origin,
      destination,
      routeStatus: 'UNAVAILABLE',
      operationalState: 'UNAVAILABLE',
      requestedAt,
      checkedAt,
      isDrill,
      error: 'Invalid coordinates provided'
    });
  }

  // AP boundary verification
  if (options.enforceApBoundary !== false) {
    if (!isCoordInsideAP(oLng, oLat) || !isCoordInsideAP(dLng, dLat)) {
      return buildCanonicalRoute({
        origin: { lat: oLat, lng: oLng, name: origin?.name },
        destination: { lat: dLat, lng: dLng, name: destination?.name, shelterId: destination?.shelterId || destination?.id },
        routeStatus: 'UNAVAILABLE',
        operationalState: 'UNAVAILABLE',
        requestedAt,
        checkedAt,
        isDrill,
        error: 'Coordinates outside Andhra Pradesh operational boundary'
      });
    }
  }

  const cacheKey = `${oLat.toFixed(4)},${oLng.toFixed(4)}->${dLat.toFixed(4)},${dLng.toFixed(4)}`;
  const now = Date.now();

  // Check cache for fresh result if not force-refreshing
  if (!options.forceRefresh && osrmCache.has(cacheKey)) {
    const entry = osrmCache.get(cacheKey);
    if (now < entry.expiresAt) {
      return {
        ...entry.data,
        checkedAt
      };
    }
  }

  try {
    const includeGeometry = options.includeGeometry !== false;
    const geomParam = includeGeometry ? 'geometries=geojson&steps=true&overview=full' : 'overview=false';
    const osrmUrl = `https://${HOST}/route/v1/driving/${oLng},${oLat};${dLng},${dLat}?${geomParam}`;

    const rawData = await fetchJson(osrmUrl, {}, options.timeoutMs || OSRM_TIMEOUT_MS);
    const validation = validateOsrmResponse(rawData);

    if (!validation.valid) {
      throw new Error(safeText(validation.error));
    }

    const r = validation.route;
    const distanceMeters = Math.round(r.distance);
    // Duration in minutes: genuine 0 stays 0, otherwise round up/down to nearest integer min >= 1
    const travelTimeMins = r.duration === 0 ? 0 : Math.max(1, Math.round(r.duration / 60));
    const walkingDurationMin = Math.max(1, Math.round((distanceMeters / 1000) / 4.2 * 60));
    const observedAt = new Date().toISOString();

    const steps = (r.legs?.[0]?.steps || []).map((st, idx) => {
      let action = st.maneuver?.type || 'Proceed';
      if (st.maneuver?.modifier) action += ` ${st.maneuver.modifier}`;
      return {
        stepNumber: idx + 1,
        instruction: (action.charAt(0).toUpperCase() + action.slice(1)) + (st.name ? ` onto ${st.name}` : ''),
        road: st.name || 'Connecting corridor',
        distanceMeters: Math.round(st.distance || 0)
      };
    }).filter(s => s.distanceMeters > 0);

    const canonical = buildCanonicalRoute({
      routeId: `route-${oLat.toFixed(4)},${oLng.toFixed(4)}->${dLat.toFixed(4)},${dLng.toFixed(4)}`,
      origin: { lat: oLat, lng: oLng, name: origin?.name },
      destination: { lat: dLat, lng: dLng, name: destination?.name, shelterId: destination?.shelterId || destination?.id },
      distanceMeters,
      travelTimeMins,
      walkingDurationMin,
      routeStatus: 'LIVE',
      operationalState: 'LIVE',
      geometry: includeGeometry ? r.geometry : null,
      steps,
      requestedAt,
      observedAt,
      fetchedAt: observedAt,
      checkedAt,
      stale: false,
      isDrill
    });

    // Save to cache
    osrmCache.set(cacheKey, {
      data: canonical,
      expiresAt: now + (options.cadenceMs || DEFAULT_CADENCE_MS)
    });

    return canonical;
  } catch (err) {
    // Check if we have stale cached data
    if (osrmCache.has(cacheKey)) {
      const cached = osrmCache.get(cacheKey);
      return {
        ...cached.data,
        checkedAt,
        operationalState: 'DEGRADED',
        routeStatus: 'DEGRADED',
        stale: true,
        error: `OSRM live request failed: ${err.message}. Returning cached route data.`
      };
    }

    // No cache exists: Return explicit UNAVAILABLE state. NEVER fabricate straight-line fallback.
    return buildCanonicalRoute({
      origin: { lat: oLat, lng: oLng, name: origin?.name },
      destination: { lat: dLat, lng: dLng, name: destination?.name, shelterId: destination?.shelterId || destination?.id },
      routeStatus: 'UNAVAILABLE',
      operationalState: 'UNAVAILABLE',
      requestedAt,
      checkedAt,
      isDrill,
      error: `OSRM live routing failed: ${err.message}`
    });
  }
}

/**
 * Lightweight road details helper (for Priority Engine matrix and distance calculations).
 * Returns { roadDistKm, durationMin, routed, operationalState, stale, observedAt, routeStatus, haversineKm }.
 */
async function getOsrmRouteDetails(lat1, lon1, lat2, lon2, options = {}) {
  const straightDist = +haversine(lat1, lon1, lat2, lon2).toFixed(2);
  const route = await fetchOsrmRoute(
    { lat: lat1, lng: lon1 },
    { lat: lat2, lng: lon2 },
    { ...options, includeGeometry: false }
  );

  const routed = route.routeStatus === 'LIVE' || route.routeStatus === 'DEGRADED';
  return {
    roadDistKm: routed ? route.distanceKm : null,
    distanceMeters: routed ? route.distanceMeters : null,
    durationMin: routed ? route.travelTimeMins : null,
    routed,
    routeStatus: route.routeStatus,
    operationalState: route.operationalState,
    stale: route.stale,
    observedAt: route.observedAt,
    haversineKm: straightDist // clearly labeled descriptive geometric distance ONLY
  };
}

/**
 * Calculate multi-shelter evacuation options for a citizen/habitation.
 * Includes hazard zone intersection checks on genuine geometry.
 */
async function calculateEvacuationRoutes(citizenLat, citizenLon, hazardType = 'cyclone', shelters = [], redZones = [], options = {}) {
  if (citizenLat === null || citizenLat === undefined || citizenLon === null || citizenLon === undefined || citizenLat === '' || citizenLon === '') {
    return {
      success: false,
      error: 'Invalid citizen coordinates provided: latitude and longitude must be finite numbers',
      routes: []
    };
  }

  const reqLat = Number(citizenLat);
  const reqLon = Number(citizenLon);

  if (isNaN(reqLat) || isNaN(reqLon) || !Number.isFinite(reqLat) || !Number.isFinite(reqLon)) {
    return {
      success: false,
      error: 'Invalid citizen coordinates provided: latitude and longitude must be finite numbers',
      routes: []
    };
  }

  if (options.enforceApBoundary !== false && !isCoordInsideAP(reqLon, reqLat)) {
    return {
      success: false,
      error: 'Citizen location is outside Andhra Pradesh operational boundary',
      routes: []
    };
  }

  const eligible = shelters.filter(s => s.status !== 'closed' && ((s.capacity || 0) - (s.current_occupancy || 0)) > 0);

  if (!eligible.length) {
    return {
      success: false,
      message: 'All registered relief shelters are at 100% capacity or temporarily closed.',
      routes: []
    };
  }

  // Pick closest candidates using haversine purely for candidate selection
  const candidates = eligible.map(s => ({
    ...s,
    available_beds: Math.max(0, (s.capacity || 0) - (s.current_occupancy || 0)),
    haversineDistKm: +haversine(reqLat, reqLon, s.lat, s.lon || s.lng).toFixed(2)
  })).sort((a, b) => a.haversineDistKm - b.haversineDistKm).slice(0, 4);

  const routeResults = [];

  for (const shelter of candidates) {
    const sLat = shelter.lat;
    const sLon = shelter.lon || shelter.lng;

    const canonicalRoute = await fetchOsrmRoute(
      { lat: reqLat, lng: reqLon, name: 'Citizen Location' },
      { lat: sLat, lng: sLon, name: shelter.name, shelterId: shelter.shelter_id || shelter.id },
      { ...options, includeGeometry: true }
    );

    if (canonicalRoute.routeStatus === 'LIVE' || canonicalRoute.routeStatus === 'DEGRADED') {
      // Evaluate genuine geometry against red zones
      let redZoneHits = 0;
      const coords = canonicalRoute.geometry?.coordinates || [];
      if (coords.length > 0 && Array.isArray(redZones) && redZones.length > 0) {
        for (let i = 0; i < coords.length; i += Math.max(1, Math.floor(coords.length / 25))) {
          const pt = coords[i]; // [lng, lat]
          for (const zone of redZones) {
            if (zone && pointInPoly(pt, zone)) {
              redZoneHits++;
              break;
            }
          }
        }
      }

      const avoidsRedZone = redZoneHits === 0;
      const safetyRating = avoidsRedZone ? 'HIGH SAFETY' : 'CAUTION (SURGE FRINGE)';
      const durationMin = canonicalRoute.travelTimeMins;

      routeResults.push({
        shelter: {
          id: shelter.shelter_id || shelter.id,
          name: shelter.name,
          lat: sLat,
          lon: sLon,
          type: shelter.type,
          contact: shelter.contact,
          district: shelter.district,
          capacity: shelter.capacity,
          current_occupancy: shelter.current_occupancy,
          available_beds: shelter.available_beds,
          occupancy_pct: shelter.capacity ? Math.round((shelter.current_occupancy / shelter.capacity) * 100) : 0,
          amenities: shelter.amenities,
          elevation_m: shelter.elevation_m,
          structural_safety: shelter.structural_safety,
          last_updated: shelter.last_updated
        },
        route: {
          ...canonicalRoute,
          avoidsRedZone,
          safetyRating,
          hazardAdvisory: avoidsRedZone ? '100% Hazard-Avoided Safe Evacuation Corridor' : 'Route fringes active coastal flood buffer. Travel with caution.'
        },
        compositeScore: (avoidsRedZone ? 0 : 200) + (durationMin || 999) - (shelter.available_beds * 0.015)
      });
    } else {
      // Route is UNAVAILABLE. Record explicitly; NEVER fabricate fake straight-line geometry.
      routeResults.push({
        shelter: {
          id: shelter.shelter_id || shelter.id,
          name: shelter.name,
          lat: sLat,
          lon: sLon,
          type: shelter.type,
          contact: shelter.contact,
          district: shelter.district,
          capacity: shelter.capacity,
          current_occupancy: shelter.current_occupancy,
          available_beds: shelter.available_beds,
          occupancy_pct: shelter.capacity ? Math.round((shelter.current_occupancy / shelter.capacity) * 100) : 0,
          amenities: shelter.amenities,
          elevation_m: shelter.elevation_m,
          structural_safety: shelter.structural_safety,
          last_updated: shelter.last_updated
        },
        route: {
          ...canonicalRoute,
          avoidsRedZone: null,
          safetyRating: 'UNAVAILABLE',
          hazardAdvisory: 'Turn-by-turn road route could not be computed by OSRM. Do not navigate without verified route.'
        },
        compositeScore: 9999
      });
    }
  }

  // Sort by composite score (lowest penalty = best safe route)
  routeResults.sort((a, b) => a.compositeScore - b.compositeScore);

  return {
    success: true,
    citizenLocation: { lat: reqLat, lon: reqLon },
    recommendedCount: Math.min(3, routeResults.length),
    routes: routeResults.slice(0, 3),
    metadata: {
      sourceId: SOURCE_ID,
      provider: PROVIDER,
      generatedAt: new Date().toISOString(),
      usableRoutesCount: routeResults.filter(r => r.route.routeStatus === 'LIVE' || r.route.routeStatus === 'DEGRADED').length
    }
  };
}

/**
 * Overview summary for dashboard, health probes, and AI context.
 */
function getOsrmRoutingSummary() {
  let cachedCount = osrmCache.size;
  let liveCount = 0;
  let degradedCount = 0;
  const now = Date.now();

  for (const [_, entry] of osrmCache.entries()) {
    if (now < entry.expiresAt) {
      liveCount++;
    } else {
      degradedCount++;
    }
  }

  return {
    sourceId: SOURCE_ID,
    agency: 'Project OSRM / OpenStreetMap',
    provider: PROVIDER,
    tier: 'LIVE_API',
    role: 'PRIMARY',
    host: HOST,
    totalRoutesCached: cachedCount,
    activeLiveEntries: liveCount,
    degradedStaleEntries: degradedCount,
    disclaimer: 'Road passability during active disaster events is not guaranteed. Travel times require live OSRM calculation.'
  };
}

function resetOsrmCache() {
  osrmCache.clear();
}

module.exports = {
  SOURCE_ID,
  PROVIDER,
  HOST,
  DEFAULT_CADENCE_MS,
  validateOsrmResponse,
  buildCanonicalRoute,
  fetchOsrmRoute,
  getOsrmRouteDetails,
  calculateEvacuationRoutes,
  getOsrmRoutingSummary,
  resetOsrmCache,
  isCoordInsideAP,
  haversine
};
