/**
 * RISK2RESCUE — GDACS GLOBAL DISASTER EVENT FEED (sources/gdacs.js)
 * Global Disaster Alert and Coordination System (UN / European Commission)
 * 
 * Role: CROSS_CHECK & CORROBORATION ONLY
 * Never let GDACS alone create a zone — it is coarser than Indian national feeds.
 * Used to corroborate Indian official CAP alerts and raise confidence.
 */

const https = require('https');

const GDACS_FEED_URL = 'https://www.gdacs.org/xml/rss.xml';
const GDACS_CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes
let gdacsCache = { data: null, expiresAt: 0 };

function fetchText(targetUrl, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    try {
      const parsed = new URL(targetUrl);
      const req = https.request({
        hostname: parsed.hostname,
        port: 443,
        path: parsed.pathname + parsed.search,
        method: 'GET',
        headers: {
          'User-Agent': 'Risk2Rescue-GDACS-Correlator/2.0 (Disaster-Management-Platform)',
          'Accept': 'application/rss+xml, application/xml, text/xml, */*'
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

// Bounding box for Andhra Pradesh: lat 12.5 to 19.5, lon 76.5 to 85.0
function isCoordInsideAP(lat, lon) {
  return lat >= 12.5 && lat <= 19.5 && lon >= 76.5 && lon <= 85.0;
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

      const isIndia = (country && country.toLowerCase().includes('india')) ||
                      (!isNaN(lat) && !isNaN(lon) && isCoordInsideIndia(lat, lon));

      if (isIndia) {
        const inAP = !isNaN(lat) && !isNaN(lon) && isCoordInsideAP(lat, lon);
        eventObj.inAndhraPradesh = inAP;
        indiaEvents.push(eventObj);
        if (inAP) apEvents.push(eventObj);
      }
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
      events: indiaEvents, // Prioritize India-region events
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
  getGdacsEvents
};
