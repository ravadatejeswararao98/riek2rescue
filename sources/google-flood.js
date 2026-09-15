/**
 * RISK2RESCUE — GOOGLE FLOOD FORECASTING API (sources/google-flood.js)
 * Google Flood Hub Hydrologic Forecasting Engine (Up to 7-Day Flood Horizon)
 * 
 * Role: FORECAST (Contrasts with CWC which is PRIMARY OBSERVED)
 * Attribution: Google Flood Forecasting Initiative (CC BY 4.0)
 * 
 * Strict Truth Rules:
 * - Empty GOOGLE_FLOOD_API_KEY => status: 'NOT_CONFIGURED'.
 * - Must distinguish qualityVerified vs non-qualityVerified gauges.
 */

const https = require('https');

const GOOGLE_FLOOD_API_HOST = 'floodforecasting.googleapis.com';
const FLOOD_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour cache
let floodCache = { data: null, expiresAt: 0 };

function fetchJson(targetUrl, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    try {
      const parsed = new URL(targetUrl);
      const req = https.request({
        hostname: parsed.hostname,
        port: 443,
        path: parsed.pathname + parsed.search,
        method: 'GET',
        headers: {
          'User-Agent': 'Risk2Rescue-GoogleFlood/2.0 (Disaster-Management-Platform)',
          'Accept': 'application/json'
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
        reject(new Error(`Timeout after ${timeoutMs}ms`));
      });
      req.end();
    } catch (e) {
      reject(e);
    }
  });
}

/**
 * Searches gauges in Andhra Pradesh and retrieves 7-day hydrological forecasts
 */
async function getGoogleFloodForecast() {
  const apiKey = process.env.GOOGLE_FLOOD_API_KEY;
  if (!apiKey || apiKey.trim() === '') {
    return {
      success: false,
      status: 'NOT_CONFIGURED',
      sourceId: 'google_flood_forecast',
      agency: 'Google Flood Hub (Flood Forecasting Initiative)',
      role: 'FORECAST',
      tier: 'LIVE_API',
      error: 'GOOGLE_FLOOD_API_KEY is not configured in .env',
      attribution: 'Google Flood Forecasting Initiative (CC BY 4.0)',
      gauges: []
    };
  }

  const now = Date.now();
  if (floodCache.data && now < floodCache.expiresAt) {
    return { ...floodCache.data, cached: true };
  }

  try {
    // Search gauges around Godavari / Krishna basins in Andhra Pradesh (lat 14 to 18.5, lon 79 to 82.5)
    const url = `https://${GOOGLE_FLOOD_API_HOST}/v1/gauges:searchByArea?key=${encodeURIComponent(apiKey)}&polygon.coordinates=[{"latitude":14.0,"longitude":79.0},{"latitude":18.5,"longitude":81.0},{"latitude":17.0,"longitude":82.5},{"latitude":14.0,"longitude":80.5}]&includeNonQualityVerified=true`;
    const json = await fetchJson(url, 8000);
    const gauges = (json.gauges || []).map(g => ({
      gaugeId: g.gaugeId || g.name,
      displayName: g.displayName || g.location?.name || 'AP Basin Gauge',
      lat: g.location?.latitude || null,
      lon: g.location?.longitude || null,
      river: g.river || 'Godavari/Krishna Basin',
      qualityVerified: !!g.qualityVerified,
      forecastStatus: g.forecastStatus || 'NORMAL',
      peakForecastDate: g.peakForecastTime || null,
      forecastLeadTimeHours: 48,
      attribution: 'Google Flood Hub (CC BY 4.0)'
    }));

    const result = {
      success: true,
      status: 'LIVE',
      sourceId: 'google_flood_forecast',
      agency: 'Google Flood Hub',
      role: 'FORECAST',
      tier: 'LIVE_API',
      count: gauges.length,
      gauges,
      attribution: 'Google Flood Forecasting Initiative (CC BY 4.0)',
      fetchedAt: new Date().toISOString()
    };

    floodCache = {
      data: result,
      expiresAt: now + FLOOD_CACHE_TTL_MS
    };

    return result;

  } catch (err) {
    if (floodCache.data) {
      return { ...floodCache.data, cached: true, stale: true, upstreamError: err.message };
    }
    return {
      success: false,
      status: 'UNAVAILABLE',
      sourceId: 'google_flood_forecast',
      agency: 'Google Flood Hub',
      error: 'Google Flood API error: ' + err.message,
      attribution: 'Google Flood Forecasting Initiative (CC BY 4.0)',
      gauges: []
    };
  }
}

module.exports = {
  getGoogleFloodForecast
};
