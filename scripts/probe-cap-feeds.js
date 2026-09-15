/**
 * SACHET / Alert Hub CAP Feed Discovery Script (scripts/probe-cap-feeds.js)
 * Tests candidate S3 and WorldWeather CAP endpoints for Indian agencies:
 * - IMD (Meteorology)
 * - CWC (Central Water Commission - Floods)
 * - INCOIS (Ocean & Tsunami)
 * - GSI (Geological Survey of India - Landslides)
 * - NDMA (National Disaster Management Authority)
 */

const https = require('https');

const CANDIDATES = [
  // Primary S3 Alert Hub bucket patterns
  { id: 'in-imd-en', agency: 'IMD', url: 'https://cap-sources.s3.amazonaws.com/in-imd-en/rss.xml' },
  { id: 'in-cwc-en', agency: 'CWC', url: 'https://cap-sources.s3.amazonaws.com/in-cwc-en/rss.xml' },
  { id: 'in-incois-en', agency: 'INCOIS', url: 'https://cap-sources.s3.amazonaws.com/in-incois-en/rss.xml' },
  { id: 'in-gsi-en', agency: 'GSI', url: 'https://cap-sources.s3.amazonaws.com/in-gsi-en/rss.xml' },
  { id: 'in-ndma-en', agency: 'NDMA', url: 'https://cap-sources.s3.amazonaws.com/in-ndma-en/rss.xml' },

  // WorldWeather mirror pattern
  { id: 'ww-in-imd-en', agency: 'IMD (WW)', url: 'https://alert-feed.worldweather.org/in-imd-en/rss.xml' },
  { id: 'ww-in-cwc-en', agency: 'CWC (WW)', url: 'https://alert-feed.worldweather.org/in-cwc-en/rss.xml' },
  { id: 'ww-in-incois-en', agency: 'INCOIS (WW)', url: 'https://alert-feed.worldweather.org/in-incois-en/rss.xml' },
  { id: 'ww-in-gsi-en', agency: 'GSI (WW)', url: 'https://alert-feed.worldweather.org/in-gsi-en/rss.xml' },
  { id: 'ww-in-ndma-en', agency: 'NDMA (WW)', url: 'https://alert-feed.worldweather.org/in-ndma-en/rss.xml' },

  // Direct official endpoints
  { id: 'imd-mausam-cap', agency: 'IMD Direct', url: 'https://mausam.imd.gov.in/responsive/cap_rss.php' }
];

function fetchFeed(targetUrl) {
  return new Promise((resolve) => {
    try {
      const parsed = new URL(targetUrl);
      const req = https.request({
        hostname: parsed.hostname,
        port: 443,
        path: parsed.pathname + parsed.search,
        method: 'GET',
        headers: {
          'User-Agent': 'Risk2Rescue-CAP-Discovery/2.0 (Disaster-Management-Platform)',
          'Accept': 'application/rss+xml, application/xml, text/xml, */*'
        },
        timeout: 8000
      }, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          const contentType = res.headers['content-type'] || 'unknown';
          const items = body.split(/<item[\s>]/).length - 1;
          const pubDates = body.match(/<pubDate>(.*?)<\/pubDate>/gi) || [];
          const newestPubDate = pubDates.length > 0 ? pubDates[0].replace(/<\/?pubDate>/gi, '') : 'N/A';
          resolve({
            status: res.statusCode,
            contentType,
            itemCount: Math.max(0, items),
            newestPubDate,
            bodySnippet: body.slice(0, 150)
          });
        });
      });

      req.on('error', err => resolve({ status: 'ERR', error: err.message }));
      req.on('timeout', () => {
        req.destroy();
        resolve({ status: 'TIMEOUT', error: 'Timed out after 8s' });
      });
      req.end();
    } catch (e) {
      resolve({ status: 'EXCEPTION', error: e.message });
    }
  });
}

async function run() {
  console.log('=== PROBING CANDIDATE INDIAN CAP FEEDS (SACHET / Alert Hub) ===\n');
  console.log('| Feed ID | Agency | Status | Content-Type | Items | Newest PubDate | Usable? | URL |');
  console.log('|---|---|---|---|---|---|---|---|');

  const results = [];

  for (const c of CANDIDATES) {
    const res = await fetchFeed(c.url);
    const isUsable = res.status === 200 && res.itemCount >= 0 && (res.contentType.includes('xml') || res.bodySnippet.includes('<rss') || res.bodySnippet.includes('<feed'));
    const ct = (res.contentType || 'unknown').split(';')[0];
    console.log(`| \`${c.id}\` | ${c.agency} | ${res.status} | ${ct} | ${res.itemCount ?? 0} | ${res.newestPubDate ?? 'N/A'} | ${isUsable ? '✅ YES' : '❌ NO'} | \`${c.url}\` |`);
  }

  console.log('\n=== DISCOVERY SUMMARY ===');
  const usableFeeds = results.filter(r => r.isUsable);
  console.log(`Found ${usableFeeds.length} working CAP feeds out of ${results.length} tested.`);
  usableFeeds.forEach(f => {
    console.log(` - ${f.agency} (${f.id}): ${f.itemCount} items, newest: ${f.newestPubDate}`);
  });
}

run();
