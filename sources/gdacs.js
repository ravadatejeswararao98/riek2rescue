const { safeText } = require('../js/redact.js');
/**
 * RISK2RESCUE — GDACS GLOBAL DISASTER EVENT FEED (sources/gdacs.js)
 * Global Disaster Alert and Coordination System (UN / European Commission)
 * 
 * Role: CROSS_CHECK & CORROBORATION ONLY
 * Never let GDACS alone create a zone — it is coarser than Indian national feeds.
 * Used to corroborate Indian official CAP alerts and raise confidence.
 */

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

const GDACS_FEED_URL = 'https://www.gdacs.org/xml/rss.xml';
const GDACS_CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes
let gdacsCache = { data: null, expiresAt: 0 };

function fetchText(targetUrl, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    try {
      const parsed = new URL(targetUrl);
      const client = parsed.protocol === 'https:' ? https : http;
      const req = client.request(parsed, {
        method: 'GET',
        headers: {
          'User-Agent': 'Risk2Rescue-GDACS-Ingest/2.0 (Disaster-Management-Platform)',
          'Accept': 'application/rss+xml, application/xml, text/xml, */*'
        },
        timeout: timeoutMs
      }, (res) => {
        let raw = '';
        res.on('data', chunk => raw += chunk);
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(raw);
          } else {
            reject(new Error(safeText(`HTTP ${res.statusCode} from ${targetUrl}`)));
          }
        });
      });
      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error(safeText(`Timeout after ${timeoutMs}ms from ${targetUrl}`)));
      });
      req.end();
    } catch (e) {
      reject(e);
    }
  });
}

function xmlTag(block, tagName) {
  const re = new RegExp('<(?:[a-zA-Z0-9_-]+:)?' + tagName + '[^>]*>([\\s\\S]*?)<\\/(?:[a-zA-Z0-9_-]+:)?' + tagName + '>', 'i');
  const m = block.match(re);
  if (!m) return '';
  return m[1]
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .trim();
}

// Load authoritative Andhra Pradesh operational boundary GeoJSON
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
  console.warn('[GDACS] Failed to load AP boundary GeoJSON:', e.message);
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

// Spatial check using official AP boundary GeoJSON (Fails closed)
function isCoordInsideAP(lon, lat) {
  if (!apBoundaryGeom || typeof lon !== 'number' || typeof lat !== 'number') return false;
  if (isNaN(lon) || isNaN(lat) || !Number.isFinite(lon) || !Number.isFinite(lat)) return false;
  if (lon < -180 || lon > 180 || lat < -90 || lat > 90) return false;
  if (apBoundaryGeom.type === 'Polygon') {
    return pointInPoly([lon, lat], apBoundaryGeom.coordinates[0]);
  }
  if (apBoundaryGeom.type === 'MultiPolygon') {
    return apBoundaryGeom.coordinates.some(ring => pointInPoly([lon, lat], ring[0]));
  }
  return false;
}

// Bounding box for India: lat 6.0 to 38.0, lon 68.0 to 98.0
function isCoordInsideIndia(lat, lon) {
  return lat >= 6.0 && lat <= 38.0 && lon >= 68.0 && lon <= 98.0;
}

async function getGdacsEvents() {
  const now = Date.now();
  if (gdacsCache.data && now < gdacsCache.expiresAt) {
    return { ...gdacsCache.data, cached: true };
  }

  try {
    const xml = await fetchText(GDACS_FEED_URL, 8000);
    const itemBlocks = xml.split(/<item[\s>]/i).slice(1);
    const allEvents = [];
    const indiaEvents = [];
    const apEvents = [];

    for (const block of itemBlocks) {
      const title       = xmlTag(block, 'title');
      const description = xmlTag(block, 'description');
      const eventType   = xmlTag(block, 'eventtype') || xmlTag(block, 'subject') || 'Unknown';
      const eventName   = xmlTag(block, 'eventname') || title.split(' in ')[0] || title;
      const alertLevel  = xmlTag(block, 'alertlevel') || 'Green';
      const severity    = xmlTag(block, 'severity') || '';
      const country     = xmlTag(block, 'country') || '';
      const fromDate    = xmlTag(block, 'fromdate') || xmlTag(block, 'pubDate') || '';
      const toDate      = xmlTag(block, 'todate') || '';
      const link        = xmlTag(block, 'link') || '';

      const latStr      = xmlTag(block, 'lat') || xmlTag(block, 'point')?.split(' ')[0] || '';
      const lonStr      = xmlTag(block, 'long') || xmlTag(block, 'point')?.split(' ')[1] || '';
      const lat         = parseFloat(latStr);
      const lon         = parseFloat(lonStr);

      const eventObj = {
        title,
        eventType,
        eventName,
        alertLevel, // Red, Orange, Green
        severity,
        country,
        lat: !isNaN(lat) ? lat : null,
        lon: !isNaN(lon) ? lon : null,
        fromDate,
        toDate,
        link,
        description: description.replace(/<[^>]+>/g, '').substring(0, 400).trim()
      };

      allEvents.push(eventObj);

      // Check active vs expired
      let isActive = true;
      if (toDate) {
        const toTime = new Date(toDate).getTime();
        if (!isNaN(toTime) && toTime < now) {
          isActive = false;
        }
      }
      if (fromDate) {
        const fromTime = new Date(fromDate).getTime();
        if (!isNaN(fromTime) && (now - fromTime) > (30 * 24 * 60 * 60 * 1000)) {
          isActive = false;
        }
      }
      eventObj.isActive = isActive;

      const isIndia = (country && country.toLowerCase().includes('india')) ||
                      (!isNaN(lat) && !isNaN(lon) && isCoordInsideIndia(lat, lon));

      if (isIndia) {
        const inAP = !isNaN(lat) && !isNaN(lon) && isCoordInsideAP(lon, lat);
        eventObj.inAndhraPradesh = inAP;
        indiaEvents.push(eventObj);
        if (inAP) {
          const eventId = xmlTag(block, 'eventid') || Math.abs(hashCode(title + link));
          const opState = isActive ? 'ACTIVE' : 'EXPIRED';
          const alertId = `gdacs_${eventType.toLowerCase()}_${eventId}`;
          const normAlert = {
            id: alertId,
            alertId: alertId,
            source: 'gdacs_events',
            sourceId: 'gdacs_events',
            sourceAlertId: String(eventId),
            agency: 'Global Disaster Alert and Coordination System (GDACS — UN / EC)',
            title: title || `${eventType} Hazard Event`,
            event: eventName || eventType || 'Disaster Event',
            eventType: eventType,
            hazardType: eventType,
            hazard_type: eventType,
            severity: alertLevel ? (alertLevel.charAt(0).toUpperCase() + alertLevel.slice(1).toLowerCase()) : 'UNKNOWN',
            sourceSeverity: severity || alertLevel || 'UNKNOWN',
            normalizedSeverity: alertLevel ? (alertLevel.charAt(0).toUpperCase() + alertLevel.slice(1).toLowerCase()) : 'UNKNOWN',
            urgency: 'UNKNOWN',
            certainty: 'Observed',
            status: opState === 'ACTIVE' ? 'LIVE' : 'EXPIRED',
            operationalState: opState,
            tier: 'LIVE_API',
            role: 'CROSS_CHECK',
            issuedAt: fromDate || null,
            effectiveAt: fromDate || null,
            expiresAt: toDate || null,
            observedAt: fromDate || null,
            fetchedAt: new Date(now).toISOString(),
            checkedAt: new Date(now).toISOString(),
            effective: fromDate || null,
            expires: toDate || null,
            lat: !isNaN(lat) ? lat : null,
            latitude: !isNaN(lat) ? lat : null,
            lng: !isNaN(lon) ? lon : null,
            longitude: !isNaN(lon) ? lon : null,
            geometry: (!isNaN(lat) && !isNaN(lon)) ? { type: 'Point', coordinates: [lon, lat] } : null,
            geometryStatus: (!isNaN(lat) && !isNaN(lon)) ? 'AVAILABLE' : 'UNAVAILABLE',
            area: country || 'Andhra Pradesh Sector',
            areaDesc: country || 'Andhra Pradesh Sector',
            description: description.replace(/<[^>]+>/g, '').substring(0, 500).trim(),
            instruction: null,
            sourceUrl: link || GDACS_FEED_URL,
            link: link || GDACS_FEED_URL,
            sourceTimestamp: fromDate || null,
            isInsideAP: true,
            expirationStatus: toDate ? 'AUTHENTIC_EXPIRY' : 'UNKNOWN_EXPIRY',
            requiresTemporalValidation: !toDate,
            provenance: {
              sourceId: 'gdacs_events',
              sourceTier: 'LIVE_API',
              sourceRole: 'CROSS_CHECK',
              agency: 'Global Disaster Alert and Coordination System (GDACS — UN / EC)',
              url: GDACS_FEED_URL,
              originalSourceTimestamp: fromDate || null,
              fetchedAt: new Date(now).toISOString(),
              contributingSources: ['gdacs_events']
            }
          };

          if (isActive) {
            apEvents.push(normAlert);
          }
        }
      }
    }

    function hashCode(str) {
      let hash = 0;
      for (let i = 0; i < str.length; i++) {
        hash = ((hash << 5) - hash) + str.charCodeAt(i);
        hash |= 0;
      }
      return hash;
    }

    const result = {
      success: true,
      sourceId: 'gdacs_events',
      agency: 'Global Disaster Alert and Coordination System (GDACS — UN / EC)',
      role: 'CROSS_CHECK',
      tier: 'LIVE_API',
      totalGlobalEvents: allEvents.length,
      indiaEventsCount: indiaEvents.length,
      apEventsCount: apEvents.length,
      fetchedAt: new Date().toISOString(),
      events: apEvents, // Strictly filtered for Andhra Pradesh operational boundary
      apEvents: apEvents,
      indiaEvents: indiaEvents,
      allEventsCount: allEvents.length,
      cached: false
    };

    gdacsCache = {
      data: result,
      expiresAt: now + GDACS_CACHE_TTL_MS
    };

    return result;

  } catch (err) {
    if (gdacsCache.data) {
      return { ...gdacsCache.data, cached: true, stale: true, upstreamError: err.message };
    }
    return {
      success: false,
      status: 'UNAVAILABLE',
      sourceId: 'gdacs_events',
      agency: 'Global Disaster Alert and Coordination System (GDACS)',
      error: 'GDACS feed error: ' + err.message,
      events: []
    };
  }
}

module.exports = {
  getGdacsEvents,
  isCoordInsideAP
};

