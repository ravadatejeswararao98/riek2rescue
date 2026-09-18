const { safeText } = require('../js/redact.js');
/**
 * RISK2RESCUE — NASA FIRMS ACTIVE FIRE / THERMAL ANOMALIES (sources/nasa-firms.js)
 * NASA LANCE / EOSDIS Fire Information for Resource Management System (VIIRS NRT)
 * 
 * Source ID: nasa_firms_viirs
 * Role: PRIMARY (Satellite Thermal Anomalies)
 * Tier: LIVE_API
 * Cadence: 15 minutes cache (FIRMS_CACHE_TTL_MS = 900000)
 * 
 * Strict Truth Rules:
 * - When NASA_FIRMS_MAP_KEY is missing/empty => status: 'NOT_CONFIGURED'.
 * - All observations MUST be validated inside Andhra Pradesh via ray-casting against data/andhra_pradesh_boundary.geojson.
 * - Out-of-state hotspots or invalid/missing coordinates are strictly rejected.
 * - Zero synthetic fire points in production code. No Kakinada/Vijayawada fallback.
 * - Missing metrics (confidence, FRP, brightness) remain null, never converted to 0.
 * - Observation ID is a deterministic hash of latitude, longitude, observedAt, satellite, instrument.
 * - Stale cache handling: returns cached data marked status: 'DEGRADED', stale: true, preserving original observedAt.
 */

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const FIRMS_CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes
let firmsCache = { data: null, expiresAt: 0 };

// Authoritative AP Boundary
let apBoundaryGeom = null;
try {
  const boundaryPath = path.join(__dirname, '..', 'data', 'andhra_pradesh_boundary.geojson');
  if (fs.existsSync(boundaryPath)) {
    const raw = JSON.parse(fs.readFileSync(boundaryPath, 'utf8'));
    apBoundaryGeom = raw.features && raw.features[0] ? raw.features[0].geometry : null;
  }
} catch (e) {
  console.warn('[FIRMS] Failed to load AP boundary GeoJSON:', e.message);
}

function pointInPolygon(pt, ring) {
  let inside = false;
  const x = pt[0], y = pt[1];
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1];
    const xj = ring[j][0], yj = ring[j][1];
    const intersect = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

function isCoordInsideAP(lon, lat) {
  if (typeof lon !== 'number' || typeof lat !== 'number' || isNaN(lon) || isNaN(lat)) return false;
  if (!apBoundaryGeom) return false;
  const pt = [lon, lat];
  if (apBoundaryGeom.type === 'Polygon') {
    return pointInPolygon(pt, apBoundaryGeom.coordinates[0]);
  } else if (apBoundaryGeom.type === 'MultiPolygon') {
    for (const poly of apBoundaryGeom.coordinates) {
      if (pointInPolygon(pt, poly[0])) return true;
    }
  }
  return false;
}

function fetchText(targetUrl, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    try {
      const parsed = new URL(targetUrl);
      const client = parsed.protocol === 'https:' ? https : http;
      const req = client.request(parsed, {
        method: 'GET',
        headers: {
          'User-Agent': 'Risk2Rescue-NASA-FIRMS/2.0 (Disaster-Management-Platform)',
          'Accept': 'text/csv, application/json, text/plain, */*'
        },
        timeout: timeoutMs
      }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(data);
          } else {
            reject(new Error(safeText(`HTTP ${res.statusCode} from ${targetUrl}`)));
          }
        });
      });
      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error(safeText('Request timeout'))); });
      req.end();
    } catch (err) {
      reject(err);
    }
  });
}

function generateObservationId(lat, lon, observedAt, satellite, instrument) {
  const payload = `${lat.toFixed(5)}_${lon.toFixed(5)}_${observedAt || 'unknown'}_${satellite}_${instrument}`;
  return 'FIRMS_' + crypto.createHash('sha256').update(payload).digest('hex').slice(0, 12);
}

/**
 * Parses a NASA FIRMS CSV text into normalized, AP-filtered observation records
 */
function parseFirmsCsv(csvText, fetchedAt) {
  const lines = csvText.split('\n');
  if (lines.length < 2) return [];

  const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
  const latIdx = headers.indexOf('latitude');
  const lonIdx = headers.indexOf('longitude');
  const frpIdx = headers.indexOf('frp');
  const confIdx = headers.indexOf('confidence');
  const brightIdx = headers.indexOf('bright_ti4') !== -1 ? headers.indexOf('bright_ti4') : headers.indexOf('brightness');
  const dateIdx = headers.indexOf('acq_date');
  const timeIdx = headers.indexOf('acq_time');
  const satIdx = headers.indexOf('satellite');
  const instIdx = headers.indexOf('instrument');
  const dnIdx = headers.indexOf('daynight');
  const scanIdx = headers.indexOf('scan');
  const trackIdx = headers.indexOf('track');

  const observations = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const cols = line.split(',');

    const lat = parseFloat(cols[latIdx]);
    const lon = parseFloat(cols[lonIdx]);

    if (isNaN(lat) || isNaN(lon)) continue;

    // Strict AP polygon containment
    if (!isCoordInsideAP(lon, lat)) continue;

    const acqDate = (dateIdx !== -1 && cols[dateIdx]) ? cols[dateIdx].trim() : null;
    let acqTime = (timeIdx !== -1 && cols[timeIdx]) ? cols[timeIdx].trim() : '';
    if (acqTime.length === 3) acqTime = '0' + acqTime;
    if (acqTime.length === 4) acqTime = `${acqTime.slice(0, 2)}:${acqTime.slice(2, 4)}:00`;

    let observedAt = null;
    if (acqDate) {
      observedAt = acqTime ? `${acqDate}T${acqTime}Z` : `${acqDate}T00:00:00Z`;
    }

    const satellite = (satIdx !== -1 && cols[satIdx]) ? cols[satIdx].trim() : 'Suomi NPP';
    const instrument = (instIdx !== -1 && cols[instIdx]) ? cols[instIdx].trim() : 'VIIRS';

    const rawFrp = frpIdx !== -1 ? parseFloat(cols[frpIdx]) : NaN;
    const frp = !isNaN(rawFrp) ? rawFrp : null;

    const rawBright = brightIdx !== -1 ? parseFloat(cols[brightIdx]) : NaN;
    const brightness = !isNaN(rawBright) ? rawBright : null;

    const rawConf = confIdx !== -1 ? cols[confIdx].trim() : null;
    const confidence = (rawConf !== null && rawConf !== '') ? rawConf : null;

    const rawScan = scanIdx !== -1 ? parseFloat(cols[scanIdx]) : NaN;
    const scan = !isNaN(rawScan) ? rawScan : null;

    const rawTrack = trackIdx !== -1 ? parseFloat(cols[trackIdx]) : NaN;
    const track = !isNaN(rawTrack) ? rawTrack : null;

    const dayNight = (dnIdx !== -1 && cols[dnIdx]) ? cols[dnIdx].trim() : null;

    const obsId = generateObservationId(lat, lon, observedAt, satellite, instrument);

    observations.push({
      id: obsId,
      latitude: lat,
      longitude: lon,
      lat: lat,
      lon: lon,
      observedAt: observedAt,
      instrument: instrument,
      satellite: satellite,
      confidence: confidence,
      frp: frp,
      frpUnit: 'MW',
      brightness: brightness,
      brightnessUnit: 'K',
      dayNight: dayNight,
      scan: scan,
      track: track,
      sourceId: 'nasa_firms_viirs',
      provenance: 'nasa_firms_live',
      fetchedAt: fetchedAt
    });
  }

  return observations;
}

/**
 * Main NASA FIRMS Query Function
 */
async function getNasaFirmsHotspots() {
  const now = Date.now();
  const fetchedAt = new Date().toISOString();

  // 1. Fresh Cache Check
  if (firmsCache.data && now < firmsCache.expiresAt) {
    return { ...firmsCache.data, cached: true };
  }

  const mapKey = process.env.NASA_FIRMS_MAP_KEY || process.env.FIRMS_MAP_KEY || '';

  // 2. Configuration Truth: If API key is unset, return NOT_CONFIGURED
  if (!mapKey || mapKey.trim() === '') {
    return {
      success: false,
      status: 'NOT_CONFIGURED',
      sourceId: 'nasa_firms_viirs',
      source: 'NASA FIRMS (Fire Information for Resource Management System)',
      role: 'PRIMARY',
      tier: 'LIVE_API',
      observations: [],
      hotspots: [],
      observationCount: 0,
      latestObservedAt: null,
      fetchedAt: fetchedAt,
      error: 'NASA_FIRMS_MAP_KEY is not configured in .env',
      attribution: 'NASA LANCE / EOSDIS FIRMS (MODAPS)',
      provenance: 'nasa_firms_live',
      stale: false
    };
  }

  // 3. Query Genuine NASA FIRMS Service
  try {
    // AP Bounding Box: 76.5, 12.5, 85.0, 19.5 (1-day NRT VIIRS Suomi-NPP)
    const url = `https://firms.modaps.eosdis.nasa.gov/api/area/csv/${encodeURIComponent(mapKey.trim())}/VIIRS_SNPP_NRT/76.5,12.5,85.0,19.5/1`;
    const csvText = await fetchText(url, 9000);

    const observations = parseFirmsCsv(csvText, fetchedAt);
    const latestObs = observations.length > 0
      ? observations.map(o => o.observedAt).filter(Boolean).sort().reverse()[0]
      : null;

    const result = {
      success: true,
      status: 'LIVE',
      sourceId: 'nasa_firms_viirs',
      source: 'NASA FIRMS (Fire Information for Resource Management System)',
      role: 'PRIMARY',
      tier: 'LIVE_API',
      observations: observations,
      hotspots: observations,
      observationCount: observations.length,
      latestObservedAt: latestObs,
      fetchedAt: fetchedAt,
      attribution: 'NASA LANCE / EOSDIS FIRMS (MODAPS)',
      provenance: 'nasa_firms_live',
      stale: false,
      cached: false
    };

    firmsCache = {
      data: result,
      expiresAt: now + FIRMS_CACHE_TTL_MS
    };

    return result;

  } catch (err) {
    console.warn('[FIRMS] Live request failed:', err.message);

    // Stale Cache Fallback
    if (firmsCache.data) {
      return {
        ...firmsCache.data,
        status: 'DEGRADED',
        cached: true,
        stale: true,
        upstreamError: err.message
      };
    }

    // Honest Unavailable Response
    return {
      success: false,
      status: 'UNAVAILABLE',
      sourceId: 'nasa_firms_viirs',
      source: 'NASA FIRMS (Fire Information for Resource Management System)',
      role: 'PRIMARY',
      tier: 'LIVE_API',
      observations: [],
      hotspots: [],
      observationCount: 0,
      latestObservedAt: null,
      fetchedAt: fetchedAt,
      error: 'NASA FIRMS upstream request failed: ' + err.message,
      attribution: 'NASA LANCE / EOSDIS FIRMS (MODAPS)',
      provenance: 'nasa_firms_live',
      stale: false
    };
  }
}

function clearFirmsCache() {
  firmsCache = { data: null, expiresAt: 0 };
}

function setFirmsCache(data, ttlMs = FIRMS_CACHE_TTL_MS) {
  firmsCache = {
    data,
    expiresAt: Date.now() + ttlMs
  };
}

function getCachedFirmsData() {
  if (firmsCache.data && Date.now() < firmsCache.expiresAt) {
    return firmsCache.data;
  }
  return null;
}

module.exports = {
  getNasaFirmsHotspots,
  isCoordInsideAP,
  parseFirmsCsv,
  generateObservationId,
  clearFirmsCache,
  setFirmsCache,
  getCachedFirmsData,
  FIRMS_CACHE_TTL_MS
};
