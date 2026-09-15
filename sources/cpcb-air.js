/**
 * RISK2RESCUE — CPCB REAL-TIME AIR QUALITY INGESTION (sources/cpcb-air.js)
 * Central Pollution Control Board (CPCB) MoEFCC real-time continuous ambient air quality monitoring (CAAQMS)
 * 
 * Upstream: Open Government Data (data.gov.in)
 * Secondary: OpenAQ public ground station API (fallback when DATA_GOV_IN_API_KEY unset)
 */

const https = require('https');
const http = require('http');

const CPCB_CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes
let cpcbCache = { data: null, expiresAt: 0 };

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
              reject(new Error('JSON parse error from ' + targetUrl));
            }
          } else {
            reject(new Error(`HTTP ${res.statusCode} from ${targetUrl}`));
          }
        });
      });
      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error(`Request timeout after ${timeoutMs}ms`));
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
  const apiKey = process.env.DATA_GOV_IN_API_KEY;
  const resourceId = process.env.DATA_GOV_IN_AQI_RESOURCE_ID || '3b01bcb8-0b14-4abf-b6f2-c1bfd384ba69';

  if (!apiKey || apiKey.trim() === '') {
    return {
      success: false,
      status: 'NOT_CONFIGURED',
      error: 'DATA_GOV_IN_API_KEY is not configured in .env',
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

    const aqiCat = getAqiCategory(avgPm25 ? avgPm25 * 2 : null);

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
        estimatedAqi: avgPm25 ? Math.round(avgPm25 * 2) : null,
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
 * OpenAQ Secondary Cross-Check / Free Keyless Fallback
 */
async function getOpenAqAirQuality() {
  const url = 'https://api.openaq.org/v2/latest?country=IN&city=Visakhapatnam&limit=10';
  try {
    const json = await fetchJson(url, {}, 6000);
    const results = json.results || [];
    return {
      success: true,
      sourceId: 'openaq_aq',
      agency: 'OpenAQ Ground Stations',
      role: 'CROSS_CHECK',
      count: results.length,
      stations: results,
      fetchedAt: new Date().toISOString()
    };
  } catch (e) {
    return {
      success: false,
      sourceId: 'openaq_aq',
      agency: 'OpenAQ Ground Stations',
      error: e.message,
      stations: []
    };
  }
}

module.exports = {
  getCpcbAirQuality,
  getOpenAqAirQuality,
  getAqiCategory
};
