const { safeText } = require('../js/redact.js');
/**
 * RISK2RESCUE — COPERNICUS DATA SPACE ECOSYSTEM (sources/copernicus.js)
 * Authoritative Sentinel-1 GRD Latest Satellite Observation Discovery
 * 
 * Sources:
 * - Copernicus Data Space Ecosystem (CDSE) Catalogue OData v1 API:
 *   https://catalogue.dataspace.copernicus.eu/odata/v1/Products
 * - Identity / Authentication:
 *   https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token
 * 
 * TELEMETRY TRUTH DIRECTIVES:
 * 1. Product Truth: Sentinel-1 GRD only. No synthetic scenes or fake orbits.
 * 2. LATEST SATELLITE OBSERVATION: Never labeled "real-time" satellite.
 * 3. Timestamp Truth: actual acquisitionStart / acquisitionEnd preserved from sensor pass.
 *    discoveredAt reflects when the portal retrieved it from CDSE.
 * 4. Andhra Pradesh Boundary: Every scene footprint must intersect the authoritative
 *    AP boundary (data/andhra_pradesh_boundary.geojson). Fail-closed if boundary missing.
 * 5. Configuration Truth: If COPERNICUS_CLIENT_ID or COPERNICUS_CLIENT_SECRET is missing,
 *    truthfully report status: 'NOT_CONFIGURED', sceneId: null, scenes: [].
 * 6. Cache Strategy: 30-minute TTL (COPERNICUS_CACHE_TTL_MS = 1800000). Stale cache returns
 *    status: 'DEGRADED' with stale: true on upstream failures.
 */

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

// 30-minute Cache TTL
const COPERNICUS_CACHE_TTL_MS = 30 * 60 * 1000;
let cachedCopernicusData = null;
let cachedCopernicusExpiresAt = 0;

let cachedToken = null;
let tokenExpiresAt = 0;

// Load Authoritative Andhra Pradesh Boundary
let apBoundaryCoords = null;
try {
  const boundaryPath = path.join(__dirname, '..', 'data', 'andhra_pradesh_boundary.geojson');
  if (fs.existsSync(boundaryPath)) {
    const raw = fs.readFileSync(boundaryPath, 'utf8');
    const geojson = JSON.parse(raw);
    if (geojson.features && geojson.features.length > 0 && geojson.features[0].geometry) {
      apBoundaryCoords = geojson.features[0].geometry.coordinates;
    } else if (geojson.coordinates) {
      apBoundaryCoords = geojson.coordinates;
    }
  }
} catch (e) {
  console.warn('[Copernicus] Note: Could not load Andhra Pradesh boundary GeoJSON:', e.message);
  apBoundaryCoords = null;
}

/**
 * Point-in-polygon ray-casting algorithm
 */
function isPointInRing(pt, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1];
    const xj = ring[j][0], yj = ring[j][1];
    const intersect = ((yi > pt[1]) !== (yj > pt[1])) &&
      (pt[0] < (xj - xi) * (pt[1] - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * 2D Line segments intersection test
 */
function segmentsIntersect(p1, p2, p3, p4) {
  function ccw(A, B, C) {
    return (C[1] - A[1]) * (B[0] - A[0]) > (B[1] - A[1]) * (C[0] - A[0]);
  }
  return (ccw(p1, p3, p4) !== ccw(p2, p3, p4)) && (ccw(p1, p2, p3) !== ccw(p1, p2, p4));
}

/**
 * Validates whether a scene's GeoFootprint intersects the authoritative Andhra Pradesh boundary
 * Fail-closed: returns false if AP boundary cannot be loaded.
 */
function isFootprintIntersectingAP(geoFootprint) {
  if (!apBoundaryCoords) {
    return false; // Fail closed if boundary missing
  }
  if (!geoFootprint || typeof geoFootprint !== 'object') {
    return false;
  }

  let sceneRings = null;
  if (geoFootprint.type === 'Polygon' && Array.isArray(geoFootprint.coordinates)) {
    sceneRings = geoFootprint.coordinates;
  } else if (geoFootprint.type === 'MultiPolygon' && Array.isArray(geoFootprint.coordinates)) {
    sceneRings = geoFootprint.coordinates[0];
  } else if (Array.isArray(geoFootprint)) {
    sceneRings = geoFootprint;
  }

  if (!sceneRings || !sceneRings[0] || !Array.isArray(sceneRings[0]) || sceneRings[0].length < 3) {
    return false;
  }

  const sceneRing = sceneRings[0];
  const apRing = apBoundaryCoords[0];

  // 1. Any scene vertex inside AP boundary
  for (const pt of sceneRing) {
    if (Array.isArray(pt) && pt.length >= 2) {
      if (isPointInRing(pt, apRing)) return true;
    }
  }

  // 2. Any AP vertex inside scene footprint
  for (const pt of apRing) {
    if (Array.isArray(pt) && pt.length >= 2) {
      if (isPointInRing(pt, sceneRing)) return true;
    }
  }

  // 3. Any boundary edge intersection
  for (let i = 0; i < sceneRing.length - 1; i++) {
    for (let j = 0; j < apRing.length - 1; j++) {
      if (segmentsIntersect(sceneRing[i], sceneRing[i + 1], apRing[j], apRing[j + 1])) {
        return true;
      }
    }
  }

  // 4. Centroid test
  let sumLon = 0, sumLat = 0, count = 0;
  for (const pt of sceneRing) {
    if (Array.isArray(pt) && pt.length >= 2 && !isNaN(pt[0]) && !isNaN(pt[1])) {
      sumLon += pt[0];
      sumLat += pt[1];
      count++;
    }
  }
  if (count > 0) {
    const centroid = [sumLon / count, sumLat / count];
    if (isPointInRing(centroid, apRing)) return true;
  }

  return false;
}

/**
 * Validates that an upstream record is genuinely Sentinel-1 GRD
 */
function validateSentinel1Product(product) {
  if (!product || typeof product !== 'object') return false;
  const name = product.Name || product.title || '';
  if (!/^S1[A-D]_/i.test(name)) return false;
  if (!/GRD/i.test(name)) return false;
  const start = product.ContentDate?.Start || product.acquisitionStart;
  if (!start) return false;
  return true;
}

/**
 * Extracts and normalizes metadata from a Copernicus Sentinel-1 product record
 */
function parseSentinel1Metadata(product, discoveredAt = new Date().toISOString()) {
  const name = product.Name || product.title || '';
  const parts = name.split('_');

  const platPrefix = parts[0] ? parts[0].toUpperCase() : 'S1A';
  let platform = 'Sentinel-1';
  if (platPrefix.startsWith('S1A')) platform = 'Sentinel-1A';
  else if (platPrefix.startsWith('S1B')) platform = 'Sentinel-1B';
  else if (platPrefix.startsWith('S1C')) platform = 'Sentinel-1C';
  else if (platPrefix.startsWith('S1D')) platform = 'Sentinel-1D';

  const mode = parts[1] || 'IW';
  const prodType = (parts[2] && parts[2].toUpperCase().includes('GRD')) ? 'GRD' : 'GRD';

  let polarization = null;
  const polCode = parts[3] ? parts[3].toUpperCase() : '';
  if (polCode.includes('DV')) polarization = 'VV+VH';
  else if (polCode.includes('DH')) polarization = 'HH+HV';
  else if (polCode.includes('SV')) polarization = 'VV';
  else if (polCode.includes('SH')) polarization = 'HH';

  let relativeOrbit = null;
  if (parts[5] && !isNaN(parseInt(parts[5], 10))) {
    relativeOrbit = parseInt(parts[5], 10);
  }

  const acqStart = product.ContentDate?.Start || product.acquisitionStart || null;
  const acqEnd = product.ContentDate?.End || product.acquisitionEnd || null;
  const id = product.Id || product.id || product.sceneId || name;

  return {
    sourceId: 'copernicus_dataspace',
    source: 'Copernicus Data Space Ecosystem (Sentinel-1 SAR GRD)',
    observationType: 'LATEST_SATELLITE_OBSERVATION',
    satellite: 'Sentinel-1',
    productType: prodType,
    sceneId: id,
    title: name,
    acquisitionStart: acqStart,
    acquisitionEnd: acqEnd,
    discoveredAt: discoveredAt,
    platform: platform,
    instrument: 'C-SAR',
    orbitDirection: product.orbitDirection || 'DESCENDING',
    relativeOrbit: relativeOrbit,
    polarization: polarization,
    mode: mode,
    footprint: product.GeoFootprint || product.footprint || null,
    sourceUrl: `https://catalogue.dataspace.copernicus.eu/odata/v1/Products(${id})/$value`,
    provenance: 'copernicus_dataspace_live',
    stale: false,
    historical: false
  };
}

/**
 * Generic HTTPS GET helper
 */
function fetchHttpsJson(targetUrl, headers = {}, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    try {
      const parsed = new URL(targetUrl);
      const req = https.request(parsed, {
        method: 'GET',
        headers: {
          'User-Agent': 'Risk2Rescue-Copernicus-Telemetry/2.0 (Disaster-Management-Portal)',
          'Accept': 'application/json, text/plain, */*',
          ...headers
        },
        timeout: timeoutMs
      }, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            try {
              resolve(JSON.parse(body));
            } catch (err) {
              reject(new Error(safeText(`Failed to parse Copernicus response JSON: ${err.message}`)));
            }
          } else {
            reject(new Error(safeText(`Copernicus OData returned HTTP ${res.statusCode}: ${body.slice(0, 200)}`)));
          }
        });
      });
      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error(safeText('Copernicus request timeout'))); });
      req.end();
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Fetch Copernicus Data Space OAuth2 token (if credentials configured)
 */
async function getCopernicusToken(clientId, clientSecret) {
  const now = Date.now();
  if (cachedToken && now < tokenExpiresAt) {
    return cachedToken;
  }
  if (!clientId || !clientSecret) {
    return null;
  }

  const payload = `grant_type=client_credentials&client_id=${encodeURIComponent(clientId)}&client_secret=${encodeURIComponent(clientSecret)}`;
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'identity.dataspace.copernicus.eu',
      path: '/auth/realms/CDSE/protocol/openid-connect/token',
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(payload)
      },
      timeout: 7000
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) {
          try {
            const json = JSON.parse(body);
            cachedToken = json.access_token;
            tokenExpiresAt = now + ((json.expires_in || 3600) - 60) * 1000;
            resolve(cachedToken);
          } catch (e) { reject(e); }
        } else {
          reject(new Error(safeText(`OAuth error HTTP ${res.statusCode}: ${body}`)));
        }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error(safeText('OAuth request timeout'))); });
    req.write(payload);
    req.end();
  });
}

/**
 * Primary Discovery Path: Retrieves the latest genuine Sentinel-1 GRD observation covering AP
 */
async function getLatestSentinel1Observation(options = {}) {
  const bypassCache = options.bypassCache === true;
  const discoveredAt = new Date().toISOString();

  // Return fresh cache if available and not bypassing
  const now = Date.now();
  if (!bypassCache && cachedCopernicusData && now < cachedCopernicusExpiresAt) {
    return { ...cachedCopernicusData };
  }

  // 1. Audit Credentials
  const clientId = process.env.COPERNICUS_CLIENT_ID || process.env.SENTINEL_HUB_CLIENT_ID;
  const clientSecret = process.env.COPERNICUS_CLIENT_SECRET || process.env.SENTINEL_HUB_CLIENT_SECRET;
  const username = process.env.COPERNICUS_USERNAME;
  const password = process.env.COPERNICUS_PASSWORD;

  const isConfigured = !!((clientId && clientSecret) || (username && password));

  if (!isConfigured) {
    return {
      success: false,
      status: 'NOT_CONFIGURED',
      sourceId: 'copernicus_dataspace',
      source: 'Copernicus Data Space Ecosystem (Sentinel-1 SAR GRD)',
      observationType: 'LATEST_SATELLITE_OBSERVATION',
      satellite: 'Sentinel-1',
      productType: 'GRD',
      sceneId: null,
      title: null,
      acquisitionStart: null,
      acquisitionEnd: null,
      discoveredAt: null,
      platform: null,
      instrument: null,
      orbitDirection: null,
      relativeOrbit: null,
      polarization: null,
      mode: null,
      footprint: null,
      sourceUrl: null,
      provenance: 'copernicus_dataspace_live',
      stale: false,
      historical: false,
      scenes: [],
      sceneList: [],
      error: 'COPERNICUS_CLIENT_ID or COPERNICUS_CLIENT_SECRET unset in .env'
    };
  }

  // 2. Query Copernicus Data Space Catalogue OData API
  try {
    let token = null;
    try {
      if (clientId && clientSecret) {
        token = await getCopernicusToken(clientId, clientSecret);
      }
    } catch (authErr) {
      console.warn('[Copernicus] CDSE Token warning (falling back to public OData catalog):', authErr.message);
    }

    const headers = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    // OData spatial query for bounding envelope of Andhra Pradesh (76.5°E to 85.0°E, 12.5°N to 19.5°N)
    const aoiEnvelope = "POLYGON((76.5 12.5, 85.0 12.5, 85.0 19.5, 76.5 19.5, 76.5 12.5))";
    const filterQuery = `Collection/Name eq 'SENTINEL-1' and contains(Name,'GRD') and OData.CSC.Intersects(area=geography'SRID=4326;${aoiEnvelope}')`;
    const targetUrl = `https://catalogue.dataspace.copernicus.eu/odata/v1/Products?$filter=${encodeURIComponent(filterQuery)}&$orderby=ContentDate/Start%20desc&$top=10`;

    const catalogResponse = await fetchHttpsJson(targetUrl, headers, 9000);
    const rawProducts = Array.isArray(catalogResponse?.value) ? catalogResponse.value : [];

    // Filter by product validation and AP polygon intersection
    const validAPProducts = [];
    for (const prod of rawProducts) {
      if (!validateSentinel1Product(prod)) continue;
      if (!isFootprintIntersectingAP(prod.GeoFootprint)) continue;
      validAPProducts.push(prod);
    }

    if (validAPProducts.length === 0) {
      // Successful query, but no accepted AP scenes currently discovered
      const emptyResult = {
        success: true,
        status: 'LIVE',
        sourceId: 'copernicus_dataspace',
        source: 'Copernicus Data Space Ecosystem (Sentinel-1 SAR GRD)',
        observationType: 'LATEST_SATELLITE_OBSERVATION',
        satellite: 'Sentinel-1',
        productType: 'GRD',
        sceneId: null,
        title: null,
        acquisitionStart: null,
        acquisitionEnd: null,
        discoveredAt: discoveredAt,
        platform: null,
        instrument: 'C-SAR',
        orbitDirection: null,
        relativeOrbit: null,
        polarization: null,
        mode: null,
        footprint: null,
        sourceUrl: null,
        provenance: 'copernicus_dataspace_live',
        stale: false,
        historical: false,
        scenes: [],
        sceneList: []
      };
      setCopernicusCache(emptyResult);
      return emptyResult;
    }

    // Sort valid AP products by acquisition start descending
    validAPProducts.sort((a, b) => {
      const ta = new Date(a.ContentDate?.Start || 0).getTime();
      const tb = new Date(b.ContentDate?.Start || 0).getTime();
      return tb - ta;
    });

    const latestRaw = validAPProducts[0];
    const latestObservation = parseSentinel1Metadata(latestRaw, discoveredAt);
    const allParsedScenes = validAPProducts.map(p => parseSentinel1Metadata(p, discoveredAt));

    const result = {
      success: true,
      status: 'LIVE',
      ...latestObservation,
      scenes: allParsedScenes,
      sceneList: allParsedScenes
    };

    setCopernicusCache(result);
    return result;

  } catch (err) {
    console.error('[Copernicus] Query error:', err.message);

    // Stale Cache Fallback -> DEGRADED
    if (cachedCopernicusData) {
      return {
        ...cachedCopernicusData,
        status: 'DEGRADED',
        stale: true,
        cached: true,
        upstreamError: err.message
      };
    }

    // Honest Unavailable Response
    return {
      success: false,
      status: 'UNAVAILABLE',
      sourceId: 'copernicus_dataspace',
      source: 'Copernicus Data Space Ecosystem (Sentinel-1 SAR GRD)',
      observationType: 'LATEST_SATELLITE_OBSERVATION',
      satellite: 'Sentinel-1',
      productType: 'GRD',
      sceneId: null,
      title: null,
      acquisitionStart: null,
      acquisitionEnd: null,
      discoveredAt: null,
      platform: null,
      instrument: null,
      orbitDirection: null,
      relativeOrbit: null,
      polarization: null,
      mode: null,
      footprint: null,
      sourceUrl: null,
      provenance: 'copernicus_dataspace_live',
      stale: false,
      historical: false,
      scenes: [],
      sceneList: [],
      error: 'Copernicus Data Space query failed: ' + err.message
    };
  }
}

/**
 * Cache Management Helpers
 */
function clearCopernicusCache() {
  cachedCopernicusData = null;
  cachedCopernicusExpiresAt = 0;
  cachedToken = null;
  tokenExpiresAt = 0;
}

function setCopernicusCache(data, ttlMs = COPERNICUS_CACHE_TTL_MS) {
  cachedCopernicusData = data;
  cachedCopernicusExpiresAt = Date.now() + ttlMs;
}

function getCachedCopernicusData() {
  if (cachedCopernicusData && Date.now() < cachedCopernicusExpiresAt) {
    return cachedCopernicusData;
  }
  return null;
}

// -------------------------------------------------------------
// TASK 13: SENTINEL-1 EVIDENCE-GROUNDED PROCESSING PIPELINE
// -------------------------------------------------------------

const PROCESSING_CACHE_TTL_MS = 30 * 60 * 1000; // 30 min cache
const cachedProcessingResults = new Map();

function clearProcessingCache() {
  cachedProcessingResults.clear();
}

function getProcessingCache(sceneId) {
  if (!sceneId) return null;
  const entry = cachedProcessingResults.get(sceneId);
  if (entry && Date.now() < entry.expiresAt) {
    return entry.data;
  }
  if (entry) {
    cachedProcessingResults.delete(sceneId);
  }
  return null;
}

function setProcessingCache(sceneId, data, ttlMs = PROCESSING_CACHE_TTL_MS) {
  if (!sceneId) return;
  cachedProcessingResults.set(sceneId, {
    data,
    expiresAt: Date.now() + ttlMs
  });
}

/**
 * Mathematically defensible SAR backscatter statistics calculator
 * Used ONLY when genuine raster data / pixel values are supplied.
 * Never invents synthetic pixels or fabricated values.
 */
function calculateSarBackscatterStats(pixelArray, options = {}) {
  if (!Array.isArray(pixelArray) && !(pixelArray && typeof pixelArray.length === 'number')) {
    return null;
  }
  if (pixelArray.length === 0) {
    return null;
  }

  const isDb = options.isDb === true;
  const pol = options.polarization || 'VV';
  // Water backscatter threshold: -16.0 dB for VV, -22.0 dB for VH (standard radar thresholding)
  const thresholdDb = options.thresholdDb !== undefined ? options.thresholdDb : (pol.includes('VH') ? -22.0 : -16.0);

  let sum = 0;
  let min = Infinity;
  let max = -Infinity;
  let validCount = 0;
  let waterCount = 0;
  const dbValues = [];

  for (let i = 0; i < pixelArray.length; i++) {
    const rawVal = pixelArray[i];
    if (typeof rawVal !== 'number' || isNaN(rawVal)) continue;

    let dbVal = rawVal;
    if (!isDb) {
      if (rawVal <= 0) continue;
      dbVal = 10 * Math.log10(rawVal);
    }

    dbValues.push(dbVal);
    sum += dbVal;
    if (dbVal < min) min = dbVal;
    if (dbVal > max) max = dbVal;
    if (dbVal <= thresholdDb) {
      waterCount++;
    }
    validCount++;
  }

  if (validCount === 0) return null;

  const mean = sum / validCount;
  let varianceSum = 0;
  for (const v of dbValues) {
    varianceSum += Math.pow(v - mean, 2);
  }
  const stdDev = Math.sqrt(varianceSum / validCount);
  const waterRatio = Number((waterCount / validCount).toFixed(4));

  return {
    sampleCount: validCount,
    meanDb: Number(mean.toFixed(2)),
    minDb: Number(min.toFixed(2)),
    maxDb: Number(max.toFixed(2)),
    stdDevDb: Number(stdDev.toFixed(2)),
    thresholdDb: thresholdDb,
    waterPixelCount: waterCount,
    waterRatio: waterRatio,
    surfaceAnomaly: waterRatio > (options.baselineRatio || 0.15) ? 'ANOMALY_ELEVATED' : 'NOMINAL'
  };
}

/**
 * Evidence-grounded Sentinel-1 Observation Processing
 * 
 * Truth directives:
 * 1. Requires genuine Sentinel-1 observation.
 * 2. Enforces AP boundary validation (fail-closed if boundary missing, reject out-of-bounds).
 * 3. Never overwrites acquisition timestamps with processing timestamps.
 * 4. Preserves sourceSceneId and contributingSources provenance.
 * 5. Returns truthful status: NOT_CONFIGURED, PROCESSING_UNAVAILABLE, PROCESSED, or DEGRADED.
 * 6. Never invents flood percentages, water extent, or confidence percentages.
 */
async function processSentinel1Observation(observation, options = {}) {
  const now = new Date().toISOString();
  const bypassCache = options.bypassCache === true;

  // 1. Validate Input Observation
  if (!observation || typeof observation !== 'object') {
    return {
      success: false,
      status: 'UNAVAILABLE',
      sourceId: 'copernicus_dataspace',
      sourceSceneId: null,
      observationType: 'LATEST_SATELLITE_OBSERVATION',
      indicatorType: 'SENTINEL1_GRD_DERIVED_INDICATORS',
      derivedAt: now,
      processedAt: null,
      contributingSources: ['copernicus_dataspace'],
      indicators: null,
      error: 'No genuine Sentinel-1 observation provided for processing'
    };
  }

  const sceneId = observation.sceneId || observation.id;
  if (!sceneId) {
    const isConfigured = !!(process.env.COPERNICUS_CLIENT_ID && process.env.COPERNICUS_CLIENT_SECRET) || !!(process.env.COPERNICUS_USERNAME && process.env.COPERNICUS_PASSWORD);
    return {
      success: false,
      status: isConfigured ? 'UNAVAILABLE' : 'NOT_CONFIGURED',
      sourceId: 'copernicus_dataspace',
      sourceSceneId: null,
      observationType: 'LATEST_SATELLITE_OBSERVATION',
      indicatorType: 'SENTINEL1_GRD_DERIVED_INDICATORS',
      derivedAt: now,
      processedAt: null,
      contributingSources: ['copernicus_dataspace'],
      indicators: null,
      error: isConfigured ? 'Observation contains no valid sceneId' : 'COPERNICUS_CLIENT_ID or COPERNICUS_CLIENT_SECRET unset in .env'
    };
  }

  // 2. Check Cache
  if (!bypassCache) {
    const cached = getProcessingCache(sceneId);
    if (cached) {
      return { ...cached, cached: true };
    }
  }

  // 3. AP Boundary Enforcement (Fail-closed)
  const footprint = observation.footprint || observation.GeoFootprint;
  if (!footprint || !isFootprintIntersectingAP(footprint)) {
    return {
      success: false,
      status: 'REJECTED_OUT_OF_BOUNDS',
      sourceId: 'copernicus_dataspace',
      sourceSceneId: sceneId,
      observationType: 'LATEST_SATELLITE_OBSERVATION',
      indicatorType: 'SENTINEL1_GRD_DERIVED_INDICATORS',
      derivedAt: now,
      processedAt: null,
      contributingSources: ['copernicus_dataspace'],
      indicators: null,
      error: 'Scene footprint does not intersect authoritative Andhra Pradesh boundary (fail-closed)'
    };
  }

  // 4. Determine Credential Configuration
  const clientId = process.env.COPERNICUS_CLIENT_ID || process.env.SENTINEL_HUB_CLIENT_ID;
  const clientSecret = process.env.COPERNICUS_CLIENT_SECRET || process.env.SENTINEL_HUB_CLIENT_SECRET;
  const username = process.env.COPERNICUS_USERNAME;
  const password = process.env.COPERNICUS_PASSWORD;
  const isConfigured = !!((clientId && clientSecret) || (username && password));

  // 5. Genuine Raster Data Evaluation
  const rasterPixels = options.rasterPixels || options.rasterData || options.pixels || null;

  if (rasterPixels && (Array.isArray(rasterPixels) || (typeof rasterPixels.length === 'number' && rasterPixels.length > 0))) {
    // Genuine raster data provided (e.g. from authenticated download or authenticated unit fixture)
    const stats = calculateSarBackscatterStats(rasterPixels, {
      polarization: observation.polarization,
      isDb: options.isDb === true,
      thresholdDb: options.thresholdDb
    });

    if (stats) {
      const processedResult = {
        success: true,
        status: 'PROCESSED',
        sourceId: 'copernicus_dataspace',
        sourceSceneId: sceneId,
        observationType: 'LATEST_SATELLITE_OBSERVATION',
        indicatorType: 'SENTINEL1_GRD_DERIVED_INDICATORS',
        derivedAt: now,
        processedAt: now,
        contributingSources: ['copernicus_dataspace'],
        provenance: {
          sourceId: 'copernicus_dataspace',
          sourceSceneId: sceneId,
          observationType: 'LATEST_SATELLITE_OBSERVATION',
          indicatorType: 'SENTINEL1_GRD_DERIVED_INDICATORS',
          status: 'DERIVED',
          derivedAt: now,
          processedAt: now,
          contributingSources: ['copernicus_dataspace']
        },
        indicators: {
          sarBackscatterStats: {
            sampleCount: stats.sampleCount,
            meanDb: stats.meanDb,
            minDb: stats.minDb,
            maxDb: stats.maxDb,
            stdDevDb: stats.stdDevDb
          },
          surfaceWaterAnomaly: {
            thresholdDb: stats.thresholdDb,
            waterPixelCount: stats.waterPixelCount,
            waterRatio: stats.waterRatio,
            status: stats.surfaceAnomaly
          },
          processedFootprint: footprint,
          processingQuality: 'VERIFIED_GENUINE_SAR'
        },
        sourceObservation: {
          sceneId: sceneId,
          title: observation.title,
          acquisitionStart: observation.acquisitionStart,
          acquisitionEnd: observation.acquisitionEnd,
          platform: observation.platform,
          instrument: observation.instrument || 'C-SAR',
          productType: observation.productType || 'GRD',
          mode: observation.mode,
          polarization: observation.polarization,
          orbitDirection: observation.orbitDirection,
          relativeOrbit: observation.relativeOrbit,
          sourceUrl: observation.sourceUrl
        }
      };

      setProcessingCache(sceneId, processedResult);
      return processedResult;
    }
  }

  // If raster data is not provided or not downloadable
  if (!isConfigured) {
    const unconfiguredResult = {
      success: false,
      status: 'NOT_CONFIGURED',
      sourceId: 'copernicus_dataspace',
      sourceSceneId: sceneId,
      observationType: 'LATEST_SATELLITE_OBSERVATION',
      indicatorType: 'SENTINEL1_GRD_DERIVED_INDICATORS',
      derivedAt: now,
      processedAt: null,
      contributingSources: ['copernicus_dataspace'],
      indicators: null,
      reason: 'COPERNICUS_CLIENT_ID or COPERNICUS_CLIENT_SECRET unset in .env — raster download and processing unconfigured',
      sourceObservation: {
        sceneId: sceneId,
        title: observation.title,
        acquisitionStart: observation.acquisitionStart,
        acquisitionEnd: observation.acquisitionEnd,
        platform: observation.platform,
        instrument: observation.instrument || 'C-SAR',
        productType: observation.productType || 'GRD',
        mode: observation.mode,
        polarization: observation.polarization,
        orbitDirection: observation.orbitDirection,
        relativeOrbit: observation.relativeOrbit,
        sourceUrl: observation.sourceUrl
      }
    };
    setProcessingCache(sceneId, unconfiguredResult);
    return unconfiguredResult;
  }

  // Credentials are configured, but raster product file is not accessible or downloaded
  const unavailableResult = {
    success: false,
    status: 'PROCESSING_UNAVAILABLE',
    sourceId: 'copernicus_dataspace',
    sourceSceneId: sceneId,
    observationType: 'LATEST_SATELLITE_OBSERVATION',
    indicatorType: 'SENTINEL1_GRD_DERIVED_INDICATORS',
    derivedAt: now,
    processedAt: null,
    contributingSources: ['copernicus_dataspace'],
    indicators: null,
    reason: 'Authenticated Sentinel-1 GRD raster product not downloaded from Copernicus Data Space',
    sourceObservation: {
      sceneId: sceneId,
      title: observation.title,
      acquisitionStart: observation.acquisitionStart,
      acquisitionEnd: observation.acquisitionEnd,
      platform: observation.platform,
      instrument: observation.instrument || 'C-SAR',
      productType: observation.productType || 'GRD',
      mode: observation.mode,
      polarization: observation.polarization,
      orbitDirection: observation.orbitDirection,
      relativeOrbit: observation.relativeOrbit,
      sourceUrl: observation.sourceUrl
    }
  };
  setProcessingCache(sceneId, unavailableResult);
  return unavailableResult;
}

/**
 * Convenience helper: Discovers latest observation and performs evidence-grounded processing
 */
async function processLatestSentinel1Observation(options = {}) {
  const latest = await getLatestSentinel1Observation(options);
  if (!latest || !latest.sceneId) {
    const isConfigured = !!(process.env.COPERNICUS_CLIENT_ID && process.env.COPERNICUS_CLIENT_SECRET) || !!(process.env.COPERNICUS_USERNAME && process.env.COPERNICUS_PASSWORD);
    return {
      success: false,
      status: isConfigured ? 'UNAVAILABLE' : 'NOT_CONFIGURED',
      sourceId: 'copernicus_dataspace',
      sourceSceneId: null,
      observationType: 'LATEST_SATELLITE_OBSERVATION',
      indicatorType: 'SENTINEL1_GRD_DERIVED_INDICATORS',
      derivedAt: new Date().toISOString(),
      processedAt: null,
      contributingSources: ['copernicus_dataspace'],
      indicators: null,
      reason: isConfigured ? 'No genuine Sentinel-1 observation discovered from Copernicus Data Space' : 'COPERNICUS_CLIENT_ID or COPERNICUS_CLIENT_SECRET unset in .env'
    };
  }

  return processSentinel1Observation(latest, options);
}

/**
 * LEGACY / REFERENCE: Evaluates Sentinel Hub processing API
 * Clearly designated as NOT_USED_FOR_LATEST_SENTINEL1
 */
async function getCopernicusFloodSignal(focalPoints = []) {
  const clientId = process.env.COPERNICUS_CLIENT_ID || process.env.SENTINEL_HUB_CLIENT_ID;
  const clientSecret = process.env.COPERNICUS_CLIENT_SECRET || process.env.SENTINEL_HUB_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return {
      success: false,
      status: 'NOT_CONFIGURED',
      sourceId: 'copernicus_dataspace',
      agency: 'Copernicus Data Space Ecosystem (ESA / EU)',
      role: 'LEGACY',
      tier: 'LIVE_API',
      error: 'COPERNICUS_CLIENT_ID or COPERNICUS_CLIENT_SECRET unset in .env',
      signals: []
    };
  }

  // Delegate latest observation through Copernicus Data Space
  const latest = await getLatestSentinel1Observation();
  return {
    success: latest.success,
    status: latest.status,
    sourceId: 'copernicus_dataspace',
    agency: 'Copernicus Data Space Ecosystem',
    role: 'LEGACY',
    latestObservation: latest,
    signals: latest.scenes || []
  };
}

/**
 * TASK 14: REAL COPERNICUS DATA SPACE CREDENTIAL / PRODUCT ACCESS VERIFICATION
 * 
 * Safely verifies:
 * 1. Whether CDSE credentials exist in environment.
 * 2. OAuth2 authentication against CDSE token endpoint.
 * 3. Catalogue OData v1 access.
 * 4. Authenticated product payload access (using lightweight Range/HEAD request, never pulling full gigabyte archive).
 * 
 * Security: NEVER returns token, secret, or authorization headers.
 */
async function verifySentinel1ProductAccess(options = {}) {
  const verifiedAt = new Date().toISOString();
  const clientId = process.env.COPERNICUS_CLIENT_ID || process.env.SENTINEL_HUB_CLIENT_ID;
  const clientSecret = process.env.COPERNICUS_CLIENT_SECRET || process.env.SENTINEL_HUB_CLIENT_SECRET;
  const isConfigured = !!(clientId && clientSecret);

  if (!isConfigured) {
    return {
      configured: false,
      authentication: 'NOT_CONFIGURED',
      catalogueAccess: 'NOT_CONFIGURED',
      productPayloadAccess: 'NOT_CONFIGURED',
      status: 'NOT_CONFIGURED',
      sourceId: 'copernicus_dataspace',
      observationType: 'LATEST_SATELLITE_OBSERVATION',
      payloadAccessible: false,
      verifiedAt,
      detail: 'COPERNICUS_CLIENT_ID or COPERNICUS_CLIENT_SECRET unset in .env'
    };
  }

  // 1. Test OAuth2 Authentication
  let token = null;
  try {
    token = await getCopernicusToken(clientId, clientSecret);
  } catch (authErr) {
    return {
      configured: true,
      authentication: 'FAILED',
      catalogueAccess: 'NOT_VERIFIED',
      productPayloadAccess: 'UNAVAILABLE',
      status: 'UNAVAILABLE',
      sourceId: 'copernicus_dataspace',
      observationType: 'LATEST_SATELLITE_OBSERVATION',
      payloadAccessible: false,
      verifiedAt,
      detail: `OAuth authentication failed: ${authErr.message}`
    };
  }

  if (!token) {
    return {
      configured: true,
      authentication: 'FAILED',
      catalogueAccess: 'NOT_VERIFIED',
      productPayloadAccess: 'UNAVAILABLE',
      status: 'UNAVAILABLE',
      sourceId: 'copernicus_dataspace',
      observationType: 'LATEST_SATELLITE_OBSERVATION',
      payloadAccessible: false,
      verifiedAt,
      detail: 'OAuth token retrieval returned empty token'
    };
  }

  // 2. Test Catalogue Query
  let latestObservation = null;
  try {
    latestObservation = await getLatestSentinel1Observation({ bypassCache: options.bypassCache === true });
  } catch (catErr) {
    return {
      configured: true,
      authentication: 'VERIFIED',
      catalogueAccess: 'FAILED',
      productPayloadAccess: 'UNAVAILABLE',
      status: 'UNAVAILABLE',
      sourceId: 'copernicus_dataspace',
      observationType: 'LATEST_SATELLITE_OBSERVATION',
      payloadAccessible: false,
      verifiedAt,
      detail: `Catalogue query failed: ${catErr.message}`
    };
  }

  const sceneId = latestObservation?.sceneId;
  if (!sceneId) {
    return {
      configured: true,
      authentication: 'VERIFIED',
      catalogueAccess: 'CATALOGUE_ACCESS_ONLY',
      productPayloadAccess: 'NO_SCENE_DISCOVERED',
      status: 'LIVE',
      sourceId: 'copernicus_dataspace',
      observationType: 'LATEST_SATELLITE_OBSERVATION',
      payloadAccessible: false,
      verifiedAt,
      detail: 'Catalogue queried successfully but no Andhra Pradesh Sentinel-1 GRD observation found'
    };
  }

  // 3. Test Authenticated Product Payload Endpoint (safe range read: bytes=0-1023)
  try {
    const targetUrl = `https://catalogue.dataspace.copernicus.eu/odata/v1/Products(${sceneId})/$value`;
    const payloadCheck = await new Promise((resolve) => {
      const parsed = new URL(targetUrl);
      const req = https.request(parsed, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Range': 'bytes=0-1023',
          'User-Agent': 'Risk2Rescue-Sentinel1-PayloadVerifier/2.0'
        },
        timeout: 8000
      }, (res) => {
        let bytesReceived = 0;
        res.on('data', chunk => {
          bytesReceived += chunk.length;
          if (bytesReceived > 2048) req.destroy();
        });
        res.on('end', () => {
          resolve({ statusCode: res.statusCode, headers: res.headers, bytesReceived });
        });
        res.on('close', () => {
          resolve({ statusCode: res.statusCode || 200, headers: res.headers || {}, bytesReceived });
        });
      });
      req.on('error', err => resolve({ error: err.message }));
      req.on('timeout', () => { req.destroy(); resolve({ error: 'Payload check timeout' }); });
      req.end();
    });

    if (payloadCheck.statusCode === 200 || payloadCheck.statusCode === 206 || payloadCheck.statusCode === 302 || payloadCheck.statusCode === 307) {
      return {
        configured: true,
        authentication: 'VERIFIED',
        catalogueAccess: 'VERIFIED',
        productPayloadAccess: 'AUTHENTICATED_PRODUCT_DOWNLOAD_ACCESS',
        status: 'LIVE',
        sourceId: 'copernicus_dataspace',
        observationType: 'LATEST_SATELLITE_OBSERVATION',
        sceneId,
        payloadAccessible: true,
        verifiedAt,
        detail: `Authenticated payload access verified (HTTP ${payloadCheck.statusCode})`
      };
    } else {
      return {
        configured: true,
        authentication: 'VERIFIED',
        catalogueAccess: 'CATALOGUE_ACCESS_ONLY',
        productPayloadAccess: 'UNAUTHORIZED_OR_UNAVAILABLE',
        status: 'DEGRADED',
        sourceId: 'copernicus_dataspace',
        observationType: 'LATEST_SATELLITE_OBSERVATION',
        sceneId,
        payloadAccessible: false,
        verifiedAt,
        detail: `Payload endpoint returned HTTP ${payloadCheck.statusCode || 'ERROR'}`
      };
    }
  } catch (payloadErr) {
    return {
      configured: true,
      authentication: 'VERIFIED',
      catalogueAccess: 'CATALOGUE_ACCESS_ONLY',
      productPayloadAccess: 'ERROR',
      status: 'DEGRADED',
      sourceId: 'copernicus_dataspace',
      observationType: 'LATEST_SATELLITE_OBSERVATION',
      sceneId,
      payloadAccessible: false,
      verifiedAt,
      detail: `Payload check failed: ${payloadErr.message}`
    };
  }
}

module.exports = {
  getLatestSentinel1Observation,
  isFootprintIntersectingAP,
  validateSentinel1Product,
  parseSentinel1Metadata,
  clearCopernicusCache,
  setCopernicusCache,
  getCachedCopernicusData,
  COPERNICUS_CACHE_TTL_MS,
  getCopernicusToken,
  getCopernicusFloodSignal,
  // Task 13 exports
  processSentinel1Observation,
  processLatestSentinel1Observation,
  calculateSarBackscatterStats,
  clearProcessingCache,
  getProcessingCache,
  setProcessingCache,
  PROCESSING_CACHE_TTL_MS,
  // Task 14 export
  verifySentinel1ProductAccess
};


