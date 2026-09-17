const { safeText } = require('../js/redact.js');
/**
 * RISK2RESCUE — CPCB REAL-TIME AIR QUALITY INGESTION (sources/cpcb-air.js)
 * Central Pollution Control Board (CPCB) MoEFCC real-time continuous ambient air quality monitoring (CAAQMS)
 * 
 * Upstream: Open Government Data (data.gov.in)
 * Secondary: OpenAQ public ground station API (fallback when DATA_GOV_IN_API_KEY unset)
 */

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

const CPCB_CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes
let cpcbCache = { data: null, expiresAt: 0 };

let apPolygon = null;
try {
  const bPath = path.join(__dirname, '../data/andhra_pradesh_boundary.geojson');
  if (fs.existsSync(bPath)) {
    const geo = JSON.parse(fs.readFileSync(bPath, 'utf8'));
    apPolygon = geo.features ? geo.features[0].geometry : geo;
  }
} catch (e) {
  console.warn('[sources/cpcb-air] Failed to load AP boundary GeoJSON:', e.message);
}

function isPointInPolygon(pt, poly) {
  const [x, y] = pt;
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    const intersect = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

function isCoordInsideAP(lon, lat) {
  if (lat == null || lon == null || isNaN(lat) || isNaN(lon)) return false;
  if (!apPolygon) return false;
  const pt = [Number(lon), Number(lat)];
  if (apPolygon.type === 'Polygon') {
    return isPointInPolygon(pt, apPolygon.coordinates[0]);
  } else if (apPolygon.type === 'MultiPolygon') {
    return apPolygon.coordinates.some(ring => isPointInPolygon(pt, ring[0]));
  }
  return false;
}

function fetchJson(targetUrl, headers = {}, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    try {
      const parsed = new URL(targetUrl);
      const client = parsed.protocol === 'https:' ? https : http;
      const req = client.request(parsed, {
        method: 'GET',
        headers: {
          'User-Agent': 'Risk2Rescue-CPCB-Ingest/2.0 (Disaster-Management-Platform)',
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
      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error(safeText(`Request timeout after ${timeoutMs}ms`)));
      });
      req.end();
    } catch (e) {
      reject(e);
    }
  });
}

/**
 * Normalises state name (e.g. "Andhra_Pradesh", "Andhra Pradesh", "A.P.")
 */
function isAndhraPradesh(stateName) {
  if (!stateName) return false;
  const s = stateName.toLowerCase().replace(/[^a-z]/g, '');
  return s === 'andhrapradesh' || s === 'ap';
}

/**
 * Calculates official CPCB Indian National Air Quality Index (NAQI) sub-index
 */
function calculateCpcbSubIndex(conc, pollutant) {
  if (conc === null || conc === undefined || isNaN(conc) || conc < 0) return null;
  let breakpoints = [];
  if (pollutant === 'PM2.5') {
    breakpoints = [
      [0, 30, 0, 50],
      [31, 60, 51, 100],
      [61, 90, 101, 200],
      [91, 120, 201, 300],
      [121, 250, 301, 400],
      [250, 500, 401, 500]
    ];
  } else if (pollutant === 'PM10') {
    breakpoints = [
      [0, 50, 0, 50],
      [51, 100, 51, 100],
      [101, 250, 101, 200],
      [251, 350, 201, 300],
      [351, 430, 301, 400],
      [430, 600, 401, 500]
    ];
  } else if (pollutant === 'NO2') {
    breakpoints = [
      [0, 40, 0, 50],
      [41, 80, 51, 100],
      [81, 180, 101, 200],
      [181, 280, 201, 300],
      [281, 400, 301, 400],
      [400, 600, 401, 500]
    ];
  } else {
    return null;
  }

  for (const [bpLo, bpHi, iLo, iHi] of breakpoints) {
    if (conc >= bpLo && conc <= bpHi) {
      return Math.round(((iHi - iLo) / (bpHi - bpLo)) * (conc - bpLo) + iLo);
    }
  }
  if (conc > breakpoints[breakpoints.length - 1][1]) return 500;
  return null;
}

/**
 * Calculates AQI category and color from index value
 */
function getAqiCategory(aqi) {
  if (aqi === null || aqi === undefined || isNaN(aqi)) return { category: 'Unavailable', color: '#94a3b8' };
  const val = Math.round(aqi);
  if (val <= 50)  return { category: 'Good', color: '#22c55e' };
  if (val <= 100) return { category: 'Satisfactory', color: '#84cc16' };
  if (val <= 200) return { category: 'Moderate', color: '#eab308' };
  if (val <= 300) return { category: 'Poor', color: '#f97316' };
  if (val <= 400) return { category: 'Very Poor', color: '#ef4444' };
  return { category: 'Severe', color: '#7e22ce' };
}

/**
 * Fetches real CPCB air quality from data.gov.in
 */
async function getCpcbAirQuality() {
  const apiKey = process.env.DATA_GOV_IN_API_KEY || process.env.CPCB_API_KEY;
  const resourceId = process.env.DATA_GOV_IN_AQI_RESOURCE_ID;

  if (!apiKey || apiKey.trim() === '') {
    return {
      success: false,
      status: 'NOT_CONFIGURED',
      sourceId: 'cpcb_airquality',
      agency: 'Central Pollution Control Board (CPCB / MoEFCC)',
      error: 'DATA_GOV_IN_API_KEY is not configured in .env',
      stations: [],
      summary: null
    };
  }

  if (!resourceId || resourceId.trim() === '') {
    return {
      success: false,
      status: 'UNAVAILABLE',
      sourceId: 'cpcb_airquality',
      agency: 'Central Pollution Control Board (CPCB / MoEFCC)',
      error: 'DATA_GOV_IN_AQI_RESOURCE_ID is missing or not configured in .env',
      stations: [],
      summary: null
    };
  }

  const now = Date.now();
  if (cpcbCache.data && now < cpcbCache.expiresAt) {
    return { ...cpcbCache.data, cached: true };
  }

  const url = `https://api.data.gov.in/resource/${resourceId}?api-key=${encodeURIComponent(apiKey)}&format=json&limit=500`;

  try {
    const json = await fetchJson(url, {}, 9000);
    const records = json.records || [];

    // Filter to Andhra Pradesh records
    const apRecords = records.filter(r => isAndhraPradesh(r.state));

    // Group pollutants by station
    const stationsMap = new Map();
    const THREE_HOURS_MS = 3 * 60 * 60 * 1000;
    let staleCount = 0;

    for (const rec of apRecords) {
      const stationKey = (rec.station || `${rec.city}_${rec.latitude}`).trim();
      if (!stationKey) continue;

      if (!stationsMap.has(stationKey)) {
        // Parse last_update timestamp (format varies: "15-09-2026 08:00:00" or ISO)
        let lastUpdateMs = null;
        let isStale = false;
        if (rec.last_update) {
          const parsedDate = new Date(rec.last_update);
          if (!isNaN(parsedDate.getTime())) {
            lastUpdateMs = parsedDate.getTime();
          } else {
            // Try DD-MM-YYYY HH:mm:ss
            const parts = rec.last_update.split(/[\s-:]/);
            if (parts.length >= 6) {
              const d = new Date(parts[2], parts[1] - 1, parts[0], parts[3], parts[4], parts[5]);
              if (!isNaN(d.getTime())) lastUpdateMs = d.getTime();
            }
          }
        }

        if (lastUpdateMs && (now - lastUpdateMs > THREE_HOURS_MS)) {
          isStale = true;
          staleCount++;
        }

        stationsMap.set(stationKey, {
          station: rec.station || stationKey,
          city: rec.city || '',
          state: rec.state || 'Andhra Pradesh',
          latitude: parseFloat(rec.latitude) || null,
          longitude: parseFloat(rec.longitude) || null,
          lastUpdate: rec.last_update || null,
          lastUpdateEpochMs: lastUpdateMs,
          isStale,
          pollutants: {}
        });
      }

      const stObj = stationsMap.get(stationKey);
      const pId = (rec.pollutant_id || 'UNKNOWN').toUpperCase();
      stObj.pollutants[pId] = {
        min: parseFloat(rec.pollutant_min) || null,
        max: parseFloat(rec.pollutant_max) || null,
        avg: parseFloat(rec.pollutant_avg) || null
      };
    }

    const stationList = Array.from(stationsMap.values());
    const totalStations = stationList.length;
    const isDegraded = totalStations > 0 && (staleCount / totalStations > 0.5);

    // Compute AP-wide summary
    let avgPm25 = null;
    let avgPm10 = null;
    let avgNo2 = null;

    const pm25Vals = stationList.map(s => s.pollutants['PM2.5']?.avg).filter(v => typeof v === 'number' && !isNaN(v));
    const pm10Vals = stationList.map(s => s.pollutants['PM10']?.avg).filter(v => typeof v === 'number' && !isNaN(v));
    const no2Vals  = stationList.map(s => s.pollutants['NO2']?.avg).filter(v => typeof v === 'number' && !isNaN(v));

    if (pm25Vals.length) avgPm25 = +(pm25Vals.reduce((a, b) => a + b, 0) / pm25Vals.length).toFixed(1);
    if (pm10Vals.length) avgPm10 = +(pm10Vals.reduce((a, b) => a + b, 0) / pm10Vals.length).toFixed(1);
    if (no2Vals.length)  avgNo2  = +(no2Vals.reduce((a, b) => a + b, 0) / no2Vals.length).toFixed(1);

    let estAqi = null;
    if (avgPm25 !== null && avgPm10 !== null) {
      const iPm25 = calculateCpcbSubIndex(avgPm25, 'PM2.5');
      const iPm10 = calculateCpcbSubIndex(avgPm10, 'PM10');
      estAqi = Math.max(iPm25 || 0, iPm10 || 0);
    } else if (avgPm25 !== null) {
      estAqi = calculateCpcbSubIndex(avgPm25, 'PM2.5');
    } else if (avgPm10 !== null) {
      estAqi = calculateCpcbSubIndex(avgPm10, 'PM10');
    }
    const aqiCat = getAqiCategory(estAqi);

    const result = {
      success: true,
      status: isDegraded ? 'DEGRADED' : 'LIVE',
      sourceId: 'cpcb_airquality',
      agency: 'Central Pollution Control Board (CPCB / MoEFCC)',
      role: 'PRIMARY',
      totalStations,
      staleStations: staleCount,
      fetchedAt: new Date().toISOString(),
      summary: {
        avgPm25,
        avgPm10,
        avgNo2,
        estimatedAqi: estAqi,
        category: aqiCat.category,
        color: aqiCat.color
      },
      stations: stationList,
      cached: false
    };

    cpcbCache = {
      data: result,
      expiresAt: now + CPCB_CACHE_TTL_MS
    };

    return result;

  } catch (err) {
    if (cpcbCache.data) {
      return { ...cpcbCache.data, cached: true, stale: true, upstreamError: err.message };
    }
    return {
      success: false,
      status: 'UNAVAILABLE',
      sourceId: 'cpcb_airquality',
      agency: 'Central Pollution Control Board (CPCB)',
      error: 'CPCB endpoint error: ' + err.message,
      stations: [],
      summary: null
    };
  }
}

/**
 * OpenAQ Ground Station Telemetry (OpenAQ v3 API)
 */
async function getOpenAqAirQuality() {
  const apiKey = process.env.OPENAQ_API_KEY;
  if (!apiKey || apiKey.trim() === '') {
    return {
      success: false,
      status: 'UNAVAILABLE',
      sourceId: 'openaq_aq',
      agency: 'OpenAQ Community Air Quality Platform',
      error: 'OPENAQ_API_KEY is missing or not configured in .env (OpenAQ v3 requires API key)',
      stations: [],
      summary: null
    };
  }

  const url = 'https://api.openaq.org/v3/locations?limit=100';
  try {
    const json = await fetchJson(url, { 'X-API-Key': apiKey }, 7000);
    const results = json.results || [];

    // Filter strictly within Andhra Pradesh operational boundary
    const apStations = results.filter(st => {
      const coords = st.coordinates;
      if (!coords || coords.latitude == null || coords.longitude == null) return false;
      return isCoordInsideAP(coords.longitude, coords.latitude);
    });

    if (apStations.length === 0) {
      return {
        success: false,
        status: 'UNAVAILABLE',
        sourceId: 'openaq_aq',
        agency: 'OpenAQ Community Air Quality Platform',
        error: 'No active OpenAQ ground stations reporting within Andhra Pradesh',
        stations: [],
        summary: null
      };
    }

    return {
      success: true,
      status: 'LIVE',
      sourceId: 'openaq_aq',
      agency: 'OpenAQ Community Air Quality Platform',
      role: 'CROSS_CHECK',
      count: apStations.length,
      stations: apStations,
      fetchedAt: new Date().toISOString()
    };
  } catch (e) {
    return {
      success: false,
      status: 'UNAVAILABLE',
      sourceId: 'openaq_aq',
      agency: 'OpenAQ Community Air Quality Platform',
      error: 'OpenAQ API request failed: ' + e.message,
      stations: [],
      summary: null
    };
  }
}

module.exports = {
  getCpcbAirQuality,
  getOpenAqAirQuality,
  getAqiCategory,
  calculateCpcbSubIndex,
  isCoordInsideAP
};
