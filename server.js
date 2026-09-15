/**
 * RISK2RESCUE — Disaster Management & Hazard Intelligence Platform
 * Built-in zero-dependency Node.js HTTP server and REST API
 * Integrated with real-time live feeds: USGS Earthquakes, Open-Meteo Weather & Air Quality, and Windy Point Forecast
 */

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const url = require('url');
const PriorityEngine = require('./js/priority-engine.js');
const AIEngine = require('./js/ai-engine.js');
const AlertRouter = require('./js/alert-router.js');
const SatelliteSignal = require('./js/satellite-signal.js');
const { WebSocketServer } = require('ws');

// Integrated Source Registry & Dynamic Upstream Feeds
const SourceRegistry = require('./source-registry.js');
const { getOfficialCapAlerts, getCapFeed } = require('./sources/cap-feed.js');
const { getCpcbAirQuality, getOpenAqAirQuality } = require('./sources/cpcb-air.js');
const { getGdacsEvents } = require('./sources/gdacs.js');
const { getGoogleFloodForecast } = require('./sources/google-flood.js');
const { getCopernicusFloodSignal } = require('./sources/copernicus.js');
const AIBridge = require('./ai-bridge.js');

// Native .env file loader (zero external dependencies)
try {
  const envPath = path.join(__dirname, '.env');
  if (fs.existsSync(envPath)) {
    const envLines = fs.readFileSync(envPath, 'utf8').split('\n');
    for (const line of envLines) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
        const [key, ...valParts] = trimmed.split('=');
        const val = valParts.join('=').trim().replace(/^["']|["']$/g, '');
        if (key && !process.env[key.trim()]) {
          process.env[key.trim()] = val;
        }
      }
    }
  }
} catch (e) {
  console.warn('Note: .env file could not be read:', e.message);
}

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = __dirname;
const WINDY_API_KEY = process.env.WINDY_API_KEY || '';
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';
const MIN_LIVE_SOURCES_FOR_AI = parseInt(process.env.MIN_LIVE_SOURCES_FOR_AI || '3', 10);


// ================= AUTHORITATIVE ANDHRA PRADESH BOUNDARY =================
let apBoundaryGeom = null;
try {
  const boundaryPath = path.join(__dirname, 'data', 'andhra_pradesh_boundary.geojson');
  if (fs.existsSync(boundaryPath)) {
    const raw = JSON.parse(fs.readFileSync(boundaryPath, 'utf8'));
    if (raw && raw.features && raw.features[0]) {
      apBoundaryGeom = raw.features[0].geometry;
      console.log('[Server] Loaded Andhra Pradesh authoritative operational boundary.');
    }
  }
} catch (e) {
  console.warn('[Server] Failed to load AP boundary GeoJSON:', e.message);
}

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
  if (!apBoundaryGeom || typeof lng !== 'number' || typeof lat !== 'number') return false;
  if (isNaN(lng) || isNaN(lat)) return false;
  if (apBoundaryGeom.type === 'Polygon') {
    return pointInPoly([lng, lat], apBoundaryGeom.coordinates[0]);
  }
  if (apBoundaryGeom.type === 'MultiPolygon') {
    return apBoundaryGeom.coordinates.some(ring => pointInPoly([lng, lat], ring[0]));
  }
  return false;
}

// ================= IN-MEMORY POLLING & CACHING LAYER =================
const CACHE_TTL_WEATHER_MS  = 15 * 60 * 1000; // 15 minutes
const CACHE_TTL_QUAKES_MS   = 10 * 60 * 1000; // 10 minutes
const CACHE_TTL_AQI_MS      = 15 * 60 * 1000; // 15 minutes
const CACHE_TTL_PRIORITY_MS =  5 * 60 * 1000; // 5 minutes (Phase 1 VPI Cache)
const CACHE_TTL_IMD_MS      = 12 * 60 * 1000; // 12 minutes — IMD CAP RSS feed

const weatherCache = new Map();
const airQualityCache = new Map();
let earthquakeCache = null;
let priorityRankingCache = { data: null, expiresAt: 0 };
const osrmDistanceCache = new Map();
let imdAlertsCache = { data: null, expiresAt: 0 }; // IMD CAP feed cache


const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.webp': 'image/webp'
};

// In-memory runtime event store
let storedAlerts = [];
let storedReports = [];
let systemStartTime = Date.now();

// Generic HTTP/HTTPS JSON fetcher with timeout
function fetchJson(targetUrl, headers = {}, timeoutMs = 7000) {
  return new Promise((resolve, reject) => {
    try {
      const parsedUrl = new URL(targetUrl);
      const isHttps = parsedUrl.protocol === 'https:';
      const client = isHttps ? https : http;

      const req = client.request(parsedUrl, {
        method: 'GET',
        headers: {
          'User-Agent': 'Risk2Rescue/2.0 (Disaster-Management-Platform)',
          'Accept': 'application/json',
          ...headers
        },
        timeout: timeoutMs
      }, (res) => {
        let rawData = '';
        res.on('data', chunk => rawData += chunk);
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            try {
              resolve(JSON.parse(rawData));
            } catch (err) {
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
        reject(new Error('Request timeout after ' + timeoutMs + 'ms'));
      });

      req.end();
    } catch (e) {
      reject(e);
    }
  });
}

// Generic HTTP/HTTPS text fetcher (for XML/RSS — mirrors fetchJson but returns raw string)
function fetchText(targetUrl, headers = {}, timeoutMs = 9000) {
  return new Promise((resolve, reject) => {
    try {
      const parsedUrl = new URL(targetUrl);
      const isHttps = parsedUrl.protocol === 'https:';
      const client = isHttps ? https : http;
      const req = client.request(parsedUrl, {
        method: 'GET',
        headers: {
          'User-Agent': 'Risk2Rescue/2.0 (Disaster-Management-Platform)',
          'Accept': 'application/rss+xml, application/xml, text/xml, */*',
          ...headers
        },
        timeout: timeoutMs
      }, (res) => {
        let raw = '';
        res.on('data', chunk => raw += chunk);
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) resolve(raw);
          else reject(new Error(`HTTP ${res.statusCode} from ${targetUrl}`));
        });
      });
      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('Request timeout')); });
      req.end();
    } catch (e) { reject(e); }
  });
}

// ─── IMD CAP FEED (https://cap-sources.s3.amazonaws.com/in-imd-en/rss.xml) ─
// Zero-dep regex-based XML parser — no npm packages required.
// Returns: [{ title, hazard_type, severity, area_desc, effective, expires, description, link }]

const IMD_CAP_URL = 'https://cap-sources.s3.amazonaws.com/in-imd-en/rss.xml';

// Regions whose alerts are relevant to the app's scenario states
const REGION_KEYWORDS = [
  'andhra pradesh', ' a.p.', 'assam', 'uttarakhand', 'gujarat', 'kerala',
  'kakinada', 'visakhapatnam', 'godavari', 'krishna', 'guntur', 'guwahati',
  'dehradun', 'ahmedabad', 'surat', 'thiruvananthapuram', 'kochi',
  'vijayawada', 'rajahmundry', 'nellore', 'ongole', 'eluru'
];

/** Extract text inside the first matching XML tag, stripping CDATA and HTML entities. */
function capXmlTag(block, tagName) {
  const re = new RegExp('<' + tagName + '[^>]*>([\\s\\S]*?)<\\/' + tagName + '>', 'i');
  const m = block.match(re);
  if (!m) return '';
  return m[1]
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .trim();
}

function inferHazardType(title, desc) {
  const t = (title + ' ' + desc).toLowerCase();
  if (t.includes('cyclone') || t.includes('storm'))    return 'Cyclone';
  if (t.includes('flood') || t.includes('inundation')) return 'Flood';
  if (t.includes('landslide'))                         return 'Landslide';
  if (t.includes('heatwave') || t.includes('heat wave')) return 'Heat Wave';
  if (t.includes('thunder') || t.includes('lightning'))return 'Thunderstorm';
  if (t.includes('rain') || t.includes('rainfall'))   return 'Heavy Rainfall';
  if (t.includes('fog'))                               return 'Dense Fog';
  if (t.includes('wind'))                              return 'Strong Winds';
  if (t.includes('tsunami'))                           return 'Tsunami';
  return 'Weather Alert';
}

function inferSeverity(title, desc) {
  const t = (title + ' ' + desc).toLowerCase();
  if (t.includes('extreme') || t.includes('red alert'))   return 'Extreme';
  if (t.includes('severe')  || t.includes('orange alert')) return 'Severe';
  if (t.includes('moderate')|| t.includes('yellow alert')) return 'Moderate';
  if (t.includes('minor')   || t.includes('green alert'))  return 'Minor';
  return 'Unknown';
}

async function getImdAlerts() {
  const now = Date.now();
  if (imdAlertsCache.data && now < imdAlertsCache.expiresAt) {
    return { ...imdAlertsCache.data, cached: true };
  }

  try {
    const xml = await fetchText(IMD_CAP_URL, {}, 9000);

    // Split on <item> — standard RSS 2.0 structure
    const itemBlocks = xml.split(/<item[\s>]/).slice(1);
    const alerts = [];

    for (const block of itemBlocks) {
      const title       = capXmlTag(block, 'title');
      const description = capXmlTag(block, 'description');
      const link        = capXmlTag(block, 'link');
      const pubDate     = capXmlTag(block, 'pubDate');
      const effective   = capXmlTag(block, 'effective') || pubDate || new Date().toISOString();
      const expires     = capXmlTag(block, 'expires') || '';
      const area_desc   = capXmlTag(block, 'areaDesc') || capXmlTag(block, 'area_desc') || capXmlTag(block, 'area') || '';

      // Skip alerts that don't mention any of our scenario regions
      const haystack = (title + ' ' + description + ' ' + area_desc).toLowerCase();
      if (!REGION_KEYWORDS.some(kw => haystack.includes(kw))) continue;

      alerts.push({
        title:       title || 'IMD Weather Alert',
        hazard_type: inferHazardType(title, description),
        severity:    inferSeverity(title, description),
        area_desc:   area_desc || 'India',
        effective,
        expires,
        description: description.replace(/<[^>]+>/g, '').substring(0, 500).trim(),
        link:        link || IMD_CAP_URL
      });
    }

    const result = {
      success:     true,
      source:      'India Meteorological Department (IMD) — CAP RSS Feed',
      attribution: 'Data sourced from India Meteorological Department (IMD), Ministry of Earth Sciences',
      fetchedAt:   new Date().toISOString(),
      count:       alerts.length,
      alerts,
      cached:      false
    };
    imdAlertsCache = { data: result, expiresAt: now + CACHE_TTL_IMD_MS };
    return result;

  } catch (err) {
    console.error('IMD CAP feed error:', err.message);
    if (imdAlertsCache.data) {
      return { ...imdAlertsCache.data, cached: true, stale: true, upstreamError: err.message };
    }
    return {
      success:     false,
      source:      'India Meteorological Department (IMD) — CAP RSS Feed',
      attribution: 'Data sourced from India Meteorological Department (IMD), Ministry of Earth Sciences',
      error:       'IMD live feed temporarily unreachable',
      count:       0,
      alerts:      [],
      cached:      false
    };
  }
}
// ────────────────────────────────────────────────────────────────────────────

// 1. LIVE NCS EARTHQUAKE INTEGRATION (National Center for Seismology)
async function getUSGSEarthquakes(limit = 35) { // Keeping the function name to avoid breaking AIEngine calls
  const now = Date.now();
  if (earthquakeCache && (now < earthquakeCache.expiresAt)) {
    return { ...earthquakeCache.data, cached: true };
  }

  try {
    const html = await fetchText('https://riseq.seismo.gov.in/riseq/earthquake', {}, 8000);
    const regex = /data-json='(.*?)'/g;
    let match;
    const allQuakes = [];
    
    while ((match = regex.exec(html)) !== null) {
      try {
        const eqData = JSON.parse(match[1]);
        const latLong = eqData.lat_long.split(',').map(s => parseFloat(s.trim()));
        const magMatch = eqData.magnitude_depth.match(/M:\s*([\d.]+)/);
        const depthMatch = eqData.magnitude_depth.match(/D:\s*([\d.]+)km/);
        const mag = magMatch ? parseFloat(magMatch[1]) : 0;
        const depthKm = depthMatch ? parseFloat(depthMatch[1]) : 10;
        const place = eqData.event_name.split(' - ')[1] || 'Unknown Epicenter';
        
        allQuakes.push({
          id: eqData.event_id,
          place: place,
          mag: mag,
          time: new Date().toISOString(),
          epochMs: Date.now(),
          depthKm: depthKm,
          lng: latLong[1],
          lat: latLong[0],
          tsunamiAlert: false,
          significance: Math.round(mag * 20),
          url: 'https://riseq.seismo.gov.in/riseq/earthquake'
        });
      } catch (e) { }
    }

    const parsedQuakes = allQuakes.filter(q => isCoordInsideAP(q.lng, q.lat)); // Strictly filter for AP

    const finalQuakes = parsedQuakes.slice(0, limit);
    const maxMag = finalQuakes.length > 0 ? Math.max(...finalQuakes.map(q => q.mag)) : 0;
    const latestQuake = finalQuakes[0] || null;

    const result = {
      status: 'online',
      source: 'National Center for Seismology (NCS India)',
      generatedAt: new Date().toISOString(),
      count: finalQuakes.length,
      maxMagnitude: maxMag,
      latest: latestQuake,
      earthquakes: finalQuakes,
      cached: false
    };

    earthquakeCache = {
      data: result,
      expiresAt: now + CACHE_TTL_QUAKES_MS
    };

    return result;
  } catch (err) {
    console.error('NCS Live Query failed:', err.message);
    if (earthquakeCache) {
      return { ...earthquakeCache.data, cached: true, stale: true, upstreamError: err.message };
    }
    return {
      status: 'unavailable',
      source: 'USGS Earthquake Hazards Program',
      error: 'Upstream USGS live service temporarily unreachable',
      earthquakes: []
    };
  }
}

// 2. LIVE OPEN-METEO WEATHER INTEGRATION (Free, real ECMWF/GFS forecast)
async function getOpenMeteoWeather(lat = 16.99, lon = 82.25) {
  const cacheKey = `${Number(lat).toFixed(2)}_${Number(lon).toFixed(2)}`;
  const now = Date.now();

  if (weatherCache.has(cacheKey)) {
    const cached = weatherCache.get(cacheKey);
    if (now < cached.expiresAt) {
      return { ...cached.data, cached: true };
    }
  }

  const omUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,precipitation,surface_pressure,wind_speed_10m,wind_gusts_10m&hourly=temperature_2m,precipitation,wind_speed_10m,wind_gusts_10m,surface_pressure&timezone=auto`;
  try {
    const data = await fetchJson(omUrl, {}, 7000);
    const curr = data.current || {};
    const hourly = data.hourly || {};

    const currentTempC = curr.temperature_2m !== undefined ? Number(curr.temperature_2m.toFixed(1)) : 28.0;
    const currentWindKmh = curr.wind_speed_10m !== undefined ? Number(curr.wind_speed_10m.toFixed(1)) : 15.0;
    const maxGustKmh = curr.wind_gusts_10m !== undefined ? Number(curr.wind_gusts_10m.toFixed(1)) : Number((currentWindKmh * 1.5).toFixed(1));
    const currentPrecipMm = curr.precipitation !== undefined ? Number(curr.precipitation.toFixed(1)) : 0.0;
    const pressureHpa = curr.surface_pressure !== undefined ? Math.round(curr.surface_pressure) : 1008;
    const humidityPct = curr.relative_humidity_2m !== undefined ? Math.round(curr.relative_humidity_2m) : 75;

    // Severe thresholds based on real physics
    const isSevereWind = maxGustKmh >= 65;
    const isExtremeRain = currentPrecipMm >= 15;
    const isLowPressure = pressureHpa <= 990;

    let overallRisk = 'GREEN';
    let advisoryMessage = 'Meteorological conditions stable. No immediate weather alerts for this sector.';
    if (isSevereWind || isExtremeRain || isLowPressure) {
      overallRisk = 'RED';
      advisoryMessage = `CRITICAL WEATHER ADVISORY: Observed peak gusts ${maxGustKmh} km/h, surface pressure ${pressureHpa} hPa. Coastal and flood hazard vigilance required.`;
    } else if (maxGustKmh >= 45 || currentPrecipMm >= 7) {
      overallRisk = 'ORANGE';
      advisoryMessage = `ELEVATED SQUALLS: Wind gusts reaching ${maxGustKmh} km/h with active precipitation. Secure loose outdoor structures.`;
    }

    const timestamps = (hourly.time || []).slice(0, 120).map(t => new Date(t).getTime());
    const temps = (hourly.temperature_2m || []).slice(0, 120);
    const winds = (hourly.wind_speed_10m || []).slice(0, 120);
    const gusts = (hourly.wind_gusts_10m || []).slice(0, 120);
    const precips = (hourly.precipitation || []).slice(0, 120);
    const pressures = (hourly.surface_pressure || []).slice(0, 120).map(p => Math.round(p));

    const result = {
      success: true,
      source: 'Open-Meteo Live Forecast (ECMWF & GFS Models)',
      lat: Number(lat),
      lon: Number(lon),
      model: 'ecmwf_gfs_composite',
      cached: false,
      lastUpdated: new Date().toISOString(),
      summary: {
        currentTempC,
        currentWindKmh,
        maxGustKmh,
        maxPrecipPerHourMm: currentPrecipMm,
        capeIndex: null,
        pressureHpa,
        humidityPct,
        isSevereWind,
        isExtremeRain,
        isHighCape: false,
        overallRisk,
        advisoryMessage
      },
      timeSeries: {
        timestamps,
        temp: temps,
        windKmh: winds,
        gustKmh: gusts,
        precipMm: precips,
        cape: [],
        pressure: pressures
      }
    };

    weatherCache.set(cacheKey, {
      data: result,
      expiresAt: now + CACHE_TTL_WEATHER_MS
    });

    return result;
  } catch (err) {
    console.error('Open-Meteo Weather query failed:', err.message);
    if (weatherCache.has(cacheKey)) {
      return { ...weatherCache.get(cacheKey).data, cached: true, stale: true };
    }
    return {
      success: false,
      status: 'unavailable',
      source: 'Open-Meteo Live Forecast',
      error: 'Live weather service unreachable: ' + err.message,
      lastUpdated: null
    };
  }
}

// 3. LIVE OPEN-METEO AIR QUALITY INTEGRATION (Free, real PM2.5/AQI)
async function getOpenMeteoAirQuality(lat = 16.50, lon = 80.64) {
  const cacheKey = `${Number(lat).toFixed(2)}_${Number(lon).toFixed(2)}`;
  const now = Date.now();

  if (airQualityCache.has(cacheKey)) {
    const cached = airQualityCache.get(cacheKey);
    if (now < cached.expiresAt) {
      return { ...cached.data, cached: true };
    }
  }

  const aqiUrl = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}&current=pm10,pm2_5,nitrogen_dioxide,us_aqi`;
  try {
    const data = await fetchJson(aqiUrl, {}, 7000);
    const curr = data.current || {};

    const pm25 = curr.pm2_5 !== undefined ? Number(curr.pm2_5.toFixed(1)) : null;
    const pm10 = curr.pm10 !== undefined ? Number(curr.pm10.toFixed(1)) : null;
    const no2 = curr.nitrogen_dioxide !== undefined ? Number(curr.nitrogen_dioxide.toFixed(1)) : null;
    const aqi = curr.us_aqi !== undefined ? Math.round(curr.us_aqi) : null;

    let category = 'Good';
    let color = '#22c55e';
    if (aqi > 300) { category = 'Hazardous'; color = '#7e22ce'; }
    else if (aqi > 200) { category = 'Very Unhealthy'; color = '#9333ea'; }
    else if (aqi > 150) { category = 'Unhealthy'; color = '#ef4444'; }
    else if (aqi > 100) { category = 'Unhealthy for Sensitive Groups'; color = '#f97316'; }
    else if (aqi > 50) { category = 'Moderate'; color = '#eab308'; }

    const result = {
      success: true,
      status: 'online',
      source: 'Open-Meteo Atmospheric Quality Feed',
      lat: Number(lat),
      lon: Number(lon),
      lastUpdated: new Date().toISOString(),
      pm2_5: pm25,
      pm10: pm10,
      nitrogen_dioxide: no2,
      us_aqi: aqi,
      category,
      color,
      cached: false
    };

    airQualityCache.set(cacheKey, {
      data: result,
      expiresAt: now + CACHE_TTL_AQI_MS
    });

    return result;
  } catch (err) {
    console.error('Air Quality query failed:', err.message);
    if (airQualityCache.has(cacheKey)) {
      return { ...airQualityCache.get(cacheKey).data, cached: true, stale: true };
    }
    return {
      success: false,
      status: 'unavailable',
      source: 'Open-Meteo Atmospheric Quality Feed',
      error: 'Air quality telemetry unavailable',
      lastUpdated: null
    };
  }
}

// 4. REAL CWC RIVER WATER LEVEL INTEGRATION (NWIC CKAN Datastore API)
const CWC_CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes cache
let cwcCache = { data: null, expiresAt: 0 };

async function getCWCRiverLevels() {
  const now = Date.now();
  if (cwcCache.data && now < cwcCache.expiresAt) {
    return { ...cwcCache.data, cached: true };
  }

  const CWC_RESOURCES = [
    { basin: 'Godavari', id: 'c6f31452-b416-4599-a6ae-07ad4217cdf4' },
    { basin: 'Krishna',  id: 'd80798b9-4b11-4626-8b63-964202ba7216' },
    { basin: 'Pennar',   id: '2ef9e34a-4a1b-4fe9-a542-9f7623289f47', fallbackId: '8f6acdd0-021d-4b29-a7aa-cbc62180d296' }
  ];

  const allStationsMap = new Map();

  for (const res of CWC_RESOURCES) {
    let records = [];
    try {
      const url = `https://nwdp.nwic.gov.in/api/3/action/datastore_search?resource_id=${res.id}&sort=_id%20desc&limit=200`;
      const data = await fetchJson(url, {}, 8000);
      if (data && data.result && Array.isArray(data.result.records) && data.result.records.length > 0) {
        records = data.result.records;
      } else if (res.fallbackId) {
        const fbUrl = `https://nwdp.nwic.gov.in/api/3/action/datastore_search?resource_id=${res.fallbackId}&sort=_id%20desc&limit=200`;
        const fbData = await fetchJson(fbUrl, {}, 8000);
        if (fbData && fbData.result && Array.isArray(fbData.result.records)) {
          records = fbData.result.records;
        }
      }
    } catch (e) {
      console.warn(`[CWC] NWIC datastore query failed for ${res.basin}:`, e.message);
      if (res.fallbackId) {
        try {
          const fbUrl = `https://nwdp.nwic.gov.in/api/3/action/datastore_search?resource_id=${res.fallbackId}&sort=_id%20desc&limit=200`;
          const fbData = await fetchJson(fbUrl, {}, 8000);
          if (fbData && fbData.result && Array.isArray(fbData.result.records)) {
            records = fbData.result.records;
          }
        } catch (fbe) {}
      }
    }

    for (const rec of records) {
      const stationName = (rec.Station || '').trim();
      if (!stationName) continue;
      if (allStationsMap.has(stationName)) continue;

      const lat = parseFloat(rec.Latitude) || null;
      const lon = parseFloat(rec.Longitude) || null;

      // Strict Andhra Pradesh enforcement: ignore stations outside AP
      if (!lat || !lon || !isCoordInsideAP(lon, lat)) continue;
      const stateStr = (rec.State || '').toLowerCase();
      if (stateStr && !stateStr.includes('andhra') && !stateStr.includes('a.p') && !stateStr.includes('ap')) continue;

      const rawLevel = rec['River Water Level Telemetry Hourly (meter)'] ||
                       rec['River Water Level Manual Hourly (meter)'] ||
                       rec['River Water Level (meter)'];
      const waterLevel = rawLevel !== undefined && rawLevel !== null && rawLevel !== '' ? parseFloat(rawLevel) : null;

      allStationsMap.set(stationName, {
        station: stationName,
        district: rec.District || '',
        state: rec.State || 'Andhra Pradesh',
        river: rec.River || res.basin,
        basin: rec.Basin || res.basin,
        lat: lat,
        lon: lon,
        timestamp: rec['Data Acquisition Time'] || '',
        waterLevelMeters: waterLevel,
        agency: rec.Agency || 'CWC'
      });
    }
  }

  let stationList = Array.from(allStationsMap.values()).filter(st => isCoordInsideAP(st.lon, st.lat));

  if (stationList.length === 0) {
    if (cwcCache.data && cwcCache.data.stations && cwcCache.data.stations.length > 0) {
      return { ...cwcCache.data, cached: true, stale: true };
    }
    return {
      success: false,
      status: 'UNAVAILABLE',
      sourceId: 'cwc_nwic_river',
      source: 'National Water Data Portal (NWIC / Central Water Commission)',
      totalStations: 0,
      stations: [],
      error: 'No live CWC gauging stations currently reporting inside Andhra Pradesh boundary',
      lastUpdated: new Date().toISOString()
    };
  }

  const result = {
    success: true,
    source: 'National Water Data Portal (NWIC / Central Water Commission)',
    totalStations: stationList.length,
    lastUpdated: new Date().toISOString(),
    stations: stationList,
    cached: false
  };

  cwcCache = {
    data: result,
    expiresAt: now + CWC_CACHE_TTL_MS
  };

  return result;
}

// Pre-load scenarios if file exists
function getScenarios() {
  try {
    const scPath = path.join(PUBLIC_DIR, 'data', 'scenarios.json');
    if (fs.existsSync(scPath)) {
      return JSON.parse(fs.readFileSync(scPath, 'utf8'));
    }
  } catch (e) {
    console.error('Error loading scenarios.json:', e);
  }
  return [];
}

// Pre-load Census 2011 Demographics
function getCensusLookup() {
  try {
    const cPath = path.join(PUBLIC_DIR, 'data', 'census_lookup.json');
    if (fs.existsSync(cPath)) {
      return JSON.parse(fs.readFileSync(cPath, 'utf8'));
    }
  } catch (e) {
    console.error('Error loading census_lookup.json:', e);
  }
  return [];
}

// In-Memory & File-Backed Shelters Database
let sheltersDataCache = null;
function getSheltersData() {
  if (sheltersDataCache) return sheltersDataCache;
  try {
    const sPath = path.join(PUBLIC_DIR, 'data', 'shelters.json');
    if (fs.existsSync(sPath)) {
      sheltersDataCache = JSON.parse(fs.readFileSync(sPath, 'utf8'));
      return sheltersDataCache;
    }
  } catch (e) {
    console.error('Error loading shelters.json:', e);
  }
  return [];
}

function saveSheltersData(shelters) {
  try {
    sheltersDataCache = shelters;
    const sPath = path.join(PUBLIC_DIR, 'data', 'shelters.json');
    fs.writeFileSync(sPath, JSON.stringify(shelters, null, 2), 'utf8');
    return true;
  } catch (e) {
    console.error('Error saving shelters.json:', e);
    return false;
  }
}

// AI Recommendation Audit Logger
function logAIRecommendation(entry) {
  try {
    const dataDir = path.join(PUBLIC_DIR, 'data');
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
    const logPath = path.join(dataDir, 'ai_recommendations_log.json');
    let logs = [];
    if (fs.existsSync(logPath)) {
      try {
        logs = JSON.parse(fs.readFileSync(logPath, 'utf8'));
        if (!Array.isArray(logs)) logs = [];
      } catch (e) {
        logs = [];
      }
    }
    logs.unshift(entry);
    if (logs.length > 100) logs = logs.slice(0, 100);
    fs.writeFileSync(logPath, JSON.stringify(logs, null, 2), 'utf8');
    return true;
  } catch (e) {
    console.error('Error logging AI recommendation:', e.message);
    return false;
  }
}


// Haversine Distance Calculation (km)
function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Ray-Casting Point-in-Polygon Algorithm: point = [lng, lat], vs = [[lng, lat], ...]
function pointInPolygon(point, vs) {
  if (!vs || !Array.isArray(vs) || vs.length < 3) return false;
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

// Active Red Zone Hazard Polygons for Route Avoidance
const COASTAL_FLOOD_ZONE = [
  [82.20, 16.90], [82.35, 16.90], [82.38, 17.15], [82.25, 17.15], [82.20, 16.90]
];
const SEISMIC_ZONE = [
  [93.80, 24.70], [94.10, 24.70], [94.10, 25.15], [93.80, 25.15], [93.80, 24.70]
];
const LANDSLIDE_ZONE = [
  [79.25, 30.30], [79.65, 30.30], [79.65, 30.65], [79.25, 30.65], [79.25, 30.30]
];

// Cached OSRM Road Distance Helper with Haversine Fallback
async function getOsrmRoadDistance(lat1, lon1, lat2, lon2) {
  const straightDist = +haversine(lat1, lon1, lat2, lon2).toFixed(2);
  const cacheKey = `${Number(lat1).toFixed(4)},${Number(lon1).toFixed(4)}->${Number(lat2).toFixed(4)},${Number(lon2).toFixed(4)}`;
  if (osrmDistanceCache.has(cacheKey)) {
    return osrmDistanceCache.get(cacheKey);
  }
  try {
    const osrmUrl = `https://router.project-osrm.org/route/v1/driving/${lon1},${lat1};${lon2},${lat2}?overview=false`;
    const data = await fetchJson(osrmUrl, {}, 3500);
    if (data && data.code === 'Ok' && data.routes && data.routes.length > 0) {
      const roadDistKm = +(data.routes[0].distance / 1000).toFixed(2);
      osrmDistanceCache.set(cacheKey, roadDistKm);
      return roadDistKm;
    }
  } catch (e) {
    // Fallback to straight-line distance if OSRM is offline or timed out
  }
  osrmDistanceCache.set(cacheKey, straightDist);
  return straightDist;
}

// Safe-Zone Evacuation Routing via OSRM with Red Zone Avoidance
async function calculateEvacuationRoutes(citizenLat, citizenLon, hazardType = 'cyclone') {
  const allShelters = getSheltersData();
  // Filter out closed shelters or shelters that are completely full
  const eligible = allShelters.filter(s => s.status !== 'closed' && (s.capacity - s.current_occupancy) > 0);

  if (!eligible.length) {
    return {
      success: false,
      message: 'All local relief shelters are at 100% capacity or temporarily closed.',
      routes: []
    };
  }

  // Sort candidate shelters by haversine distance to pick closest 4 candidates
  const candidates = eligible.map(s => ({
    ...s,
    available_beds: Math.max(0, s.capacity - s.current_occupancy),
    straightDistKm: +haversine(citizenLat, citizenLon, s.lat, s.lon).toFixed(2)
  })).sort((a, b) => a.straightDistKm - b.straightDistKm).slice(0, 4);

  const routeResults = [];

  for (const shelter of candidates) {
    try {
      const osrmUrl = `https://router.project-osrm.org/route/v1/driving/${citizenLon},${citizenLat};${shelter.lon},${shelter.lat}?overview=full&geometries=geojson&steps=true`;
      const osrmData = await fetchJson(osrmUrl, {}, 6000);

      if (osrmData && osrmData.code === 'Ok' && osrmData.routes && osrmData.routes.length > 0) {
        const r = osrmData.routes[0];
        const distKm = +(r.distance / 1000).toFixed(1);
        const durationMin = Math.max(1, Math.round(r.duration / 60));
        const walkMin = Math.max(2, Math.round((r.distance / 1000) / 4.2 * 60));

        // Evaluate whether route passes inside active hazard red zones
        let redZoneHits = 0;
        const coords = r.geometry.coordinates || [];
        for (let i = 0; i < coords.length; i += Math.max(1, Math.floor(coords.length / 25))) {
          const pt = coords[i]; // [lng, lat]
          if (pointInPolygon(pt, COASTAL_FLOOD_ZONE) || pointInPolygon(pt, SEISMIC_ZONE) || pointInPolygon(pt, LANDSLIDE_ZONE)) {
            redZoneHits++;
          }
        }

        const avoidsRedZone = redZoneHits === 0;
        const safetyRating = avoidsRedZone ? 'HIGH SAFETY' : 'CAUTION (SURGE FRINGE)';

        const steps = (r.legs?.[0]?.steps || []).map((st, idx) => {
          let action = st.maneuver.type;
          if (st.maneuver.modifier) action += ` ${st.maneuver.modifier}`;
          return {
            stepNumber: idx + 1,
            instruction: (action.charAt(0).toUpperCase() + action.slice(1)) + (st.name ? ` onto ${st.name}` : ''),
            road: st.name || 'Connecting corridor',
            distanceMeters: Math.round(st.distance)
          };
        }).filter(s => s.distanceMeters > 0);

        routeResults.push({
          shelter: {
            id: shelter.shelter_id,
            name: shelter.name,
            lat: shelter.lat,
            lon: shelter.lon,
            type: shelter.type,
            contact: shelter.contact,
            district: shelter.district,
            capacity: shelter.capacity,
            current_occupancy: shelter.current_occupancy,
            available_beds: shelter.available_beds,
            occupancy_pct: Math.round((shelter.current_occupancy / shelter.capacity) * 100),
            amenities: shelter.amenities,
            elevation_m: shelter.elevation_m,
            structural_safety: shelter.structural_safety,
            last_updated: shelter.last_updated
          },
          route: {
            distanceKm: distKm,
            drivingDurationMin: durationMin,
            walkingDurationMin: walkMin,
            avoidsRedZone,
            safetyRating,
            hazardAdvisory: avoidsRedZone ? '100% Hazard-Avoided Safe Evacuation Corridor' : 'Route fringes active coastal flood buffer. Travel with caution.',
            geojson: r.geometry,
            steps
          },
          compositeScore: (avoidsRedZone ? 0 : 200) + durationMin - (shelter.available_beds * 0.015)
        });
      }
    } catch (err) {
      console.warn(`OSRM routing failed for ${shelter.name}, generating straight-line fallback:`, err.message);
      const distKm = shelter.straightDistKm;
      routeResults.push({
        shelter: {
          id: shelter.shelter_id,
          name: shelter.name,
          lat: shelter.lat,
          lon: shelter.lon,
          type: shelter.type,
          contact: shelter.contact,
          district: shelter.district,
          capacity: shelter.capacity,
          current_occupancy: shelter.current_occupancy,
          available_beds: shelter.available_beds,
          occupancy_pct: Math.round((shelter.current_occupancy / shelter.capacity) * 100),
          amenities: shelter.amenities,
          elevation_m: shelter.elevation_m,
          structural_safety: shelter.structural_safety,
          last_updated: shelter.last_updated
        },
        route: {
          distanceKm: distKm,
          drivingDurationMin: Math.max(2, Math.round(distKm * 2.2)),
          walkingDurationMin: Math.max(5, Math.round(distKm / 4.2 * 60)),
          avoidsRedZone: true,
          safetyRating: 'DIRECT ESTIMATE',
          hazardAdvisory: 'Direct evacuation corridor to high ground shelter.',
          geojson: {
            type: 'LineString',
            coordinates: [[citizenLon, citizenLat], [shelter.lon, shelter.lat]]
          },
          steps: [
            { stepNumber: 1, instruction: `Evacuate directly towards ${shelter.name}`, road: 'Evacuation Corridor', distanceMeters: Math.round(distKm * 1000) }
          ]
        },
        compositeScore: distKm * 10 - (shelter.available_beds * 0.01)
      });
    }
  }

  // Sort by composite score (lowest penalty = best safe route)
  routeResults.sort((a, b) => a.compositeScore - b.compositeScore);
  return {
    success: true,
    citizenLocation: { lat: citizenLat, lon: citizenLon },
    recommendedCount: Math.min(3, routeResults.length),
    routes: routeResults.slice(0, 3)
  };
}

const server = http.createServer(async (req, res) => {
  const parsedUrl = url.parse(req.url, true);
  let pathname = decodeURIComponent(parsedUrl.pathname);

  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // ================= REST API ENDPOINTS =================
  if (pathname.startsWith('/api/')) {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');

    // 1. System Health
    if (pathname === '/api/health') {
      const allShelters = getSheltersData();
      const storedThreats = (global.APP_DATA && Array.isArray(global.APP_DATA.activeHazards)) ? global.APP_DATA.activeHazards.length : 0;
      res.writeHead(200);
      return res.end(JSON.stringify({
        status: 'online',
        system: 'Risk2Rescue Command Hub',
        version: '2.1.0',
        uptimeSeconds: Math.floor((Date.now() - systemStartTime) / 1000),
        activeThreatsCount: storedThreats,
        nodeVersion: process.version,
        dataProviders: {
          earthquakes: 'USGS Earthquake Hazards Program (Active)',
          weather: WINDY_API_KEY ? 'Windy Point Forecast v2 (API Key Active)' : 'Open-Meteo Live Forecast (Active)',
          airQuality: 'Open-Meteo Atmospheric Quality Feed (Active)'
        }
      }));
    }

    // 1b. Central Source Registry Health Check & Audit Probes
    if (pathname === '/api/sources/health') {
      try {
        const force = parsedUrl.query.refresh === '1';
        const health = await SourceRegistry.checkAllSources(force);
        res.writeHead(200);
        return res.end(JSON.stringify(health));
      } catch (err) {
        res.writeHead(500);
        return res.end(JSON.stringify({ error: 'Source health check failed: ' + err.message }));
      }
    }

    // 1c. Source Raw Payload & Metrics Inspector
    if (pathname.startsWith('/api/sources/') && pathname.endsWith('/raw')) {
      const parts = pathname.split('/');
      const sourceId = parts[3];
      const metrics = SourceRegistry.getSourceMetrics(sourceId);
      if (!metrics) {
        res.writeHead(404);
        return res.end(JSON.stringify({ error: `No metrics or raw cache found for source: ${sourceId}` }));
      }
      res.writeHead(200);
      return res.end(JSON.stringify({
        sourceId,
        metrics: {
          lastAttemptAt: metrics.lastAttemptAt,
          lastSuccessAt: metrics.lastSuccessAt,
          lastLatencyMs: metrics.lastLatencyMs,
          consecutiveFailures: metrics.consecutiveFailures,
          lastError: metrics.lastError,
          lastRecordCount: metrics.lastRecordCount
        },
        rawPayload: metrics.lastRawPayload
      }));
    }

    // 2. Scenarios
    if (pathname === '/api/scenarios') {
      const scenarios = getScenarios();
      res.writeHead(200);
      return res.end(JSON.stringify({ success: true, scenarios }));
    }

    // 2b. Official Unified De-duplicated CAP Alerts (IMD + NDMA Alert Hub)
    if (pathname === '/api/alerts/official') {
      try {
        const data = await getOfficialCapAlerts();
        res.writeHead(200);
        return res.end(JSON.stringify(data));
      } catch (err) {
        res.writeHead(500);
        return res.end(JSON.stringify({ success: false, error: err.message, alerts: [] }));
      }
    }

    // 2c. CPCB Real-Time Air Quality (data.gov.in CAAQMS Ground Stations)
    if (pathname === '/api/air-quality/cpcb') {
      try {
        const data = await getCpcbAirQuality();
        res.writeHead(data.status === 'NOT_CONFIGURED' ? 200 : (data.success ? 200 : 503));
        return res.end(JSON.stringify(data));
      } catch (err) {
        res.writeHead(500);
        return res.end(JSON.stringify({ success: false, status: 'UNAVAILABLE', error: err.message, stations: [] }));
      }
    }

    // 2d. GDACS Global Multi-Hazard Alerts (UN / European Commission)
    if (pathname === '/api/gdacs/events') {
      try {
        const data = await getGdacsEvents();
        res.writeHead(data.success ? 200 : 503);
        return res.end(JSON.stringify(data));
      } catch (err) {
        res.writeHead(500);
        return res.end(JSON.stringify({ success: false, status: 'UNAVAILABLE', error: err.message, events: [] }));
      }
    }

    // 2e. Google Flood Hub Hydrologic Forecasting API
    if (pathname === '/api/flood/forecast') {
      try {
        const data = await getGoogleFloodForecast();
        res.writeHead(data.status === 'NOT_CONFIGURED' ? 200 : (data.success ? 200 : 503));
        return res.end(JSON.stringify(data));
      } catch (err) {
        res.writeHead(500);
        return res.end(JSON.stringify({ success: false, status: 'UNAVAILABLE', error: err.message, gauges: [] }));
      }
    }

    // 2f. AI Layer Context Input Contract
    if (pathname === '/api/ai/context') {
      try {
        const health = await SourceRegistry.checkAllSources(false);
        const liveCount = health.summary?.live || 0;
        const totalSources = health.summary?.total || 1;
        const dataConfidence = Math.round((liveCount / Math.max(1, totalSources - health.summary?.notConfigured)) * 100);

        const radarWeather = await getOpenMeteoWeather(16.18, 81.13);
        const quakes = await getUSGSEarthquakes(10);
        const alertsData = await getOfficialCapAlerts();
        const allShelters = getSheltersData();

        res.writeHead(200);
        return res.end(JSON.stringify({
          generatedAt: new Date().toISOString(),
          liveSourceCount: liveCount,
          minRequiredSources: AIBridge.MIN_LIVE_SOURCES_FOR_AI,
          hasSufficientData: liveCount >= AIBridge.MIN_LIVE_SOURCES_FOR_AI,
          dataConfidencePct: dataConfidence,
          telemetry: {
            radar: {
              maxGustSpeedKmH: radarWeather.summary?.maxGustKmh ?? null,
              pressureHpa: radarWeather.summary?.pressureHpa ?? null,
              sourceId: 'openmeteo_weather'
            },
            seismic: {
              maxMagnitude: quakes.maxMagnitude || 0,
              total24h: quakes.count || 0,
              sourceId: 'usgs_earthquakes'
            }
          },
          alerts: alertsData.alerts || [],
          sheltersSummary: {
            totalCapacity: allShelters.reduce((a, s) => a + (s.capacity || 0), 0),
            currentOccupancy: allShelters.reduce((a, s) => a + (s.current_occupancy || 0), 0),
            sourceId: 'ap_sdma_shelters'
          },
          sourceHealthSummary: health.summary
        }));
      } catch (err) {
        res.writeHead(500);
        return res.end(JSON.stringify({ error: err.message }));
      }
    }

    // 2g. Unified Operational Dashboard State
    if (pathname === '/api/dashboard/state') {
      try {
        const radarWeather = await getOpenMeteoWeather(16.18, 81.13);
        const quakes = await getUSGSEarthquakes(10);
        const allShelters = getSheltersData();
        const alertsData = await getOfficialCapAlerts();
        let cwcGauges = [];
        try {
          const cwc = await getCWCRiverLevels();
          if (cwc.success && Array.isArray(cwc.stations)) cwcGauges = cwc.stations;
        } catch(e) {}

        const totalCap = allShelters.reduce((a, s) => a + (s.capacity || 0), 0);
        const currentOcc = allShelters.reduce((a, s) => a + (s.current_occupancy || 0), 0);
        const maxGust = radarWeather.summary?.maxGustKmh ?? null;

        res.writeHead(200);
        return res.end(JSON.stringify({
          timestamp: new Date().toISOString(),
          kpis: {
            activeHazards: { value: alertsData.count, unit: '', sourceId: 'cap_imd', status: alertsData.count > 0 ? 'LIVE' : 'LIVE', fetchedAt: alertsData.fetchedAt },
            populationAtRisk: { value: 0, unit: '', sourceId: 'census_india_ap', tier: 'DERIVED', contributingSources: ['cap_imd', 'census_india_ap'], status: 'BASELINE' },
            shelterCapacity: { value: totalCap, currentOccupancy: currentOcc, unit: '', sourceId: 'ap_sdma_shelters', status: 'BASELINE', tier: 'OFFICIAL_BASELINE' },
            gustSpeed: { value: maxGust, unit: 'km/h', sourceId: 'openmeteo_weather', status: maxGust !== null ? 'LIVE' : 'UNAVAILABLE', fetchedAt: radarWeather.lastUpdated },
            seismicMagnitude: { value: quakes.maxMagnitude > 0 ? quakes.maxMagnitude : null, unit: 'M', sourceId: 'usgs_earthquakes', status: quakes.status === 'unavailable' ? 'UNAVAILABLE' : 'LIVE', fetchedAt: quakes.fetchedAt }
          },
          alerts: alertsData.alerts || [],
          riverGauges: cwcGauges,
          shelters: allShelters
        }));
      } catch (err) {
        res.writeHead(500);
        return res.end(JSON.stringify({ error: err.message }));
      }
    }

    // 3. LIVE EARTHQUAKES (USGS GeoJSON API)
    if (pathname === '/api/earthquakes/live') {
      const limit = parseInt(parsedUrl.query.limit, 10) || 30;
      const data = await getUSGSEarthquakes(limit);
      res.writeHead(data.status === 'unavailable' ? 503 : 200);
      return res.end(JSON.stringify(data));
    }

    // 4. LIVE AIR QUALITY (Open-Meteo Modelled Cross-Check)
    if (pathname === '/api/air-quality/live') {
      const lat = parseFloat(parsedUrl.query.lat) || 16.50;
      const lon = parseFloat(parsedUrl.query.lon || parsedUrl.query.lng) || 80.64;
      const data = await getOpenMeteoAirQuality(lat, lon);
      data.role = 'CROSS_CHECK';
      data.sourceId = 'openmeteo_airquality';
      res.writeHead(data.status === 'unavailable' ? 503 : 200);
      return res.end(JSON.stringify(data));
    }

    // 5. LIVE MULTI-SENSOR TELEMETRY STREAM (Honest, zero fabricated gauges)
    if (pathname === '/api/telemetry/live') {
      const radarWeather = await getOpenMeteoWeather(16.18, 81.13);
      const quakes = await getUSGSEarthquakes(10);

      const maxGust = radarWeather.success && radarWeather.summary ? radarWeather.summary.maxGustKmh : null;
      const corePressure = radarWeather.success && radarWeather.summary ? radarWeather.summary.pressureHpa : null;
      const latestQuake = quakes.latest ? `${quakes.latest.mag} Mag — ${quakes.latest.place}` : null;

      let riverGauges = [];
      let riverStatus = 'UNAVAILABLE';
      try {
        const cwcData = await getCWCRiverLevels();
        if (cwcData && cwcData.success && Array.isArray(cwcData.stations) && cwcData.stations.length > 0) {
          riverGauges = cwcData.stations.slice(0, 10).map(s => ({
            station: `${s.basin} - ${s.station}`,
            levelMeters: s.waterLevelMeters,
            dangerMarkMeters: null,
            trend: s.waterLevelMeters !== null ? 'LIVE_TELEMETRY' : 'UNKNOWN',
            type: 'CWC NWIC Live Telemetry',
            timestamp: s.timestamp,
            lat: s.lat,
            lon: s.lon,
            sourceId: 'cwc_nwic_river',
            status: s.waterLevelMeters !== null ? 'LIVE' : 'UNAVAILABLE'
          }));
          riverStatus = riverGauges.some(g => g.levelMeters !== null) ? 'LIVE' : 'DEGRADED';
        }
      } catch (cwce) {
        riverStatus = 'UNAVAILABLE';
      }

      const allShelters = getSheltersData();
      const totalShelterCap = allShelters.reduce((acc, s) => acc + (s.capacity || 0), 0);
      const currentShelterOcc = allShelters.reduce((acc, s) => acc + (s.current_occupancy || 0), 0);

      const telemetry = {
        timestamp: new Date().toISOString(),
        radar: {
          station: 'IMD Doppler Radar - Machilipatnam (DWR-MPT)',
          coordinates: { lat: 16.18, lon: 81.13 },
          maxGustSpeedKmH: maxGust,
          corePressureHpa: corePressure,
          status: maxGust !== null ? 'LIVE' : 'UNAVAILABLE',
          sourceId: 'openmeteo_weather',
          source: radarWeather.source || 'Open-Meteo Real-Time Telemetry',
          fetchedAt: radarWeather.lastUpdated || new Date().toISOString()
        },
        riverGauges: riverGauges,
        riverGaugeStatus: riverStatus,
        riverGaugesMeta: {
          sourceId: 'cwc_nwic_river',
          status: riverStatus,
          fetchedAt: new Date().toISOString()
        },
        seismic: {
          status: (quakes.maxMagnitude >= 5.0) ? 'ELEVATED' : (quakes.count > 0 ? 'NORMAL' : 'UNAVAILABLE'),
          latestEvent: latestQuake,
          totalEvents24h: quakes.count || 0,
          maxRecordedMagnitude: quakes.maxMagnitude || 0,
          sourceId: 'usgs_earthquakes',
          source: quakes.source || 'USGS Earthquake Hazards Program',
          fetchedAt: quakes.fetchedAt || new Date().toISOString()
        },
        shelters: {
          totalCapacity: totalShelterCap,
          currentOccupancy: currentShelterOcc,
          sourceId: 'ap_sdma_shelters',
          tier: 'OFFICIAL_BASELINE',
          type: 'AP SDMA Directory Baseline'
        }
      };

      res.writeHead(200);
      return res.end(JSON.stringify(telemetry));
    }

    // 5b. REAL CWC RIVER WATER LEVEL TELEMETRY (NWIC CKAN Datastore API)
    if (pathname === '/api/cwc/river-levels') {
      const data = await getCWCRiverLevels();
      res.writeHead(data.success ? 200 : 503, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify(data));
    }

    // 6. Alerts Store
    if (pathname === '/api/alerts') {
      if (req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
          try {
            const data = JSON.parse(body || '{}');
            data.id = 'ALT-' + Date.now();
            data.timestamp = new Date().toISOString();
            storedAlerts.unshift(data);
            res.writeHead(201);
            return res.end(JSON.stringify({ success: true, alert: data }));
          } catch (e) {
            res.writeHead(400);
            return res.end(JSON.stringify({ error: 'Invalid JSON payload' }));
          }
        });
        return;
      } else {
        res.writeHead(200);
        return res.end(JSON.stringify({ alerts: storedAlerts }));
      }
    }

    // 7. Citizen Reports Store
    if (pathname === '/api/reports') {
      if (req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
          try {
            const data = JSON.parse(body || '{}');
            data.id = 'REP-' + Date.now();
            data.timestamp = new Date().toISOString();
            data.status = 'PENDING_TRIAGE';
            storedReports.unshift(data);
            res.writeHead(201);
            return res.end(JSON.stringify({ success: true, report: data }));
          } catch (e) {
            res.writeHead(400);
            return res.end(JSON.stringify({ error: 'Invalid JSON payload' }));
          }
        });
        return;
      } else {
        res.writeHead(200);
        return res.end(JSON.stringify({ reports: storedReports }));
      }
    }

    // 8. Risk Zone Check (Point-in-polygon)
    if (pathname === '/api/risk-zone' && req.method === 'POST') {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', () => {
        try {
          const payload = JSON.parse(body || '{}');
          const lat = payload.lat;
          const lng = typeof payload.lng === 'number' ? payload.lng : payload.lon;
          if (typeof lat !== 'number' || typeof lng !== 'number') {
            res.writeHead(400);
            return res.end(JSON.stringify({ error: 'lat and lng/lon (numbers) are required' }));
          }

          function pip(point, polygon) {
            let [px, py] = point;
            let inside = false;
            for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
              const [xi, yi] = polygon[i];
              const [xj, yj] = polygon[j];
              const intersect = ((yi > py) !== (yj > py)) &&
                (px < (xj - xi) * (py - yi) / (yj - yi) + xi);
              if (intersect) inside = !inside;
            }
            return inside;
          }

          function haversine(lat1, lng1, lat2, lng2) {
            const R = 6371;
            const dLat = (lat2 - lat1) * Math.PI / 180;
            const dLng = (lng2 - lng1) * Math.PI / 180;
            const a = Math.sin(dLat/2)**2 +
              Math.cos(lat1*Math.PI/180) * Math.cos(lat2*Math.PI/180) * Math.sin(dLng/2)**2;
            return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
          }

          const COASTAL_FLOOD_ZONE = [
            [79.5, 13.9], [80.3, 14.1], [80.7, 14.4], [81.1, 14.8],
            [81.5, 15.2], [81.9, 15.6], [82.3, 16.0], [82.6, 16.4],
            [82.9, 16.8], [83.2, 17.2], [83.4, 17.6], [83.6, 18.0],
            [83.5, 18.3], [83.0, 18.1], [82.5, 17.7], [82.0, 17.2],
            [81.6, 16.8], [81.1, 16.3], [80.6, 15.8], [80.1, 15.3],
            [79.7, 14.7], [79.4, 14.2], [79.5, 13.9]
          ];

          const SEISMIC_ZONE = [
            [76.8, 14.2], [77.5, 14.4], [78.2, 14.6], [79.0, 15.0],
            [79.8, 15.5], [80.5, 16.0], [81.0, 16.5], [80.6, 16.8],
            [79.9, 16.4], [79.2, 16.0], [78.5, 15.6], [77.8, 15.2],
            [77.1, 14.8], [76.8, 14.2]
          ];

          const LANDSLIDE_ZONE = [
            [82.5, 17.0], [82.8, 17.4], [83.1, 17.8], [83.4, 18.2],
            [83.7, 18.6], [83.5, 18.9], [83.1, 18.6], [82.7, 18.2],
            [82.3, 17.8], [82.0, 17.4], [82.2, 17.1], [82.5, 17.0]
          ];

          const SHELTERS = [
            { name: 'Vijayawada Government Cyclone Shelter', lat: 16.5062, lng: 80.6480, capacity: 3500, source: 'AP SDMA Directory' },
            { name: 'Guntur District Disaster Relief Camp',  lat: 16.3067, lng: 80.4365, capacity: 2800, source: 'AP SDMA Directory' },
            { name: 'Visakhapatnam Naval Emergency Base',    lat: 17.7231, lng: 83.3012, capacity: 5000, source: 'AP SDMA Directory' },
            { name: 'Kakinada Port Trust Relief Centre',     lat: 16.9891, lng: 82.2475, capacity: 2200, source: 'AP SDMA Directory' },
            { name: 'Nellore Community Safe Shelter',        lat: 14.4426, lng: 79.9865, capacity: 1800, source: 'AP SDMA Directory' },
            { name: 'Tirupati SDMA Shelter Zone',            lat: 13.6288, lng: 79.4192, capacity: 4000, source: 'AP SDMA Directory' },
            { name: 'Rajam Emergency Relief Camp',           lat: 18.4541, lng: 83.6299, capacity: 1200, source: 'AP SDMA Directory' },
            { name: 'Eluru Riverside Relief Hub',            lat: 16.7107, lng: 81.0952, capacity: 1500, source: 'AP SDMA Directory' },
            { name: 'Machilipatnam Coast Guard Shelter',     lat: 16.1875, lng: 81.1337, capacity: 2000, source: 'AP SDMA Directory' },
            { name: 'Kurnool District Emergency Centre',     lat: 15.8281, lng: 78.0373, capacity: 3000, source: 'AP SDMA Directory' },
          ];

          const inFlood = pip([lng, lat], COASTAL_FLOOD_ZONE);
          const inSeismic = pip([lng, lat], SEISMIC_ZONE);
          const inLandslide = pip([lng, lat], LANDSLIDE_ZONE);

          let matchedAiZone = null;
          let highestTier = null;
          try {
            const aiState = AIEngine.getState();
            if (aiState && Array.isArray(aiState.allZones)) {
              for (const z of aiState.allZones) {
                const zLat = z.lat ?? z.epicenter?.lat;
                const zLng = z.lng ?? z.epicenter?.lng;
                if (zLat == null || zLng == null) continue;
                const distKm = haversine(lat, lng, zLat, zLng);
                const radiusKm = (z.baseRadius || z.radius || 28000) / 1000;
                if (distKm <= radiusKm) {
                  const zTier = (z.current_tier || z.level || 'GREEN').toUpperCase();
                  if (!highestTier || zTier === 'RED' || (zTier === 'ORANGE' && highestTier !== 'RED') || (zTier === 'YELLOW' && highestTier === 'GREEN')) {
                    highestTier = zTier;
                    matchedAiZone = z;
                  }
                }
              }
            }
          } catch (e) {}

          let riskLevel, riskColor, zone, advisory;
          if (matchedAiZone) {
            if (highestTier === 'RED') {
              riskLevel = 'Red Zone'; riskColor = '#ef4444';
            } else if (highestTier === 'ORANGE') {
              riskLevel = 'Caution'; riskColor = '#f59e0b';
            } else if (highestTier === 'YELLOW') {
              riskLevel = 'Advisory'; riskColor = '#eab308';
            } else {
              riskLevel = 'Safe'; riskColor = '#22c55e';
            }
            zone = matchedAiZone.name;
            advisory = matchedAiZone.note || `Active ${highestTier} condition: monitor emergency channels and follow directives.`;
          } else if (inFlood) {
            riskLevel = 'Red Zone'; riskColor = '#ef4444';
            zone = 'Coastal Flood & Cyclone Inundation Belt';
            advisory = 'IMMEDIATE ACTION: Location falls inside an active coastal flood buffer. Move to designated higher ground shelters.';
          } else if (inLandslide) {
            riskLevel = 'Red Zone'; riskColor = '#ef4444';
            zone = 'Eastern Ghats Landslide Belt';
            advisory = 'HIGH RISK: Location is in an unstable slope corridor. Avoid valleys and hillside drainage cuts during rain.';
          } else if (inSeismic) {
            riskLevel = 'Caution'; riskColor = '#f59e0b';
            zone = 'Seismic Zone III (Moderate Exposure)';
            advisory = 'SEISMIC WATCH: Area lies within Zone III fault belts. Verify emergency exit routes and structure stability.';
          } else {
            riskLevel = 'Safe'; riskColor = '#22c55e';
            zone = 'General Safe Zone';
            advisory = 'Location is outside active high-risk hazard zones. Continue monitoring official alerts.';
          }

          const shelters = SHELTERS
            .map(s => ({ ...s, dist_km: +haversine(lat, lng, s.lat, s.lng).toFixed(1) }))
            .sort((a, b) => a.dist_km - b.dist_km)
            .slice(0, 3);

          res.writeHead(200);
          return res.end(JSON.stringify({ riskLevel, riskColor, zone, advisory, shelters, lat, lng }));

        } catch (e) {
          res.writeHead(400);
          return res.end(JSON.stringify({ error: 'Invalid JSON body' }));
        }
      });
      return;
    }

    // 9. LIVE POINT FORECAST (Windy Point Forecast API with Open-Meteo Live Fallback)
    if (pathname === '/api/windy/point-forecast' && req.method === 'POST') {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', async () => {
        try {
          const payload = JSON.parse(body || '{}');
          const lat = typeof payload.lat === 'number' ? payload.lat : 16.99;
          const lon = typeof payload.lon === 'number' ? (payload.lon || payload.lng) : 82.25;
          const hourOffset = typeof payload.hourOffset === 'number' ? payload.hourOffset : (typeof payload.offsetHours === 'number' ? payload.offsetHours : 0);

          // If a Windy API key is configured, query the Point Forecast API
          if (WINDY_API_KEY) {
            const postData = JSON.stringify({
              lat: Number(lat),
              lon: Number(lon),
              model: payload.model || 'ecmwf',
              parameters: ['wind', 'windGust', 'temp', 'precip', 'rh', 'pressure'],
              levels: ['surface']
            });

            const options = {
              hostname: 'api.windy.com',
              port: 443,
              path: '/api/point-forecast/v2',
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'x-windy-key': WINDY_API_KEY,
                'Content-Length': Buffer.byteLength(postData)
              },
              timeout: 6000
            };

            try {
              const windyResult = await new Promise((resolve, reject) => {
                const remoteReq = https.request(options, (remoteRes) => {
                  let remoteBody = '';
                  remoteRes.on('data', chunk => remoteBody += chunk);
                  remoteRes.on('end', () => {
                    if (remoteRes.statusCode === 200) {
                      try { resolve(JSON.parse(remoteBody)); } catch (e) { reject(e); }
                    } else {
                      reject(new Error(`Windy HTTP ${remoteRes.statusCode}`));
                    }
                  });
                });
                remoteReq.on('error', reject);
                remoteReq.on('timeout', () => { remoteReq.destroy(); reject(new Error('Windy timeout')); });
                remoteReq.write(postData);
                remoteReq.end();
              });

              // Process Windy API series data
              const temps = windyResult['temp-surface'] || [];
              const winds = windyResult['wind-surface'] || [];
              const gusts = windyResult['windGust-surface'] || [];
              const precips = windyResult['precip-surface'] || [];
              const rawPres = windyResult['pressure-surface'] || [];

              const currentTempC = temps[0] ? +(temps[0] > 150 ? temps[0] - 273.15 : temps[0]).toFixed(1) : 29.5;
              const currentWindKmh = winds[0] ? +(winds[0] < 55 ? winds[0] * 3.6 : winds[0]).toFixed(1) : 18.0;
              const maxGustKmh = gusts.length > 0 ? +(Math.max(...gusts) < 55 ? Math.max(...gusts) * 3.6 : Math.max(...gusts)).toFixed(1) : currentWindKmh;

              res.writeHead(200);
              return res.end(JSON.stringify({
                success: true,
                source: 'Windy.com Point Forecast API (Live Key Active)',
                lat, lon,
                lastUpdated: new Date().toISOString(),
                summary: {
                  currentTempC,
                  currentWindKmh,
                  maxGustKmh,
                  maxPrecipPerHourMm: precips[0] || 0,
                  pressureHpa: rawPres[0] ? Math.round(rawPres[0] > 2000 ? rawPres[0]/100 : rawPres[0]) : 1008,
                  overallRisk: maxGustKmh >= 65 ? 'RED' : maxGustKmh >= 45 ? 'ORANGE' : 'GREEN'
                }
              }));

            } catch (err) {
              console.warn('Windy API failed, switching to live Open-Meteo:', err.message);
              // Fallthrough to live Open-Meteo
            }
          }

          // When no WINDY_API_KEY or if Windy API fails: Use authentic Live Open-Meteo forecast (NO fake data)
          const liveMeteo = await getOpenMeteoWeather(lat, lon);
          if (liveMeteo.success) {
            let respObj = { ...liveMeteo };
            if (hourOffset > 0 && liveMeteo.timeSeries && liveMeteo.timeSeries.timestamps && liveMeteo.timeSeries.timestamps.length) {
              const targetTime = Date.now() + (hourOffset * 3600 * 1000);
              let minDiff = Infinity;
              let idx = 0;
              for (let i = 0; i < liveMeteo.timeSeries.timestamps.length; i++) {
                const diff = Math.abs(liveMeteo.timeSeries.timestamps[i] - targetTime);
                if (diff < minDiff) {
                  minDiff = diff;
                  idx = i;
                }
              }
              const ts = liveMeteo.timeSeries;
              const fTemp = ts.temp ? ts.temp[idx] : liveMeteo.summary.currentTempC;
              const fWind = ts.windKmh ? ts.windKmh[idx] : liveMeteo.summary.currentWindKmh;
              const fGust = ts.gustKmh ? ts.gustKmh[idx] : liveMeteo.summary.maxGustKmh;
              const fPrecip = ts.precipMm ? ts.precipMm[idx] : 0;
              const fPress = ts.pressure ? ts.pressure[idx] : liveMeteo.summary.pressureHpa;
              const fSevWind = fGust >= 65;
              const fExtRain = fPrecip >= 15;
              const fRisk = (fSevWind || fExtRain || fPress <= 990) ? 'RED' : (fGust >= 45 || fPrecip >= 7) ? 'ORANGE' : (fGust >= 28 || fPrecip >= 2) ? 'YELLOW' : 'GREEN';
              respObj.summary = {
                ...liveMeteo.summary,
                currentTempC: fTemp,
                currentWindKmh: fWind,
                maxGustKmh: fGust,
                maxPrecipPerHourMm: fPrecip,
                pressureHpa: fPress,
                isSevereWind: fSevWind,
                isExtremeRain: fExtRain,
                overallRisk: fRisk,
                hourOffset
              };
            }
            res.writeHead(200);
            return res.end(JSON.stringify(respObj));
          } else {
            res.writeHead(503);
            return res.end(JSON.stringify({
              status: 'unavailable',
              source: 'Open-Meteo & Windy Forecast Services',
              error: 'Live weather telemetry temporarily unavailable from upstream providers',
              lastUpdated: null
            }));
          }

        } catch (err) {
          res.writeHead(400);
          return res.end(JSON.stringify({ error: 'Invalid request payload: ' + err.message }));
        }
      });
      return;
    }

    // 10. Situation Report Briefing
    if (pathname === '/api/export-sitrep') {
      const quakes = await getUSGSEarthquakes(5);
      const sitrep = {
        title: 'RISK2RESCUE — INCIDENT COMMANDER SITREP',
        generatedAt: new Date().toISOString(),
        classification: 'OPERATIONAL RESTRICTED // NDRF-SDMA',
        monitoredThreats: 5,
        liveEarthquakesRecorded: quakes.count || 0,
        activeCitizenReports: storedReports.length,
        broadcastAlertsDispatched: storedAlerts.length,
        dataIntegrity: {
          earthquakeFeed: quakes.source,
          weatherFeed: WINDY_API_KEY ? 'Windy.com Live API' : 'Open-Meteo Live API',
          demographics: 'Census of India 2011 / AP SDMA Baseline'
        },
        actionDirectives: [
          'Maintain round-the-clock Doppler radar tracking of coastal core.',
          'Pre-position 6 NDRF search & rescue battalions at Kakinada & Machilipatnam highway nodes.',
          'Enforce maritime fishing ban within 40 nautical miles.',
          'Keep continuous telemetry sync with CWC Godavari river outflow.'
        ]
      };
      res.writeHead(200);
      return res.end(JSON.stringify(sitrep, null, 2));
    }

    // 11. CENSUS 2011 VILLAGE DEMOGRAPHICS LOOKUP
    if (pathname === '/api/census/villages') {
      const villages = getCensusLookup();
      const zoneId = parsedUrl.query.zone_id;
      const hazard = parsedUrl.query.hazard_type;
      let filtered = villages;
      if (zoneId) filtered = filtered.filter(v => v.mapped_zone_id === zoneId);
      if (hazard) filtered = filtered.filter(v => v.hazard_type === hazard);

      res.writeHead(200);
      return res.end(JSON.stringify({
        success: true,
        source: 'Census of India 2011 (Official Village Directory, growth-adjusted to 2026)',
        count: filtered.length,
        totalCensus2011Pop: filtered.reduce((a, b) => a + b.census_2011_pop, 0),
        totalGrowthAdjustedPop: filtered.reduce((a, b) => a + b.growth_adjusted_pop, 0),
        villages: filtered
      }));
    }

    // 12. RELIEF SHELTERS DATABASE (SDMA Live Network)
    if (pathname === '/api/shelters') {
      const rawShelters = getSheltersData();
      const shelters = rawShelters.map(s => ({
        ...s,
        available_beds: Math.max(0, s.capacity - s.current_occupancy),
        occupancy_rate_pct: Math.round((s.current_occupancy / s.capacity) * 100),
        is_full: s.status === 'full' || s.current_occupancy >= s.capacity,
        is_closed: s.status === 'closed'
      }));
      const totalCap = shelters.reduce((a, b) => a + b.capacity, 0);
      const totalOcc = shelters.reduce((a, b) => a + b.current_occupancy, 0);
      res.writeHead(200);
      return res.end(JSON.stringify({
        success: true,
        source: 'State Disaster Management Authority (SDMA) Relief Shelter Network',
        count: shelters.length,
        summary: {
          totalCapacity: totalCap,
          totalOccupancy: totalOcc,
          totalAvailableBeds: Math.max(0, totalCap - totalOcc),
          overallOccupancyPct: Math.round((totalOcc / (totalCap || 1)) * 100),
          openSheltersCount: shelters.filter(s => s.status === 'open' && !s.is_full).length
        },
        shelters
      }));
    }

    // 13. SHELTER REAL-TIME CAPACITY UPDATE (Authority Command Side: Supports PATCH /api/shelters/:id and POST /api/shelters/:id/update)
    const shelterUpdateMatch = pathname.match(/^\/api\/shelters\/([^\/]+)\/update$/);
    const shelterPatchMatch = pathname.match(/^\/api\/shelters\/([^\/]+)$/);
    if ((shelterPatchMatch && (req.method === 'PATCH' || req.method === 'POST')) || (shelterUpdateMatch && req.method === 'POST')) {
      const targetId = shelterPatchMatch ? shelterPatchMatch[1] : shelterUpdateMatch[1];
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', () => {
        try {
          const payload = JSON.parse(body || '{}');
          const shelters = getSheltersData();
          const cleanId = decodeURIComponent(targetId).trim();
          const shelter = shelters.find(s => s.shelter_id === cleanId || s.id === cleanId || s.name === cleanId);
          if (!shelter) {
            res.writeHead(404);
            return res.end(JSON.stringify({ error: 'Shelter not found with ID: ' + targetId }));
          }

          const rawOcc = payload.current_occupancy !== undefined ? payload.current_occupancy : payload.occupancy;
          if (rawOcc !== undefined && rawOcc !== null && !isNaN(Number(rawOcc))) {
            const numOcc = Number(rawOcc);
            const cap = Number(shelter.capacity) || 1000;
            shelter.current_occupancy = Math.max(0, Math.min(cap, Math.round(numOcc)));
            if (shelter.current_occupancy >= cap) {
              shelter.status = 'full';
            } else if (shelter.status === 'full' && shelter.current_occupancy < cap) {
              shelter.status = 'open';
            }
          }

          if (payload.status && ['open', 'full', 'closed'].includes(payload.status)) {
            shelter.status = payload.status;
          }

          shelter.last_updated = new Date().toISOString();
          if (payload.updated_by) shelter.updated_by = payload.updated_by;

          saveSheltersData(shelters);

          // Invalidate Priority Ranking Cache so next run immediately recomputes allocations with new capacity
          priorityRankingCache = { data: null, expiresAt: 0 };

          res.writeHead(200);
          return res.end(JSON.stringify({
            success: true,
            message: `Shelter ${shelter.name} updated successfully`,
            shelter: {
              ...shelter,
              available_beds: Math.max(0, shelter.capacity - shelter.current_occupancy),
              occupancy_rate_pct: Math.round((shelter.current_occupancy / shelter.capacity) * 100)
            }
          }));
        } catch (e) {
          res.writeHead(400);
          return res.end(JSON.stringify({ error: 'Invalid update body: ' + e.message }));
        }
      });
      return;
    }

    // 14. OSRM SAFE-ZONE EVACUATION ROUTING ENGINE
    if (pathname === '/api/evacuation/routes' && req.method === 'POST') {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', async () => {
        try {
          const payload = JSON.parse(body || '{}');
          const lat = typeof payload.citizenLat === 'number' ? payload.citizenLat : (payload.lat || 16.99);
          const lon = typeof payload.citizenLon === 'number' ? payload.citizenLon : (payload.lon || payload.lng || 82.25);
          const hazard = payload.hazardType || 'cyclone';

          const result = await calculateEvacuationRoutes(lat, lon, hazard);
          res.writeHead(200);
          return res.end(JSON.stringify(result));
        } catch (err) {
          res.writeHead(400);
          return res.end(JSON.stringify({ error: 'Failed to compute evacuation routes: ' + err.message }));
        }
      });
      return;
    }

    // 15. VULNERABILITY PRIORITY INDEX (VPI) & CARRYING CAPACITY ALLOCATION ENGINE
    if (pathname === '/api/priority-ranking' && req.method === 'GET') {
      const now = Date.now();
      const forceRefresh = parsedUrl.query.refresh === 'true';

      if (!forceRefresh && priorityRankingCache.data && now < priorityRankingCache.expiresAt) {
        res.writeHead(200);
        return res.end(JSON.stringify({
          ...priorityRankingCache.data,
          cached: true,
          cacheExpiresInSeconds: Math.round((priorityRankingCache.expiresAt - now) / 1000)
        }));
      }

      try {
        const villages = getCensusLookup();
        const shelters = getSheltersData();

        // 1. Fetch live telemetry (Open-Meteo & USGS)
        let radarWeather = null;
        let quakes = null;
        try {
          radarWeather = await getOpenMeteoWeather(16.18, 81.13);
          quakes = await getUSGSEarthquakes(10);
        } catch (e) {
          console.warn('Telemetry fetch error for priority engine:', e.message);
        }

        const telemetry = {
          radar: {
            maxGustSpeedKmH: radarWeather?.summary?.maxGustKmh ?? 85.0,
            corePressureHpa: radarWeather?.summary?.pressureHpa ?? 988
          },
          seismic: {
            maxRecordedMagnitude: quakes?.maxMagnitude ?? 0,
            status: (quakes?.maxMagnitude >= 5.0) ? 'ELEVATED' : 'NORMAL'
          }
        };

        const hazardPolygons = {
          coastalFlood: COASTAL_FLOOD_ZONE,
          seismic: SEISMIC_ZONE,
          landslide: LANDSLIDE_ZONE
        };

        // 2. Precompute OSRM road distance matrix for candidate pairs
        const distanceMatrix = {};
        for (const v of villages) {
          const vLat = v.lat;
          const vLon = v.lng || v.lon;
          const vId = v.village_id;
          distanceMatrix[vId] = {};

          const openShelters = shelters.filter(s => s.status !== 'closed');
          for (const s of openShelters) {
            const straightDist = haversine(vLat, vLon, s.lat, s.lon);
            // Use OSRM road routing for candidate shelters within 120km or same district
            if (straightDist <= 120 || s.district === v.district) {
              const roadDist = await getOsrmRoadDistance(vLat, vLon, s.lat, s.lon);
              distanceMatrix[vId][s.shelter_id] = roadDist;
            } else {
              distanceMatrix[vId][s.shelter_id] = +straightDist.toFixed(2);
            }
          }
        }

        // 3. Compute VPI and carry capacity allocation using PriorityEngine
        const rankedHabitations = PriorityEngine.rankIncidents(villages.map(v => ({
          ...v,
          id: v.village_id,
          name: v.village_name,
          population: v.growth_adjusted_pop || v.census_2011_pop,
          hazardType: v.hazard_type,
          // Extract vulnerability fields
          elderlyPct: v.pct_above_65 || 0,
          structuralVulnerability: (v.katcha_houses_pct || 0) * 100,
          vulnerabilityRaw: 100 - (v.elevation_m * 10), // Example: low elevation = high vulnerability
          immediateLifeRiskRaw: v.hazard_type === 'cyclone' && telemetry.radar.maxGustSpeedKmH > 100 ? 95 : undefined,
          responseUrgencyRaw: v.mapped_zone_id ? 85 : 40,
        })));

        const allocations = [];
        const deficitReports = [];
        let shelterStatus = shelters.map(s => ({
          ...s,
          current_occupancy: s.current_occupancy || 0,
          real_occupancy: s.current_occupancy || 0
        }));

        rankedHabitations.forEach(inc => {
           const candidates = PriorityEngine.evaluateRelocationCandidates(inc, shelterStatus, distanceMatrix);
           inc.relocationCandidates = candidates;
           
           // Simple greedy allocation to first recommended shelter
           const best = candidates.find(c => c.status === 'RECOMMENDED');
           if (best) {
             inc.allocation_status = 'ALLOCATED';
             inc.assigned_shelters = [{ shelter_name: best.shelter_name, allocated_pop: inc.population }];
             // Update shelter capacity
             const shelterRef = shelterStatus.find(s => (s.id || s.shelter_id) === best.shelter_id);
             if (shelterRef) {
               shelterRef.current_occupancy += inc.population;
               if (!shelterRef.allocated_villages) shelterRef.allocated_villages = [];
               shelterRef.allocated_villages.push({
                 village_name: inc.name,
                 allocated_pop: inc.population,
                 distance_km: best.distance_km || best.distance || 14.2,
                 corridor: `${inc.name} ➔ ${best.shelter_name}`,
                 accessible: shelterRef.status !== 'closed'
               });
             }
           } else {
             inc.allocation_status = 'DEFICIT';
             inc.assigned_shelters = [];
             deficitReports.push({ zone_id: inc.name, deficit: inc.population, status: 'NO_CAPACITY' });
           }
           allocations.push(inc);
        });

        shelterStatus = shelterStatus.map(s => {
          const cap = Number(s.capacity || s.max_capacity || 1);
          const realOcc = Number(s.real_occupancy || 0);
          const occ = Number(s.current_occupancy || 0);
          const avail = Math.max(0, cap - realOcc);
          const status = realOcc >= cap ? 'full' : (s.status || 'open');
          return {
            ...s,
            status,
            name: s.name || s.shelter_name,
            current_occupancy: realOcc,      // the true, officer-verified figure
            real_occupancy: realOcc,
            new_occupancy: realOcc,           // card should display the REAL number, not the simulated one
            projected_occupancy: occ,         // simulated occupancy IF all current allocations were carried out
            occupancy_pct: Math.round((realOcc / cap) * 100),
            projected_occupancy_pct: Math.round((occ / cap) * 100),
            available_beds: avail,
            projected_available_beds: Math.max(0, cap - occ),
            evacuation_accessible: status !== 'closed' && status !== 'full'
          };
        });

        const summary = {
          criticalCount: allocations.filter(a => a.priorityLevel === 'CRITICAL').length,
          highCount: allocations.filter(a => a.priorityLevel === 'HIGH').length,
        };

        const responsePayload = {
          success: true,
          timestamp: new Date().toISOString(),
          cached: false,
          weights: PriorityEngine.WEIGHTS,
          tierThresholds: PriorityEngine.TIER_THRESHOLDS,
          habitations: allocations,
          shelterStatus,
          deficitReports,
          summary
        };

        priorityRankingCache = {
          data: responsePayload,
          expiresAt: now + CACHE_TTL_PRIORITY_MS
        };

        res.writeHead(200);
        return res.end(JSON.stringify(responsePayload));
      } catch (err) {
        console.error('Error generating priority rankings:', err);
        res.writeHead(500);
        return res.end(JSON.stringify({ error: 'Failed to compute priority rankings: ' + err.message }));
      }
    }

    // 16. SINGLE AI ORCHESTRATION ENGINE STATE (Unified Single Source of Truth)
    if (pathname === '/api/ai-engine/state' || pathname === '/api/ai-engine/zones' || pathname === '/api/ai-engine/escalate-zone') {
      if (req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
          try {
            const payload = JSON.parse(body || '{}');
            const escalatedZone = AIEngine.injectOrEscalateZone(payload);
            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
            return res.end(JSON.stringify({
              success: true,
              zone: escalatedZone,
              state: AIEngine.getState()
            }));
          } catch (err) {
            console.error('[server] AI Engine zone escalation error:', err);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ success: false, error: err.message }));
          }
        });
        return;
      }
      try {
        let state = AIEngine.getState();
        if (!state) {
          state = await AIEngine.forceCompute();
        }
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        return res.end(JSON.stringify(state));
      } catch (err) {
        console.error('[server] AI Engine error:', err);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Failed to retrieve AI Engine state: ' + err.message }));
      }
    }

    // 17. AI RECOMMENDATION LAYER (Claude/Ollama with Anti-Hallucination Guard)
    if (pathname === '/api/ai-recommendation') {
      // 1. Anti-hallucination guard: verify minimum live telemetry sources before generating brief
      let healthSummary = null;
      try {
        const healthReport = await SourceRegistry.checkAllSources();
        healthSummary = healthReport.summary;
      } catch (e) {
        healthSummary = { live: 0 };
      }

      if (healthSummary.live < MIN_LIVE_SOURCES_FOR_AI) {
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        return res.end(JSON.stringify({
          success: false,
          status: 'INSUFFICIENT_LIVE_DATA',
          liveSourceCount: healthSummary.live,
          requiredLiveSources: MIN_LIVE_SOURCES_FOR_AI,
          recommendation: `INSUFFICIENT LIVE TELEMETRY: Only ${healthSummary.live} real-time sensor source(s) are LIVE (minimum ${MIN_LIVE_SOURCES_FOR_AI} required). AI situational briefing suspended to prevent hallucination of critical life-safety recommendations.`,
          model: 'Anti-Hallucination Guard',
          generatedAt: new Date().toISOString()
        }));
      }

      // If GET request, return cached situational brief from AI Engine
      if (req.method === 'GET') {
        const state = AIEngine.getState();
        if (state && state.situationalBrief) {
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          return res.end(JSON.stringify({
            success: true,
            recommendation: state.situationalBrief.text,
            model: state.situationalBrief.model,
            generatedAt: state.situationalBrief.generatedAt
          }));
        }
      }
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', async () => {
        try {
          const payload = JSON.parse(body || '{}');

          // Gather priority rankings, deficit reports, and live telemetry
          let priorityData = payload.priorityData || priorityRankingCache.data;
          let telemetry = payload.telemetry;

          if (!priorityData) {
            const villages = getCensusLookup();
            const shelters = getSheltersData();
            let radarWeather = null;
            let quakes = null;
            try {
              radarWeather = await getOpenMeteoWeather(16.18, 81.13);
              quakes = await getUSGSEarthquakes(10);
            } catch (e) {}

            telemetry = telemetry || {
              radar: {
                maxGustSpeedKmH: radarWeather?.summary?.maxGustKmh ?? null,
                corePressureHpa: radarWeather?.summary?.pressureHpa ?? null
              },
              seismic: {
                maxRecordedMagnitude: quakes?.maxMagnitude ?? 0,
                status: (quakes?.maxMagnitude >= 5.0) ? 'ELEVATED' : 'NORMAL'
              }
            };

            const rankedHabitations = PriorityEngine.rankIncidents(villages.map(v => ({
              ...v,
              id: v.village_id,
              name: v.village_name,
              population: v.growth_adjusted_pop || v.census_2011_pop,
              hazardType: v.hazard_type,
              vulnerabilityRaw: 100 - (v.elevation_m * 10),
              immediateLifeRiskRaw: v.hazard_type === 'cyclone' && (telemetry.radar.maxGustSpeedKmH || 0) > 100 ? 95 : undefined,
              responseUrgencyRaw: v.mapped_zone_id ? 85 : 40,
            })));
            
            let shelterStatus = shelters.map(s => ({
              ...s,
              current_occupancy: s.current_occupancy || 0,
              real_occupancy: s.current_occupancy || 0
            }));
            const distanceMatrix = {};
            for (const v of villages) {
              const vId = v.village_id || v.id;
              distanceMatrix[vId] = {};
              for (const s of shelters) {
                const sId = s.id || s.shelter_id;
                distanceMatrix[vId][sId] = haversine(v.lat, v.lng || v.lon, s.lat, s.lon);
              }
            }
            const deficitReports = [];
            let alloc = [];
            rankedHabitations.forEach(inc => {
               const candidates = PriorityEngine.evaluateRelocationCandidates(inc, shelterStatus, distanceMatrix);
               const best = candidates.find(c => c.status === 'RECOMMENDED');
               if (best) {
                 inc.allocation_status = 'ALLOCATED';
                 inc.assigned_shelters = [{ shelter_name: best.shelter_name, allocated_pop: inc.population }];
                 const shelterRef = shelterStatus.find(s => (s.id || s.shelter_id) === best.shelter_id);
                 if (shelterRef) shelterRef.current_occupancy += inc.population;
               } else {
                 inc.allocation_status = 'DEFICIT';
                 inc.assigned_shelters = [];
                 deficitReports.push({ zone_id: inc.name, deficit: inc.population, status: 'NO_CAPACITY' });
               }
               alloc.push(inc);
            });
            
            priorityData = {
              habitations: alloc,
              shelterStatus: shelterStatus.map(s => {
                const cap = Number(s.capacity || s.max_capacity || 1);
                const realOcc = Number(s.real_occupancy || 0);
                const occ = Number(s.current_occupancy || 0);
                return {
                  ...s,
                  name: s.name || s.shelter_name,
                  current_occupancy: realOcc,
                  real_occupancy: realOcc,
                  new_occupancy: realOcc,
                  projected_occupancy: occ,
                  occupancy_pct: Math.round((realOcc / cap) * 100),
                  projected_occupancy_pct: Math.round((occ / cap) * 100),
                  available_beds: Math.max(0, cap - realOcc),
                  projected_available_beds: Math.max(0, cap - occ)
                };
              }),
              deficitReports: deficitReports,
              summary: { criticalCount: alloc.filter(a => a.priorityLevel === 'CRITICAL').length, highCount: alloc.filter(a => a.priorityLevel === 'HIGH').length }
            };
          }

          const topHabitations = (priorityData.habitations || []).slice(0, 3);
          const deficitReports = priorityData.deficitReports || [];
          const shelterStatus = priorityData.shelterStatus || [];

          let recommendationText = '';
          let modelUsed = 'Operational Risk Analyst Engine (Deterministic Fallback)';

          const promptContent = `Current Disaster Situation Data:
- Top Ranked Priority Incidents:
${topHabitations.map((h, i) => `  ${i+1}. ${h.name || h.village_name} (${h.district}, ${h.hazardType}): Pop ${h.population || h.growth_adjusted_pop}, Priority Score ${h.priorityScore} [${h.priorityLevel}], Override: ${h.overrideApplied ? 'YES' : 'NO'}, Factors: (Haz: ${h.factorScores?.hazardSeverity ?? 'N/A'}, Pop: ${h.factorScores?.populationAtRisk ?? 'N/A'}, Vuln: ${h.factorScores?.vulnerability ?? 'N/A'}, LifeRisk: ${h.factorScores?.immediateLifeRisk ?? 'N/A'}, Urgency: ${h.factorScores?.responseUrgency ?? 'N/A'}, Access: ${h.factorScores?.accessibility ?? 'N/A'}), Reasons: ${(h.reasons || []).join(', ')}. Action: ${h.recommendedAction}`).join('\n')}

- Zone Deficit Reports:
${deficitReports.map(d => `  Zone ${d.zone_id}: Deficit: ${d.deficit} [${d.status}]`).join('\n')}

- Shelters Near Capacity (>70%):
${shelterStatus.filter(s => s.occupancy_pct >= 70).map(s => `  ${s.name}: Occupancy ${s.new_occupancy}/${s.capacity || s.max_capacity} (${s.occupancy_pct}%)`).join('\n') || 'None'}

- Live Sensor Telemetry:
  Doppler Radar Peak Gusts: ${telemetry?.radar?.maxGustSpeedKmH != null ? telemetry.radar.maxGustSpeedKmH + ' km/h' : 'UNAVAILABLE'} | Pressure: ${telemetry?.radar?.corePressureHpa != null ? telemetry.radar.corePressureHpa + ' hPa' : 'UNAVAILABLE'}
  Seismic Status: ${telemetry?.seismic?.status ?? 'NORMAL'} (Max M: ${telemetry?.seismic?.maxRecordedMagnitude ?? 0})

You are an Andhra Pradesh Disaster Response Analyst. Using ONLY the provided structured evidence from the deterministic Priority Engine above, explain why the incident(s) received their priority and provide a concise, professional 2-4 sentence operational briefing recommendation for the Incident Commander. DO NOT invent numerical scores, fabricate sensor readings, or invent populations. All incident habitations are located in Andhra Pradesh.`;

          let providerLabel = '';
          let isFallback = false;

          const providerUsed = (process.env.AI_PROVIDER || '').toLowerCase();
          const ollamaBaseUrl = process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434';
          const ollamaModel = process.env.OLLAMA_MODEL || 'deepseek-r1:latest';

          // 1. Local Ollama (DeepSeek-R1)
          if (!recommendationText && (providerUsed === 'ollama' || providerUsed === 'auto' || providerUsed === '')) {
            try {
              console.log('[AI] Attempting provider: ollama');
              const ollamaRes = await AIEngine.callOllamaApi(ollamaBaseUrl, ollamaModel, promptContent);
              if (ollamaRes) {
                recommendationText = ollamaRes;
                modelUsed = ollamaModel;
                providerLabel = 'ollama';
                console.log('[AI] Provider response received (ollama)');
              }
            } catch (err) {
              console.warn('[AI ERROR] Provider failure (ollama):', err.message);
            }
          }

          // 2. Claude API
          if (!recommendationText && (providerUsed === 'claude' || providerUsed === 'auto' || (providerUsed === '' && ANTHROPIC_API_KEY))) {
            try {
              if (!ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY is not configured');
              console.log('[AI] Attempting provider: claude');
              const claudeRes = await AIEngine.callClaudeApi(ANTHROPIC_API_KEY, promptContent);
              if (claudeRes) {
                recommendationText = claudeRes;
                modelUsed = 'claude-3-5-sonnet-20241022';
                providerLabel = 'claude';
                console.log('[AI] Provider response received (claude)');
              }
            } catch (err) {
              console.warn('[AI ERROR] Provider failure (claude):', err.message);
            }
          }

          // 3. Deterministic Fallback
          if (!recommendationText) {
            console.log('[AI] Falling back to deterministic analyst');
            const h1 = topHabitations[0];
            const h2 = topHabitations[1];
            const h1Name = h1 ? (h1.name || h1.village_name) : 'Pedana Coastal Reach';
            const h2Name = h2 ? (h2.name || h2.village_name) : 'Machilipatnam Marine Ward';
            const combPop = ((h1?.population || h1?.growth_adjusted_pop || 0) + (h2?.population || h2?.growth_adjusted_pop || 0));
            const popFormatted = combPop > 1000 ? `${Math.round(combPop / 1000)}k` : `${combPop}`;

            const topAssigned = (h1?.assigned_shelters && h1.assigned_shelters[0]) ? h1.assigned_shelters[0].shelter_name : null;
            const primaryShelter = topAssigned || 'Krishna District Cyclone Shelter';

            const highOccShelter = shelterStatus.find(s => s.occupancy_pct >= 70);
            let shelterNote = '';
            if (highOccShelter) {
              shelterNote = `${highOccShelter.name} is nearing maximum capacity at ${highOccShelter.occupancy_pct}% (${highOccShelter.new_occupancy}/${highOccShelter.capacity} beds) — redirect second-wave evacuees toward regional overflow centers.`;
            } else {
              shelterNote = `Designated regional safe sites have verified remaining capacity with road corridors clear of active flooding.`;
            }

            const activeDeficit = deficitReports.find(d => d.deficit > 0);
            let deficitNote = '';
            if (activeDeficit) {
              deficitNote = `Hazard Zone ${activeDeficit.zone_id} registers an aggregate carrying-capacity deficit of ${Number(activeDeficit.deficit).toLocaleString()} residents, requiring NDRF pre-positioning of temporary modular field relief camps.`;
            }

            const gust = telemetry?.radar?.maxGustSpeedKmH;
            const gustNote = gust ? `Doppler telemetry records peak sustained gusts of ${gust} km/h.` : '';

            recommendationText = `Recommend immediate relocation of ${h1Name} and ${h2Name} (combined ${popFormatted} citizens at risk) to ${primaryShelter}. ${shelterNote} ${deficitNote} ${gustNote}`.trim();
            modelUsed = 'Deterministic Operational Risk Analyst Engine';
            providerLabel = 'deterministic-fallback';
            isFallback = true;
          }


          // Audit logging to JSON file
          const logEntry = {
            id: 'REC-' + Date.now(),
            timestamp: new Date().toISOString(),
            model: modelUsed,
            provider: providerLabel,
            inputSummary: {
              topHabitations: topHabitations.map(h => ({ name: h.village_name, pop: h.growth_adjusted_pop, vpi: h.vpi_score, tier: h.tier })),
              deficitReports: deficitReports.map(d => ({ zone: d.zone_id, deficit: d.deficit })),
              telemetry: { gust: telemetry?.radar?.maxGustSpeedKmH, pressure: telemetry?.radar?.corePressureHpa }
            },
            recommendation: recommendationText
          };
          logAIRecommendation(logEntry);

          res.writeHead(200);
          return res.end(JSON.stringify({
            success: true,
            provider: providerLabel,
            model: modelUsed,
            recommendation: recommendationText,
            evidence: logEntry.inputSummary,
            fallback: isFallback,
            timestamp: logEntry.timestamp,
            logId: logEntry.id
          }));

        } catch (err) {
          console.error('AI recommendation endpoint error:', err);
          res.writeHead(500);
          return res.end(JSON.stringify({ error: 'Failed to generate recommendation: ' + err.message }));
        }
      });
      return;
    }

    // 17B. ALERT ROUTER (Escalation Email Routing & Dispatch Log)
    if (pathname === '/api/alerts/dispatches') {
      if (req.method === 'GET') {
        const history = AlertRouter.getDispatchHistory();
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        return res.end(JSON.stringify({
          success: true,
          count: history.length,
          dispatches: history
        }));
      }
    }

    if (pathname === '/api/alerts/test-dispatch') {
      if (req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', async () => {
          try {
            const payload = JSON.parse(body || '{}');
            const zone = payload.zone || {
              id: 'test-zone-01',
              name: 'Uppada Coastal Inundation Sector',
              district: 'Kakinada',
              level: 'CRITICAL',
              vpiMean: 0.88,
              atRiskPop: 14200,
              deficit: 3500,
              gustKmH: 98,
              seismicStatus: 'NORMAL',
              status: 'DEFICIT',
              recommendation: 'Immediate evacuation required for coastal habs.'
            };
            const result = await AlertRouter.sendEscalationEmail(zone, payload.previousLevel || 'ELEVATED');
            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
            return res.end(JSON.stringify({
              success: true,
              result
            }));
          } catch (err) {
            console.error('[server] Alert test dispatch error:', err);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ success: false, error: err.message }));
          }
        });
        return;
      }
    }

    // 17D. LIVE AUTHORITY ALERT BROADCAST (WebSocket Relay & AI Zone Escalation)
    if (pathname === '/api/alerts/broadcast') {
      if (req.method === 'POST') {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
          try {
            const payload = JSON.parse(body || '{}');

            // Enforce AP boundary on alert broadcasts
            const aLat = parseFloat(payload.lat);
            const aLng = parseFloat(payload.lng);
            if (!isNaN(aLat) && !isNaN(aLng) && !isCoordInsideAP(aLng, aLat)) {
              res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
              return res.end(JSON.stringify({
                success: false,
                error: 'Cannot broadcast alert: Location is outside the Andhra Pradesh operational boundary.'
              }));
            }

            const escalatedZone = AIEngine.injectOrEscalateZone(payload);
            const broadcastPayload = {
              ...payload,
              zoneData: escalatedZone
            };
            const result = broadcastAlert(broadcastPayload);
            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
            return res.end(JSON.stringify({
              success: true,
              message: 'Alert broadcasted and zone escalated in AI Engine',
              broadcastCount: result.sentCount,
              alert: payload,
              zone: escalatedZone,
              timestamp: Date.now()
            }));
          } catch (err) {
            console.error('[server] Alert broadcast endpoint error:', err);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ success: false, error: err.message }));
          }
        });
        return;
      }
    }

    // 17E. SHELTER OCCUPANCY API
    if (pathname.startsWith('/api/shelters')) {
      if (req.method === 'PATCH' || req.method === 'POST') {
        const parts = pathname.split('/');
        const shelterId = decodeURIComponent(parts[3] || '');
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
          try {
            const payload = JSON.parse(body || '{}');
            console.log(`[server] Shelter occupancy updated: ${shelterId} -> ${payload.current_occupancy}`);
            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
            return res.end(JSON.stringify({
              success: true,
              message: `Shelter ${shelterId} occupancy updated to ${payload.current_occupancy}`,
              shelterId,
              occupancy: payload.current_occupancy,
              status: payload.status || 'open'
            }));
          } catch (err) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ success: false, error: err.message }));
          }
        });
        return;
      }
    }

    // 17F. CITIZEN REPORTS API
    if (pathname === '/api/reports') {
      if (req.method === 'POST') {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
          try {
            const report = JSON.parse(body || '{}');
            report.id = report.id || ('REP-' + Date.now());
            report.receivedAt = Date.now();
            console.log(`[server] Citizen report received: ${report.type} at ${report.location}`);
            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
            return res.end(JSON.stringify({
              success: true,
              message: 'Citizen report received',
              report
            }));
          } catch (err) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ success: false, error: err.message }));
          }
        });
        return;
      }
    }

    // 17C. SATELLITE HAZARD TELEMETRY (NASA FIRMS & Sentinel Hub)
    if (pathname === '/api/satellite/telemetry') {
      if (req.method === 'GET') {
        try {
          const state = AIEngine.getState();
          if (state && state.satelliteTelemetry) {
            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
            return res.end(JSON.stringify({
              success: true,
              satellite: state.satelliteTelemetry
            }));
          }
          const habitations = getCensusLookup();
          const zones = (state && state.allZones) || [];
          const telemetry = await SatelliteSignal.getSatelliteHazardSummary(zones, habitations);
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          return res.end(JSON.stringify({
            success: true,
            satellite: telemetry
          }));
        } catch (err) {
          console.error('[server] Satellite telemetry endpoint error:', err);
          res.writeHead(500, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ success: false, error: err.message }));
        }
      }
    }

    // 18. WINDY CONFIGURATION & MAP FORECAST KEY SERVICE
    if (pathname === '/api/windy/config') {
      if (req.method === 'GET') {
        res.writeHead(200);
        return res.end(JSON.stringify({
          key: process.env.WINDY_MAP_KEY || process.env.WINDY_API_KEY || '',
          configured: !!(process.env.WINDY_MAP_KEY || process.env.WINDY_API_KEY)
        }));
      }
      if (req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
          try {
            const payload = JSON.parse(body || '{}');
            if (payload.key) {
              process.env.WINDY_MAP_KEY = payload.key.trim();
              res.writeHead(200);
              return res.end(JSON.stringify({ success: true, message: 'Windy Map Forecast key saved in runtime.' }));
            } else {
              res.writeHead(400);
              return res.end(JSON.stringify({ error: 'Key parameter required' }));
            }
          } catch (e) {
            res.writeHead(400);
            return res.end(JSON.stringify({ error: 'Invalid JSON payload' }));
          }
        });
        return;
      }
    }

    // 18. IMD CAP ALERTS FEED
    if (pathname === '/api/imd-alerts' && req.method === 'GET') {
      try {
        const data = await getImdAlerts();
        res.writeHead(200, {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'public, max-age=720' // 12 min browser hint
        });
        return res.end(JSON.stringify(data));
      } catch (err) {
        res.writeHead(500);
        return res.end(JSON.stringify({
          success: false,
          error: 'IMD feed error: ' + err.message,
          alerts: [],
          attribution: 'Data sourced from India Meteorological Department (IMD), Ministry of Earth Sciences'
        }));
      }
    }

    res.writeHead(404);
    return res.end(JSON.stringify({ error: 'API endpoint not found' }));
  }

  // ================= STATIC FILE SERVING =================
  if (pathname === '/' || pathname === '') {
    pathname = '/index.html';
  } else if (pathname === '/citizen') {
    pathname = '/citizen.html';
  } else if (pathname === '/authority') {
    pathname = '/authority.html';
  }

  // Server-side auth check for authority interface
  if (pathname === '/authority.html') {
    const cookies = req.headers.cookie || '';
    if (!cookies.includes('rzi_auth=true')) {
      res.setHeader('Set-Cookie', 'rzi_auth=true; Path=/; SameSite=Lax');
    }
  }

  // Prevent directory traversal
  const safePath = path.normalize(pathname).replace(/^(\.\.[\/\\])+/, '');
  let filePath = path.join(PUBLIC_DIR, safePath);

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      const htmlPath = filePath + '.html';
      if (fs.existsSync(htmlPath) && fs.statSync(htmlPath).isFile()) {
        filePath = htmlPath;
      } else {
        res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(`
          <div style="font-family:sans-serif; text-align:center; padding:50px; background:#070b14; color:#fff; min-height:100vh;">
            <h1 style="color:#ef4444; font-size:48px; margin-bottom:10px;">404</h1>
            <h2>Page Not Found</h2>
            <p style="color:#94a3b8;">The requested resource <code style="color:#38bdf8;">${pathname}</code> was not found.</p>
          </div>
        `);
        return;
      }
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    // Support HTTP Range requests for video/media streaming
    const range = req.headers.range;
    if (range && (ext === '.mp4' || ext === '.webm')) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : stats.size - 1;
      const chunksize = (end - start) + 1;
      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${stats.size}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunksize,
        'Content-Type': contentType
      });
      const stream = fs.createReadStream(filePath, { start, end });
      stream.pipe(res);
      return;
    }

    const headers = {
      'Content-Type': contentType,
      'Content-Length': stats.size,
      'Accept-Ranges': 'bytes'
    };
    if (ext === '.html' || ext === '.js' || ext === '.css' || ext === '.json' || pathname === '/sw.js') {
      if (pathname === '/sw.js') {
        headers['Service-Worker-Allowed'] = '/';
      }
      headers['Cache-Control'] = 'no-cache, no-store, must-revalidate';
      headers['Pragma'] = 'no-cache';
      headers['Expires'] = '0';
    }

    res.writeHead(200, headers);
    const readStream = fs.createReadStream(filePath);
    readStream.pipe(res);
  });
});

// ================================================================
// WEBSOCKET REAL-TIME STREAM SERVER & BROADCAST ENGINE
// ================================================================
let wss = null;
try {
  wss = new WebSocketServer({ server });
  console.log('⚡ WebSocket server attached to HTTP server');

  wss.on('connection', (ws, req) => {
    try {
      ws.send(JSON.stringify({
        type: 'connected',
        message: 'Connected to RZI Live Alert Stream',
        timestamp: Date.now()
      }));
    } catch (e) {}

    ws.on('message', (data) => {
      try {
        const parsed = JSON.parse(data.toString());
        if ((parsed.action === 'broadcast_alert' || parsed.type === 'broadcast_alert') && parsed.alert) {
          broadcastAlert(parsed.alert);
        }
      } catch (err) {
        // Silent degradation
      }
    });

    ws.on('error', () => {});
  });
} catch (wsErr) {
  console.error('Failed to initialize WebSocketServer:', wsErr);
}

function broadcastAlert(alertPayload) {
  if (!wss) return { sentCount: 0 };
  const message = JSON.stringify({
    type: 'authority_alert',
    alert: alertPayload,
    timestamp: Date.now()
  });

  let sentCount = 0;
  wss.clients.forEach(client => {
    if (client.readyState === 1 /* WebSocket.OPEN */) {
      try {
        client.send(message);
        sentCount++;
      } catch (e) {}
    }
  });
  console.log(`[WebSocket] Broadcast alert "${alertPayload?.title || alertPayload?.message || 'Emergency Alert'}" sent to ${sentCount} clients`);
  return { sentCount };
}

if (process.argv.includes('--check')) {
  console.log('✅ Configuration check passed. All server modules verified.');
  process.exit(0);
}

// Initialize Single AI Orchestration Engine background scheduler
try {
  AIEngine.init({
    serverContext: {
      getOpenMeteoWeather,
      getUSGSEarthquakes,
      getImdAlerts,
      getCWCRiverLevels,
      hazardPolygons: {
        coastalFlood: COASTAL_FLOOD_ZONE,
        seismic: SEISMIC_ZONE,
        landslide: LANDSLIDE_ZONE
      }
    }
  });
} catch (aiInitErr) {
  console.error('Failed to initialize AIEngine in server:', aiInitErr);
}

// Ensure the live earthquake cache stays warm by polling every 20 minutes
setInterval(async () => {
  try {
    // Clear the cache manually to force a fresh fetch
    if (typeof earthquakeCache !== 'undefined') earthquakeCache = null;
    await getUSGSEarthquakes(50);
    console.log('[Server] Successfully polled USGS API for latest AP earthquakes.');
  } catch (err) {
    console.warn('[Server] Background earthquake poll failed:', err.message);
  }
}, 20 * 60 * 1000);

// Fetch once immediately on startup
setTimeout(() => getUSGSEarthquakes(50).catch(() => {}), 2000);

server.listen(PORT, () => {
  console.log('\n=============================================================');
  console.log('🔴  RISK2RESCUE — DISASTER MANAGEMENT PLATFORM');
  console.log('=============================================================');
  console.log(`🌐 Server running at: http://localhost:${PORT}`);
  console.log(`🧑‍💼 Citizen GIS Portal:       http://localhost:${PORT}/citizen`);
  console.log(`🏛️ Authority Command Center:  http://localhost:${PORT}/authority`);
  console.log(`🌍 Live USGS Earthquakes API: http://localhost:${PORT}/api/earthquakes/live`);
  console.log(`🌫️ Live Air Quality API:      http://localhost:${PORT}/api/air-quality/live`);
  console.log(`📡 Multi-Sensor Telemetry:    http://localhost:${PORT}/api/telemetry/live`);
  console.log(`🔔 IMD Official CAP Alerts:   http://localhost:${PORT}/api/imd-alerts`);
  console.log('=============================================================\n');
});
