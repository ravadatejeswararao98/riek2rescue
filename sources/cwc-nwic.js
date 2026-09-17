const { safeText } = require('../js/redact.js');
/**
 * RISK2RESCUE — CWC / NWIC RIVER WATER LEVEL TELEMETRY (sources/cwc-nwic.js)
 * Central Water Commission & National Water Data Portal (NWIC) Real-Time Telemetry
 * 
 * Source ID: cwc_nwic_river
 * Role: PRIMARY (Observed River Gauges)
 * Tier: LIVE_API
 * Cadence: 10 minutes cache (CWC_CACHE_TTL_MS = 600000)
 * 
 * Strict Truth Rules:
 * - All stations MUST be validated inside Andhra Pradesh via ray-casting against data/andhra_pradesh_boundary.geojson.
 * - Stations outside AP or with missing/invalid coordinates are strictly rejected.
 * - Missing water levels or thresholds MUST remain null/UNKNOWN; never assume 0 or "normal".
 * - Trend is calculated ONLY when >= 2 genuine observations exist for the station with valid timestamps and levels.
 * - Stale cache handling: returns cached data marked status: 'DEGRADED', stale: true, preserving original observedAt.
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

const CWC_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes
let cwcCache = { data: null, expiresAt: 0 };
const stationHistory = new Map(); // stationName -> array of { timestamp, waterLevel }

// Authoritative AP Boundary
let apBoundaryGeom = null;
try {
  const boundaryPath = path.join(__dirname, '..', 'data', 'andhra_pradesh_boundary.geojson');
  if (fs.existsSync(boundaryPath)) {
    const raw = JSON.parse(fs.readFileSync(boundaryPath, 'utf8'));
    apBoundaryGeom = raw.features && raw.features[0] ? raw.features[0].geometry : null;
  }
} catch (e) {
  console.warn('[CWC] Failed to load AP boundary GeoJSON:', e.message);
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

function fetchJson(targetUrl, headers = {}, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    try {
      const parsed = new URL(targetUrl);
      const req = https.request({
        hostname: parsed.hostname,
        port: 443,
        path: parsed.pathname + parsed.search,
        method: 'GET',
        headers: {
          'User-Agent': 'Risk2Rescue-CWC-NWIC/2.0 (Disaster-Management-Platform)',
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
        reject(new Error(safeText(`Timeout after ${timeoutMs}ms`)));
      });
      req.end();
    } catch (e) {
      reject(e);
    }
  });
}

/**
 * Calculates trend given a station name and current reading
 * Requires at least 2 genuine observations with valid levels and timestamps
 */
function calculateStationTrend(stationName, currentReading) {
  if (!stationName || !currentReading || currentReading.waterLevel === null || !currentReading.observedAt) {
    return 'UNKNOWN';
  }

  let history = stationHistory.get(stationName) || [];
  
  // Clean duplicate timestamp entry if re-reading
  history = history.filter(h => h.observedAt !== currentReading.observedAt);
  history.push({
    observedAt: currentReading.observedAt,
    waterLevel: currentReading.waterLevel
  });

  // Keep last 10 readings sorted by observedAt
  history.sort((a, b) => new Date(a.observedAt).getTime() - new Date(b.observedAt).getTime());
  if (history.length > 10) history = history.slice(-10);
  stationHistory.set(stationName, history);

  if (history.length < 2) {
    return 'UNKNOWN';
  }

  const prev = history[history.length - 2];
  const curr = history[history.length - 1];
  const diff = curr.waterLevel - prev.waterLevel;

  if (diff > 0.05) return 'RISING';
  if (diff < -0.05) return 'FALLING';
  return 'STABLE';
}

/**
 * Derives flood condition from real water level and authentic thresholds
 * If thresholds are null/missing, returns UNKNOWN. Never assumes NORMAL.
 */
function deriveFloodCondition(waterLevel, warningLevel, dangerLevel) {
  if (typeof waterLevel !== 'number' || isNaN(waterLevel)) return 'UNKNOWN';
  if (typeof dangerLevel === 'number' && !isNaN(dangerLevel) && waterLevel >= dangerLevel) {
    return 'DANGER';
  }
  if (typeof warningLevel === 'number' && !isNaN(warningLevel) && waterLevel >= warningLevel) {
    return 'WARNING';
  }
  if (typeof warningLevel === 'number' && !isNaN(warningLevel)) {
    return 'NORMAL';
  }
  return 'UNKNOWN';
}

/**
 * Fetches real CWC / NWIC river level telemetry for Andhra Pradesh
 */
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
  const fetchedAt = new Date().toISOString();

  for (const res of CWC_RESOURCES) {
    let records = [];

    // Query with Andhra Pradesh state filter first to maximize AP station yield
    const stateFilter = JSON.stringify({ State: 'Andhra Pradesh' });
    const apFilterUrl = `https://nwdp.nwic.gov.in/api/3/action/datastore_search?resource_id=${res.id}&filters=${encodeURIComponent(stateFilter)}&sort=_id%20desc&limit=100`;
    
    try {
      const data = await fetchJson(apFilterUrl, {}, 8000);
      if (data && data.result && Array.isArray(data.result.records) && data.result.records.length > 0) {
        records.push(...data.result.records);
      }
    } catch (e) {
      // ignore and try general search
    }

    // Also query general recent records to capture stations where State may have slight naming variants
    const generalUrl = `https://nwdp.nwic.gov.in/api/3/action/datastore_search?resource_id=${res.id}&sort=_id%20desc&limit=150`;
    try {
      const genData = await fetchJson(generalUrl, {}, 8000);
      if (genData && genData.result && Array.isArray(genData.result.records)) {
        records.push(...genData.result.records);
      }
    } catch (e) {
      if (res.fallbackId) {
        try {
          const fbUrl = `https://nwdp.nwic.gov.in/api/3/action/datastore_search?resource_id=${res.fallbackId}&sort=_id%20desc&limit=150`;
          const fbData = await fetchJson(fbUrl, {}, 8000);
          if (fbData && fbData.result && Array.isArray(fbData.result.records)) {
            records.push(...fbData.result.records);
          }
        } catch (fbe) {}
      }
    }

    for (const rec of records) {
      const stationName = (rec.Station || '').trim();
      if (!stationName) continue;
      if (allStationsMap.has(stationName)) continue;

      const lat = parseFloat(rec.Latitude);
      const lon = parseFloat(rec.Longitude);

      // Strict AP boundary containment check: reject outside stations or invalid coordinates
      if (isNaN(lat) || isNaN(lon) || !isCoordInsideAP(lon, lat)) continue;

      const rawLevel = rec['River Water Level Telemetry Hourly (meter)'] ||
                       rec['River Water Level Manual Hourly (meter)'] ||
                       rec['River Water Level (meter)'];
      const waterLevel = (rawLevel !== undefined && rawLevel !== null && rawLevel !== '' && !isNaN(parseFloat(rawLevel)))
        ? parseFloat(rawLevel)
        : null;

      const rawDischarge = rec['Discharge (cusecs)'] || rec['Discharge (m3/s)'] || rec['Discharge'];
      const discharge = (rawDischarge !== undefined && rawDischarge !== null && rawDischarge !== '' && !isNaN(parseFloat(rawDischarge)))
        ? parseFloat(rawDischarge)
        : null;

      const observedAt = rec['Data Acquisition Time'] || null;

      // Authentically check for warning / danger thresholds (or null if absent)
      const rawDanger = rec['Danger Level (m)'] || rec['Danger Level'] || rec['dangerMarkMeters'];
      const dangerLevel = (rawDanger !== undefined && rawDanger !== null && !isNaN(parseFloat(rawDanger)))
        ? parseFloat(rawDanger)
        : null;

      const rawWarning = rec['Warning Level (m)'] || rec['Warning Level'] || rec['warningMarkMeters'];
      const warningLevel = (rawWarning !== undefined && rawWarning !== null && !isNaN(parseFloat(rawWarning)))
        ? parseFloat(rawWarning)
        : null;

      const stationRecord = {
        stationId: rec.SlNo ? `CWC_${rec.SlNo}` : `CWC_${stationName.replace(/\s+/g, '_')}`,
        stationName: stationName,
        station: stationName,
        riverName: rec.River || rec['Local River'] || res.basin,
        river: rec.River || rec['Local River'] || res.basin,
        basin: rec.Basin || res.basin,
        district: rec.District || '',
        state: rec.State || 'Andhra Pradesh',
        latitude: lat,
        longitude: lon,
        lat: lat,
        lon: lon,
        observedAt: observedAt,
        timestamp: observedAt,
        fetchedAt: fetchedAt,
        waterLevel: waterLevel,
        waterLevelMeters: waterLevel,
        waterLevelUnit: 'm',
        dangerLevel: dangerLevel,
        dangerLevelUnit: 'm',
        warningLevel: warningLevel,
        warningLevelUnit: 'm',
        stationStatus: waterLevel !== null ? 'LIVE' : 'UNAVAILABLE',
        floodCondition: deriveFloodCondition(waterLevel, warningLevel, dangerLevel),
        trend: calculateStationTrend(stationName, { observedAt, waterLevel }),
        discharge: discharge,
        dischargeUnit: 'cusecs',
        agency: rec.Agency || 'CWC',
        sourceId: 'cwc_nwic_river',
        provenance: 'cwc_nwic_live',
        stale: false
      };

      allStationsMap.set(stationName, stationRecord);
    }
  }

  const stationList = Array.from(allStationsMap.values()).filter(st => isCoordInsideAP(st.lon, st.lat));

  if (stationList.length === 0) {
    if (cwcCache.data && cwcCache.data.stations && cwcCache.data.stations.length > 0) {
      return {
        ...cwcCache.data,
        status: 'DEGRADED',
        cached: true,
        stale: true
      };
    }
    return {
      success: false,
      status: 'UNAVAILABLE',
      sourceId: 'cwc_nwic_river',
      source: 'National Water Data Portal (NWIC / Central Water Commission)',
      totalStations: 0,
      stations: [],
      error: 'No live CWC gauging stations currently reporting inside Andhra Pradesh boundary',
      lastUpdated: fetchedAt,
      fetchedAt: fetchedAt
    };
  }

  // Determine peak station for summary representation
  const reportingStations = stationList.filter(s => s.waterLevel !== null);
  const peakStation = reportingStations.length > 0
    ? reportingStations.reduce((max, s) => (s.waterLevel > (max.waterLevel || 0) ? s : max), reportingStations[0])
    : stationList[0];

  const result = {
    success: true,
    status: reportingStations.length > 0 ? 'LIVE' : 'DEGRADED',
    sourceId: 'cwc_nwic_river',
    source: 'National Water Data Portal (NWIC / Central Water Commission)',
    totalStations: stationList.length,
    stations: stationList,
    stationId: peakStation.stationId || null,
    stationName: peakStation.stationName || null,
    riverName: peakStation.riverName || null,
    latitude: peakStation.latitude || null,
    longitude: peakStation.longitude || null,
    observedAt: peakStation.observedAt || null,
    fetchedAt: fetchedAt,
    waterLevel: peakStation.waterLevel !== null ? peakStation.waterLevel : null,
    waterLevelUnit: 'm',
    dangerLevel: peakStation.dangerLevel !== null ? peakStation.dangerLevel : null,
    dangerLevelUnit: 'm',
    warningLevel: peakStation.warningLevel !== null ? peakStation.warningLevel : null,
    warningLevelUnit: 'm',
    stationStatus: peakStation.stationStatus || 'LIVE',
    floodCondition: peakStation.floodCondition || 'UNKNOWN',
    trend: peakStation.trend || 'UNKNOWN',
    discharge: peakStation.discharge !== null ? peakStation.discharge : null,
    dischargeUnit: 'cusecs',
    provenance: 'cwc_nwic_live',
    stale: false,
    cached: false,
    lastUpdated: fetchedAt
  };

  cwcCache = {
    data: result,
    expiresAt: now + CWC_CACHE_TTL_MS
  };

  return result;
}

module.exports = {
  getCWCRiverLevels,
  isCoordInsideAP,
  calculateStationTrend,
  deriveFloodCondition,
  CWC_CACHE_TTL_MS
};
