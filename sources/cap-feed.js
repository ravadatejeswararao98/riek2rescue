/**
 * RISK2RESCUE — COMMON ALERTING PROTOCOL (CAP) ENGINE (sources/cap-feed.js)
 * Generalised WMO/ITU-T Recommendation X.1303 CAP Feed Ingestion & AP Spatial Correlator
 * 
 * Sources:
 * - IMD (India Meteorological Department) CAP Feed
 * - NDMA (National Disaster Management Authority) Alert Hub
 */

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

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
  console.warn('[CAP] Failed to load AP boundary GeoJSON:', e.message);
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
  if (isNaN(lng) || !Number.isFinite(lng) || isNaN(lat) || !Number.isFinite(lat)) return false;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return false;
  if (apBoundaryGeom.type === 'Polygon') {
    return pointInPoly([lng, lat], apBoundaryGeom.coordinates[0]);
  }
  if (apBoundaryGeom.type === 'MultiPolygon') {
    return apBoundaryGeom.coordinates.some(ring => pointInPoly([lng, lat], ring[0]));
  }
  return false;
}

function isGeometryInsideAP(geom) {
  if (!geom || !apBoundaryGeom) return false;
  if (geom.type === 'Point' && Array.isArray(geom.coordinates)) {
    return isCoordInsideAP(geom.coordinates[0], geom.coordinates[1]);
  }
  if (geom.type === 'Polygon' && Array.isArray(geom.coordinates) && geom.coordinates[0]) {
    return geom.coordinates[0].some(pt => isCoordInsideAP(pt[0], pt[1]));
  }
  if (geom.type === 'MultiPolygon' && Array.isArray(geom.coordinates)) {
    return geom.coordinates.some(poly => poly[0] && poly[0].some(pt => isCoordInsideAP(pt[0], pt[1])));
  }
  return false;
}

const CAP_FEEDS = {
  cap_imd: {
    id: 'cap_imd',
    agency: 'India Meteorological Department (IMD)',
    url: process.env.IMD_CAP_URL || 'https://cap-sources.s3.amazonaws.com/in-imd-en/rss.xml',
    cadenceMs: 600000
  },
  cap_ndma: {
    id: 'cap_ndma',
    agency: 'National Disaster Management Authority (NDMA)',
    url: 'https://cap-sources.s3.amazonaws.com/in-ndma-en/rss.xml',
    cadenceMs: 3600000
  }
};

const AP_DISTRICT_KEYWORDS = [
  'andhra pradesh', ' a.p.', 'ap sdma', 'srikakulam', 'parvathipuram', 'manyam',
  'vizianagaram', 'visakhapatnam', 'alluri', 'sitharama', 'anakapalli', 'kakinada',
  'east godavari', 'konaseema', 'west godavari', 'eluru', 'krishna', 'ntr',
  'guntur', 'bapatla', 'palnadu', 'prakasam', 'nellore', 'spsr nellore',
  'kurnool', 'nandyal', 'anantapur', 'anantapuramu', 'sri sathya sai', 'ysr',
  'kadapa', 'annamayya', 'chittoor', 'tirupati', 'machilipatnam', 'rajahmundry',
  'vijayawada', 'ongole', 'coringa', 'uppada', 'bheemunipatnam', 'kalingapatnam'
];



const feedCache = new Map(); // sourceId -> { data, expiresAt }

function fetchText(targetUrl, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    try {
      const parsed = new URL(targetUrl);
      const client = parsed.protocol === 'https:' ? https : http;
      const req = client.request(parsed, {
        method: 'GET',
        headers: {
          'User-Agent': 'Risk2Rescue-CAP-Ingest/2.0 (Disaster-Management-Platform)',
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
            reject(new Error(`HTTP ${res.statusCode} from ${targetUrl}`));
          }
        });
      });
      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error(`Timeout after ${timeoutMs}ms from ${targetUrl}`));
      });
      req.end();
    } catch (e) {
      reject(e);
    }
  });
}

function capXmlTag(block, tagName) {
  const re = new RegExp('<(?:[a-zA-Z0-9_-]+:)?' + tagName + '[^>]*>([\\s\\S]*?)<\\/(?:[a-zA-Z0-9_-]+:)?' + tagName + '>', 'i');
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
  if (t.includes('cyclone')) return 'Cyclone';
  if (t.includes('thunder') || t.includes('lightning')) return 'Thunderstorm';
  if (t.includes('storm')) return 'Severe Storm';
  if (t.includes('flood') || t.includes('inundation')) return 'Flood';
  if (t.includes('landslide')) return 'Landslide';
  if (t.includes('heatwave') || t.includes('heat wave') || t.includes('heat stress')) return 'Heat Stress';
  if (t.includes('rain') || t.includes('rainfall')) return 'Heavy Rainfall';
  if (t.includes('fog')) return 'Dense Fog';
  if (t.includes('wind') || t.includes('squall')) return 'Strong Winds';
  if (t.includes('tsunami')) return 'Tsunami';
  return 'Weather Alert';
}

function inferSeverity(title, desc, rawSeverity) {
  if (rawSeverity) {
    const s = rawSeverity.trim().toLowerCase();
    if (s === 'extreme') return 'Extreme';
    if (s === 'severe') return 'Severe';
    if (s === 'moderate') return 'Moderate';
    if (s === 'minor') return 'Minor';
  }
  const t = (title + ' ' + desc).toLowerCase();
  if (t.includes('extreme') || t.includes('red alert')) return 'Extreme';
  if (t.includes('severe') || t.includes('orange alert')) return 'Severe';
  if (t.includes('moderate') || t.includes('yellow alert')) return 'Moderate';
  if (t.includes('minor') || t.includes('green alert')) return 'Minor';
  return 'Unknown';
}

function getSeverityWeight(severity) {
  switch ((severity || '').toLowerCase()) {
    case 'extreme': return 4;
    case 'severe': return 3;
    case 'moderate': return 2;
    case 'minor': return 1;
    default: return 0;
  }
}

/**
 * Fetch and parse a single CAP feed
 */
async function getCapFeed(sourceId, targetUrl, agencyLabel) {
  const now = Date.now();
  const cached = feedCache.get(sourceId);
  if (cached && now < cached.expiresAt) {
    return { ...cached.data, cached: true };
  }

  // Geographic filtering must fail closed if the official AP boundary cannot be loaded
  if (!apBoundaryGeom) {
    console.warn('[CAP] Fail-closed: Authoritative AP boundary GeoJSON not loaded. Rejecting alerts.');
    return {
      success: false,
      sourceId,
      agency: agencyLabel,
      url: targetUrl,
      error: 'Authoritative AP boundary GeoJSON not loaded — failing closed',
      alerts: [],
      count: 0
    };
  }

  const xml = await fetchText(targetUrl, 8000);
  const itemBlocks = xml.split(/<item[\s>]/i).slice(1);
  const alerts = [];

  for (const block of itemBlocks) {
    const title = capXmlTag(block, 'title');
    const description = capXmlTag(block, 'description');
    const link = capXmlTag(block, 'link');
    const guid = capXmlTag(block, 'guid');
    const identifier = capXmlTag(block, 'identifier') || guid || ('ALERT-' + Math.abs(hashCode(title + link)));
    const pubDate = capXmlTag(block, 'pubDate');
    const sent = capXmlTag(block, 'sent') || pubDate || '';
    const effective = capXmlTag(block, 'effective') || pubDate || '';
    const expires = capXmlTag(block, 'expires') || '';
    const areaDesc = capXmlTag(block, 'areaDesc') || capXmlTag(block, 'area_desc') || capXmlTag(block, 'area') || '';
    const rawSeverity = capXmlTag(block, 'severity');
    const rawCertainty = capXmlTag(block, 'certainty');
    const rawUrgency = capXmlTag(block, 'urgency');
    const instruction = capXmlTag(block, 'instruction');
    const rawPolygon = capXmlTag(block, 'polygon');
    const rawCircle = capXmlTag(block, 'circle');

    // 1. LIFECYCLE & OPERATIONAL STATE EVALUATION
    const isArchived = (sourceId === 'cap_ndma');
    const isDrill = title.toLowerCase().includes('[drill]') ||
                    description.toLowerCase().includes('[drill]') ||
                    rawSeverity === 'Test' ||
                    capXmlTag(block, 'status').toLowerCase() === 'test';

    let isExpired = false;
    let expirationStatus = 'UNKNOWN_EXPIRY';
    let requiresTemporalValidation = true;

    if (expires) {
      const expTime = new Date(expires).getTime();
      if (!isNaN(expTime)) {
        expirationStatus = 'AUTHENTIC_EXPIRY';
        requiresTemporalValidation = false;
        if (expTime < now) {
          isExpired = true;
        }
      }
    } else {
      // Historical fallback: if no expiresAt, check if issuedAt is older than 30 days
      const timestampToCheck = sent || pubDate || effective;
      if (timestampToCheck) {
        const parsedTime = new Date(timestampToCheck).getTime();
        if (!isNaN(parsedTime) && (now - parsedTime) > (30 * 24 * 60 * 60 * 1000)) {
          isExpired = true;
        }
      }
    }

    let operationalState = 'ACTIVE';
    if (isDrill) {
      operationalState = 'DRILL';
    } else if (isArchived) {
      operationalState = 'ARCHIVED';
    } else if (isExpired) {
      operationalState = 'EXPIRED';
    }

    const tier = isDrill ? 'SIMULATED' : (isArchived ? 'ARCHIVED' : 'LIVE_API');
    const role = isDrill ? 'DRILL' : (isArchived ? 'REFERENCE' : 'PRIMARY');

    // 2. GEOMETRY PARSING & MALFORMED COORDINATE VALIDATION
    let polygon = null;
    let circle = null;
    let hasCoordsInAP = false;
    let hasExplicitCoords = false;

    if (rawPolygon) {
      const pairs = rawPolygon.trim().split(/\s+/).map(p => {
        const parts = p.split(',').map(Number);
        if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1]) &&
            Number.isFinite(parts[0]) && Number.isFinite(parts[1]) &&
            parts[0] >= -90 && parts[0] <= 90 && parts[1] >= -180 && parts[1] <= 180) {
          return { lat: parts[0], lon: parts[1] };
        }
        return null;
      }).filter(Boolean);

      if (pairs.length >= 3) {
        polygon = pairs;
        hasExplicitCoords = true;
        hasCoordsInAP = pairs.some(pt => isCoordInsideAP(pt.lon, pt.lat));
      }
    }

    if (rawCircle) {
      const parts = rawCircle.trim().split(/\s+/);
      if (parts.length >= 1) {
        const coords = parts[0].split(',').map(Number);
        const rad = parts.length > 1 ? parseFloat(parts[1]) : 0;
        if (coords.length === 2 && !isNaN(coords[0]) && !isNaN(coords[1]) &&
            Number.isFinite(coords[0]) && Number.isFinite(coords[1]) &&
            coords[0] >= -90 && coords[0] <= 90 && coords[1] >= -180 && coords[1] <= 180 &&
            !isNaN(rad) && rad >= 0) {
          circle = { lat: coords[0], lon: coords[1], radiusKm: rad };
          hasExplicitCoords = true;
          hasCoordsInAP = isCoordInsideAP(coords[1], coords[0]);
        }
      }
    }

    // 3. GEOGRAPHIC FILTERING
    // Rule: Usable geometry/coordinates MUST be spatially validated against official AP boundary GeoJSON.
    // If explicit coordinates exist and are NOT inside AP, reject immediately.
    if (hasExplicitCoords && !hasCoordsInAP) {
      continue;
    }

    let geoMatch = null;
    if (hasCoordsInAP) {
      geoMatch = polygon ? 'POLYGON' : 'CIRCLE';
    } else if (!hasExplicitCoords) {
      // Text matching is ONLY secondary metadata when NO explicit coordinates are available
      const haystack = (title + ' ' + description + ' ' + areaDesc).toLowerCase();
      const matchesText = AP_DISTRICT_KEYWORDS.some(kw => {
        const regex = new RegExp(`\\b${kw.replace('.', '\\.')}\\b`, 'i');
        return regex.test(haystack);
      });
      if (matchesText) {
        geoMatch = 'TEXT';
      } else {
        continue;
      }
    } else {
      continue;
    }

    // 4. COORDINATE EXTRACTION (Strictly genuine coordinates — no fabricated fallbacks)
    let lat = null;
    let lng = null;
    let geometry = null;

    if (circle && typeof circle.lat === 'number' && typeof circle.lon === 'number') {
      lat = circle.lat;
      lng = circle.lon;
      geometry = { type: 'Point', coordinates: [circle.lon, circle.lat] };
    } else if (polygon && polygon.length > 0) {
      const sumLat = polygon.reduce((s, p) => s + p.lat, 0);
      const sumLon = polygon.reduce((s, p) => s + p.lon, 0);
      lat = Number((sumLat / polygon.length).toFixed(4));
      lng = Number((sumLon / polygon.length).toFixed(4));
      geometry = {
        type: 'Polygon',
        coordinates: [polygon.map(p => [p.lon, p.lat])]
      };
    }

    // 5. CANONICAL ALERT MODEL
    const severity = inferSeverity(title, description, rawSeverity);
    const urgency = rawUrgency ? (rawUrgency.charAt(0).toUpperCase() + rawUrgency.slice(1).toLowerCase()) : 'UNKNOWN';
    const certainty = rawCertainty ? (rawCertainty.charAt(0).toUpperCase() + rawCertainty.slice(1).toLowerCase()) : 'UNKNOWN';
    const eventType = inferHazardType(title, description);

    const alertRecord = {
      // IDENTITY
      id: identifier,
      alertId: identifier,
      sourceId,
      sourceAlertId: identifier,
      event: eventType,
      eventType,
      hazardType: eventType,
      hazard_type: eventType,

      // GEOGRAPHY
      lat,
      latitude: lat,
      lng,
      longitude: lng,
      geometry,
      geometryStatus: geometry ? 'AVAILABLE' : 'UNAVAILABLE',
      area: areaDesc || 'Andhra Pradesh Sector',
      areaDesc: areaDesc || 'Andhra Pradesh Sector',
      geoMatch,
      polygon: polygon || null,
      circle: circle || null,
      isInsideAP: true,

      // TIME (Never invent missing timestamps)
      issuedAt: sent || null,
      effectiveAt: effective || null,
      expiresAt: expires || null,
      observedAt: sent || effective || pubDate || null,
      fetchedAt: new Date(now).toISOString(),
      checkedAt: new Date(now).toISOString(),
      effective: effective || null,
      expires: expires || null,
      sent: sent || null,
      sourceTimestamp: sent || null,
      expirationStatus,
      requiresTemporalValidation,

      // OPERATIONAL STATE
      status: operationalState,
      operationalState,
      tier,
      role,
      isDrill,
      isSimulated: isDrill,

      // SEVERITY
      severity,
      sourceSeverity: rawSeverity || 'UNKNOWN',
      normalizedSeverity: severity,
      urgency,
      certainty,

      // CONTENT & PROVENANCE
      agency: agencyLabel,
      title: title || `${agencyLabel} Emergency Alert`,
      description: description.replace(/<[^>]+>/g, '').substring(0, 600).trim(),
      instruction: instruction ? instruction.replace(/<[^>]+>/g, '').substring(0, 600).trim() : null,
      sourceUrl: link || targetUrl,
      link: link || targetUrl,
      provenance: {
        sourceId,
        sourceTier: tier,
        sourceRole: role,
        agency: agencyLabel,
        url: targetUrl,
        originalSourceTimestamp: sent || effective || null,
        fetchedAt: new Date(now).toISOString(),
        contributingSources: [sourceId]
      }
    };

    alerts.push(alertRecord);
  }

  // Partition alerts into lifecycle states
  const isSourceArchived = (sourceId === 'cap_ndma');
  const activeAlerts = alerts.filter(a => a.operationalState === 'ACTIVE');
  const expiredAlerts = alerts.filter(a => a.operationalState === 'EXPIRED');
  const archivedAlerts = alerts.filter(a => a.operationalState === 'ARCHIVED');
  const drillAlerts = alerts.filter(a => a.operationalState === 'DRILL');

  // NDMA historical/archive data must NOT enter active alerts
  const liveOperationalAlerts = isSourceArchived ? [] : activeAlerts;

  const result = {
    success: true,
    sourceId,
    agency: agencyLabel,
    url: targetUrl,
    fetchedAt: new Date().toISOString(),
    count: liveOperationalAlerts.length,
    alerts: liveOperationalAlerts,
    activeAlerts: liveOperationalAlerts,
    expiredAlerts,
    archivedAlerts: isSourceArchived ? alerts : archivedAlerts,
    drillAlerts,
    allAlerts: alerts,
    totalRecords: alerts.length,
    cached: false
  };

  feedCache.set(sourceId, {
    data: result,
    expiresAt: now + (CAP_FEEDS[sourceId]?.cadenceMs || 600000)
  });

  return result;
}

function hashCode(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return hash;
}

/**
 * Fetch and merge all active Indian official CAP feeds into unified de-duplicated stream
 * Only genuinely live feeds (cap_imd) populate operational alerts.
 * Archived feeds (cap_ndma) are excluded from live operational queue.
 */
async function getOfficialCapAlerts() {
  const feedPromises = [
    getCapFeed('cap_imd', CAP_FEEDS.cap_imd.url, CAP_FEEDS.cap_imd.agency)
      .catch(err => ({ success: false, sourceId: 'cap_imd', error: err.message, alerts: [] }))
  ];

  const results = await Promise.all(feedPromises);
  const alertMap = new Map();

  results.forEach(res => {
    if (res && Array.isArray(res.alerts)) {
      res.alerts.forEach(alt => {
        const key = `${alt.sourceId}_${alt.id || alt.capIdentifier}`;
        if (!alertMap.has(key)) {
          alertMap.set(key, alt);
        }
      });
    }
  });

  // Sort by severity (Extreme first) then by recency (newest first)
  const mergedAlerts = Array.from(alertMap.values()).sort((a, b) => {
    const sDiff = getSeverityWeight(b.severity) - getSeverityWeight(a.severity);
    if (sDiff !== 0) return sDiff;
    return new Date(b.effectiveAt || b.effective || b.sent || 0).getTime() - new Date(a.effectiveAt || a.effective || a.sent || 0).getTime();
  });

  return {
    success: true,
    totalFeedsProbed: feedPromises.length,
    liveFeedsResponding: results.filter(r => r.success).length,
    count: mergedAlerts.length,
    alerts: mergedAlerts,
    fetchedAt: new Date().toISOString()
  };
}

module.exports = {
  CAP_FEEDS,
  getCapFeed,
  getOfficialCapAlerts,
  inferHazardType,
  inferSeverity,
  isCoordInsideAP,
  isGeometryInsideAP
};

