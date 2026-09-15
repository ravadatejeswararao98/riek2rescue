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

// Rough AP bounding box for quick coordinate validation: lat 12.5 to 19.5, lon 76.5 to 85.0
function isPointInAPBox(lat, lon) {
  return lat >= 12.5 && lat <= 19.5 && lon >= 76.5 && lon <= 85.0;
}

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
  if (t.includes('cyclone') || t.includes('storm'))    return 'Cyclone';
  if (t.includes('flood') || t.includes('inundation')) return 'Flood';
  if (t.includes('landslide'))                         return 'Landslide';
  if (t.includes('heatwave') || t.includes('heat wave')) return 'Heat Wave';
  if (t.includes('thunder') || t.includes('lightning'))return 'Thunderstorm';
  if (t.includes('rain') || t.includes('rainfall'))   return 'Heavy Rainfall';
  if (t.includes('fog'))                               return 'Dense Fog';
  if (t.includes('wind') || t.includes('squall'))      return 'Strong Winds';
  if (t.includes('tsunami'))                           return 'Tsunami';
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
  if (t.includes('extreme') || t.includes('red alert'))   return 'Extreme';
  if (t.includes('severe')  || t.includes('orange alert')) return 'Severe';
  if (t.includes('moderate')|| t.includes('yellow alert')) return 'Moderate';
  if (t.includes('minor')   || t.includes('green alert'))  return 'Minor';
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

  const xml = await fetchText(targetUrl, 8000);
  const itemBlocks = xml.split(/<item[\s>]/i).slice(1);
  const alerts = [];

  for (const block of itemBlocks) {
    const title       = capXmlTag(block, 'title');
    const description = capXmlTag(block, 'description');
    const link        = capXmlTag(block, 'link');
    const guid        = capXmlTag(block, 'guid');
    const identifier  = capXmlTag(block, 'identifier') || guid || ('ALERT-' + Math.abs(hashCode(title + link)));
    const pubDate     = capXmlTag(block, 'pubDate');
    const sent        = capXmlTag(block, 'sent') || pubDate || new Date().toISOString();
    const effective   = capXmlTag(block, 'effective') || pubDate || new Date().toISOString();
    const expires     = capXmlTag(block, 'expires') || '';
    const areaDesc    = capXmlTag(block, 'areaDesc') || capXmlTag(block, 'area_desc') || capXmlTag(block, 'area') || '';
    const rawSeverity = capXmlTag(block, 'severity');
    const certainty   = capXmlTag(block, 'certainty') || 'Observed';
    const urgency     = capXmlTag(block, 'urgency') || 'Immediate';
    const rawPolygon  = capXmlTag(block, 'polygon');
    const rawCircle   = capXmlTag(block, 'circle');

    // Parse geometry if present
    let polygon = null;
    let circle = null;
    let hasCoordsInAP = false;

    if (rawPolygon) {
      // Pairs of "lat,lon lat,lon ..."
      const pairs = rawPolygon.trim().split(/\s+/).map(p => {
        const parts = p.split(',').map(Number);
        return parts.length === 2 ? { lat: parts[0], lon: parts[1] } : null;
      }).filter(Boolean);
      if (pairs.length >= 3) {
        polygon = pairs;
        hasCoordsInAP = pairs.some(pt => isPointInAPBox(pt.lat, pt.lon));
      }
    }

    if (rawCircle) {
      // "lat,lon radius"
      const parts = rawCircle.trim().split(/\s+/);
      if (parts.length >= 1) {
        const coords = parts[0].split(',').map(Number);
        const rad = parts.length > 1 ? parseFloat(parts[1]) : 0;
        if (coords.length === 2) {
          circle = { lat: coords[0], lon: coords[1], radiusKm: rad };
          hasCoordsInAP = isPointInAPBox(coords[0], coords[1]);
        }
      }
    }

    // Determine geographic match confidence with word boundary check
    let geoMatch = null;
    const haystack = (title + ' ' + description + ' ' + areaDesc).toLowerCase();
    const matchesText = AP_DISTRICT_KEYWORDS.some(kw => {
      const regex = new RegExp(`\\b${kw.replace('.', '\\.')}\\b`, 'i');
      return regex.test(haystack);
    });

    if (hasCoordsInAP) {
      geoMatch = polygon ? 'POLYGON' : 'CIRCLE';
    } else if (matchesText) {
      geoMatch = 'TEXT';
    } else {
      // Alert does not pertain to Andhra Pradesh or known disaster zones
      continue;
    }

    alerts.push({
      capIdentifier: identifier,
      sourceId,
      agency: agencyLabel,
      title: title || `${agencyLabel} Emergency Alert`,
      hazard_type: inferHazardType(title, description),
      severity: inferSeverity(title, description, rawSeverity),
      certainty,
      urgency,
      areaDesc: areaDesc || 'Andhra Pradesh Sector',
      geoMatch, // 'POLYGON' | 'CIRCLE' | 'TEXT'
      effective,
      expires,
      sent,
      description: description.replace(/<[^>]+>/g, '').substring(0, 600).trim(),
      polygon,
      circle,
      link: link || targetUrl
    });
  }

  const result = {
    success: true,
    sourceId,
    agency: agencyLabel,
    url: targetUrl,
    fetchedAt: new Date().toISOString(),
    count: alerts.length,
    alerts,
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
 */
async function getOfficialCapAlerts() {
  const feedPromises = [
    getCapFeed('cap_imd', CAP_FEEDS.cap_imd.url, CAP_FEEDS.cap_imd.agency)
      .catch(err => ({ success: false, sourceId: 'cap_imd', error: err.message, alerts: [] })),
    getCapFeed('cap_ndma', CAP_FEEDS.cap_ndma.url, CAP_FEEDS.cap_ndma.agency)
      .catch(err => ({ success: false, sourceId: 'cap_ndma', error: err.message, alerts: [] }))
  ];

  const results = await Promise.all(feedPromises);
  const alertMap = new Map();

  results.forEach(res => {
    if (res && Array.isArray(res.alerts)) {
      res.alerts.forEach(alt => {
        if (!alertMap.has(alt.capIdentifier)) {
          alertMap.set(alt.capIdentifier, alt);
        }
      });
    }
  });

  // Sort by severity (Extreme first) then by recency (newest first)
  const mergedAlerts = Array.from(alertMap.values()).sort((a, b) => {
    const sDiff = getSeverityWeight(b.severity) - getSeverityWeight(a.severity);
    if (sDiff !== 0) return sDiff;
    return new Date(b.effective || b.sent || 0).getTime() - new Date(a.effective || a.sent || 0).getTime();
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
  inferSeverity
};
