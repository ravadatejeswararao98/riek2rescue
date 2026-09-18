const { safeText } = require('../js/redact.js');
/**
 * RISK2RESCUE - AP WEATHER ADAPTER (sources/ap-weather.js)
 * Fetches real-time weather datasets for Andhra Pradesh from data.gov.in
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

// Authoritative AP Boundary GeoJSON Loader
let apBoundaryGeom = null;
try {
  const boundaryPath = path.join(__dirname, '..', 'data', 'andhra_pradesh_boundary.geojson');
  if (fs.existsSync(boundaryPath)) {
    const raw = JSON.parse(fs.readFileSync(boundaryPath, 'utf8'));
    apBoundaryGeom = raw.features && raw.features[0] ? raw.features[0].geometry : null;
  }
} catch (e) {
  console.warn('[APWeather] Failed to load AP boundary GeoJSON:', e.message);
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

const AP_DISTRICTS = [
  'alluri sitharama raju', 'anakapalli', 'anantapur', 'annamayya', 'bapatla',
  'chittoor', 'dr. b.r. ambedkar konaseema', 'konaseema', 'east godavari',
  'eluru', 'guntur', 'kakinada', 'krishna', 'kurnool', 'nandyal', 'ntr',
  'palnadu', 'parvathipuram manyam', 'prakasam', 'sri potti sriramulu nellore',
  'nellore', 'sri sathya sai', 'srikakulam', 'tirupati', 'visakhapatnam',
  'vizianagaram', 'west godavari', 'ysr', 'kadapa'
];

function isRecordInAP(rec) {
  if (!rec || typeof rec !== 'object') return false;
  const lat = Number(rec.latitude || rec.lat || rec.LATITUDE || rec.LAT);
  const lon = Number(rec.longitude || rec.lon || rec.lng || rec.LONGITUDE || rec.LON);
  if (!isNaN(lat) && !isNaN(lon) && lat !== 0 && lon !== 0) {
    return isCoordInsideAP(lon, lat);
  }
  const state = String(rec.state || rec.State || rec.STATE || '').trim().toLowerCase();
  if (state.includes('andhra') || state === 'ap') return true;

  const district = String(rec.district || rec.District || rec.DISTRICT || '').trim().toLowerCase();
  if (district && AP_DISTRICTS.some(d => district.includes(d))) return true;

  return false;
}

function fetchJson(targetUrl, headers = {}, timeoutMs = 9000) {
  return new Promise((resolve, reject) => {
    try {
      const parsed = new URL(targetUrl);
      const req = https.request({
        hostname: parsed.hostname,
        port: 443,
        path: parsed.pathname + parsed.search,
        method: 'GET',
        headers: {
          'User-Agent': 'Risk2Rescue-APWeather/2.0',
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
              resolve(JSON.parse(raw));
            } catch (e) {
              reject(new Error(safeText('JSON parse error from ' + targetUrl)));
            }
          } else {
            reject(new Error(safeText(`HTTP ${res.statusCode} from ${targetUrl}`)));
          }
        });
      });
      req.on('timeout', () => {
        req.destroy(new Error(`Timeout after ${timeoutMs}ms`));
      });
      req.on('error', (err) => reject(new Error(safeText(err.message))));
      req.end();
    } catch (err) {
      reject(new Error(safeText(err.message)));
    }
  });
}

// In-memory cache
const weatherCache = {
  data: null,
  expiresAt: 0
};

/**
 * Fetches data.gov.in resource with the given ID and API key
 */
async function fetchDataset(resourceId, apiKey) {
  if (!resourceId || resourceId.trim() === '') {
    return { ok: false, error: 'Resource ID is missing' };
  }
  const url = `https://api.data.gov.in/resource/${resourceId}?api-key=${encodeURIComponent(apiKey)}&format=json&limit=500`;
  try {
    const json = await fetchJson(url, {}, 9000);
    const rawRecords = json.records || [];
    const filteredRecords = rawRecords.filter(isRecordInAP);
    return { ok: true, records: filteredRecords };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

async function getApWeather() {
  const apiKey = process.env.DATA_GOV_IN_API_KEY;
  const windId = process.env.DATA_GOV_AP_WIND_SPEED_ID;
  const tempId = process.env.DATA_GOV_AP_TEMPERATURE_ID;
  const rainId = process.env.DATA_GOV_AP_RAINFALL_ID;

  if (!apiKey || apiKey.trim() === '') {
    return {
      success: false,
      status: 'NOT_CONFIGURED',
      sourceId: 'ap_weather',
      error: 'DATA_GOV_IN_API_KEY is not configured in .env',
      data: null
    };
  }

  if (!windId || windId.trim() === '') {
    return {
      success: false,
      status: 'UNAVAILABLE',
      sourceId: 'ap_weather',
      error: 'DATA_GOV_AP_WIND_SPEED_ID is missing or not configured in .env',
      data: null
    };
  }

  if (!tempId || tempId.trim() === '') {
    return {
      success: false,
      status: 'UNAVAILABLE',
      sourceId: 'ap_weather',
      error: 'DATA_GOV_AP_TEMPERATURE_ID is missing or not configured in .env',
      data: null
    };
  }

  if (!rainId || rainId.trim() === '') {
    return {
      success: false,
      status: 'UNAVAILABLE',
      sourceId: 'ap_weather',
      error: 'DATA_GOV_AP_RAINFALL_ID is missing or not configured in .env',
      data: null
    };
  }

  const now = Date.now();
  if (weatherCache.data && now < weatherCache.expiresAt) {
    return { ...weatherCache.data, cached: true };
  }

  const [windRes, tempRes, rainRes] = await Promise.all([
    fetchDataset(windId, apiKey),
    fetchDataset(tempId, apiKey),
    fetchDataset(rainId, apiKey)
  ]);

  const errors = [];
  if (!windRes.ok) errors.push(`Wind: ${windRes.error}`);
  if (!tempRes.ok) errors.push(`Temp: ${tempRes.error}`);
  if (!rainRes.ok) errors.push(`Rain: ${rainRes.error}`);

  if (errors.length > 0) {
    return {
      success: false,
      status: 'UNAVAILABLE',
      sourceId: 'ap_weather',
      error: `Failed to fetch datasets: ${errors.join(', ')}`,
      data: null
    };
  }

  const result = {
    success: true,
    status: 'LIVE',
    sourceId: 'ap_weather',
    timestamp: new Date().toISOString(),
    data: {
      windRecords: windRes.records,
      tempRecords: tempRes.records,
      rainRecords: rainRes.records
    }
  };

  // Cache for 15 minutes
  weatherCache.data = result;
  weatherCache.expiresAt = now + 15 * 60 * 1000;

  return result;
}

module.exports = {
  getApWeather,
  isCoordInsideAP,
  isRecordInAP
};
