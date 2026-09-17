const { safeText } = require('../js/redact.js');
/**
 * RISK2RESCUE - AP WEATHER ADAPTER (sources/ap-weather.js)
 * Fetches real-time weather datasets for Andhra Pradesh from data.gov.in
 */

const { fetchJson } = require('./multi-hazard.js');

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
    return { ok: true, records: json.records || [] };
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
  getApWeather
};
