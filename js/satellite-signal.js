/**
 * RISK2RESCUE — SATELLITE HAZARD SIGNAL LAYER
 * Server-side Satellite Telemetry Module (js/satellite-signal.js)
 *
 * Lightweight, zero-dependency satellite observation engine:
 * 1. NASA FIRMS (Fire Information for Resource Management System) NRT VIIRS 24h Active Fire Feed
 *    - Free, no key required, direct open South Asia CSV ingestion
 *    - Spatial filtering against monitored hazard zones & habitations
 *    - Extraction of hotspot counts, Fire Radiative Power (FRP), and brightness temperature
 * 2. Sentinel Hub Free-Tier Processing API (Copernicus / Sinergise)
 *    - Server-side flood & surface-water compositing via NDWI (Normalized Difference Water Index) evalscript
 *    - Consumes server-side composited index results rather than running local ML pipelines
 *    - Seamless synthetic cloud composite fallback if credentials are unset or offline
 */

const https = require('https');
const http = require('http');

// NASA FIRMS South Asia 24-hour NRT Active Fire CSV (Suomi NPP VIIRS C2)
const NASA_FIRMS_VIIRS_CSV_URL = 'https://firms.modaps.eosdis.nasa.gov/data/active_fire/suomi-npp-viirs-c2/csv/SUOMI_VIIRS_C2_South_Asia_24h.csv';
const FIRMS_CACHE_TTL_MS = 15 * 60 * 1000; // 15-minute cache

class SatelliteSignal {
  constructor() {
    this.firmsCache = {
      hotspots: [],
      rawCount: 0,
      fetchedAt: 0
    };
    this.sentinelToken = null;
    this.sentinelTokenExpiry = 0;
  }

  /**
   * Helper HTTP/HTTPS fetcher
   */
  fetchText(targetUrl, timeoutMs = 8000) {
    return new Promise((resolve, reject) => {
      try {
        const parsed = new URL(targetUrl);
        const client = parsed.protocol === 'https:' ? https : http;
        const req = client.request(parsed, {
          method: 'GET',
          headers: {
            'User-Agent': 'RedZoneIntelligence/2.0 (Disaster-Management-Platform)',
            'Accept': 'text/csv, application/json, text/plain, */*'
          },
          timeout: timeoutMs
        }, (res) => {
          let data = '';
          res.on('data', chunk => data += chunk);
          res.on('end', () => {
            if (res.statusCode >= 200 && res.statusCode < 300) {
              resolve(data);
            } else {
              reject(new Error(`HTTP ${res.statusCode} from ${targetUrl}`));
            }
          });
        });
        req.on('error', reject);
        req.on('timeout', () => { req.destroy(); reject(new Error('Request timeout')); });
        req.end();
      } catch (err) {
        reject(err);
      }
    });
  }

  /**
   * Great-circle distance between two coordinates in kilometers
   */
  calcDistanceKm(lat1, lon1, lat2, lon2) {
    const R = 6371; // Earth radius in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  /**
   * 1. NASA FIRMS Active Fire Hotspots Ingestion
   */
  async fetchNasaFirmsHotspots() {
    try {
      const { getNasaFirmsHotspots } = require('../sources/nasa-firms.js');
      return await getNasaFirmsHotspots();
    } catch (err) {
      console.warn('[SatelliteSignal] NASA FIRMS module call failed:', err.message);
      return {
        status: 'UNAVAILABLE',
        sourceId: 'nasa_firms_viirs',
        observations: [],
        hotspots: [],
        rawCount: 0,
        observationCount: 0,
        fetchedAt: new Date().toISOString(),
        error: err.message
      };
    }
  }

  /**
   * 2. Primary Sentinel-1 GRD Discovery via Copernicus Data Space Ecosystem
   */
  async fetchSentinelFloodSignals(focalPoints = []) {
    try {
      const { getLatestSentinel1Observation, processLatestSentinel1Observation } = require('../sources/copernicus.js');
      if (typeof getLatestSentinel1Observation === 'function') {
        const copernicusRes = await getLatestSentinel1Observation();
        let processingRes = null;
        if (typeof processLatestSentinel1Observation === 'function') {
          try {
            processingRes = await processLatestSentinel1Observation();
          } catch (pe) {
            console.warn('[SatelliteSignal] Processing evaluation warning:', pe.message);
          }
        }
        if (copernicusRes && (copernicusRes.status === 'LIVE' || copernicusRes.status === 'DEGRADED')) {
          return {
            provider: 'Copernicus Data Space Ecosystem (Sentinel-1 SAR GRD)',
            sourceId: 'copernicus_dataspace',
            isLiveAuthenticated: true,
            status: copernicusRes.status,
            observationType: 'LATEST_SATELLITE_OBSERVATION',
            latestObservation: copernicusRes,
            processing: processingRes,
            composites: []
          };
        }
        if (copernicusRes && copernicusRes.status === 'NOT_CONFIGURED') {
          return {
            provider: 'Copernicus Data Space Ecosystem (Sentinel-1 SAR GRD)',
            sourceId: 'copernicus_dataspace',
            isLiveAuthenticated: false,
            status: 'NOT_CONFIGURED',
            observationType: 'LATEST_SATELLITE_OBSERVATION',
            detail: 'Add COPERNICUS_CLIENT_ID and COPERNICUS_CLIENT_SECRET to .env',
            latestObservation: null,
            processing: processingRes || {
              status: 'NOT_CONFIGURED',
              sourceId: 'copernicus_dataspace',
              sourceSceneId: null,
              observationType: 'LATEST_SATELLITE_OBSERVATION',
              indicatorType: 'SENTINEL1_GRD_DERIVED_INDICATORS',
              derivedAt: null,
              processedAt: null,
              contributingSources: ['copernicus_dataspace'],
              indicators: null,
              reason: 'COPERNICUS_CLIENT_ID or COPERNICUS_CLIENT_SECRET unset in .env'
            },
            composites: []
          };
        }
      }
    } catch (e) {
      console.warn('[SatelliteSignal] Copernicus integration error:', e.message);
    }

    // Default when credentials are unset: NOT_CONFIGURED, zero fabricated values
    return {
      provider: 'Copernicus Data Space Ecosystem (Sentinel-1 SAR GRD)',
      sourceId: 'copernicus_dataspace',
      isLiveAuthenticated: false,
      status: (process.env.COPERNICUS_CLIENT_ID && process.env.COPERNICUS_CLIENT_SECRET) ? 'UNAVAILABLE' : 'NOT_CONFIGURED',
      observationType: 'LATEST_SATELLITE_OBSERVATION',
      detail: (process.env.COPERNICUS_CLIENT_ID && process.env.COPERNICUS_CLIENT_SECRET) ? 'Copernicus upstream unavailable' : 'Add COPERNICUS_CLIENT_ID and COPERNICUS_CLIENT_SECRET to .env',
      latestObservation: null,
      processing: {
        status: (process.env.COPERNICUS_CLIENT_ID && process.env.COPERNICUS_CLIENT_SECRET) ? 'UNAVAILABLE' : 'NOT_CONFIGURED',
        sourceId: 'copernicus_dataspace',
        sourceSceneId: null,
        observationType: 'LATEST_SATELLITE_OBSERVATION',
        indicatorType: 'SENTINEL1_GRD_DERIVED_INDICATORS',
        derivedAt: null,
        processedAt: null,
        contributingSources: ['copernicus_dataspace'],
        indicators: null,
        reason: (process.env.COPERNICUS_CLIENT_ID && process.env.COPERNICUS_CLIENT_SECRET) ? 'Copernicus upstream unavailable' : 'Add COPERNICUS_CLIENT_ID and COPERNICUS_CLIENT_SECRET to .env'
      },
      composites: []
    };
  }

  /**
   * LEGACY / REFERENCE ONLY: Generates OAuth Bearer token for Sentinel Hub
   * NOT_USED_FOR_LATEST_SENTINEL1 (Replaced by Copernicus Data Space Ecosystem)
   */
  getSentinelAuthToken(clientId, clientSecret) {
    return new Promise((resolve, reject) => {
      const payload = `grant_type=client_credentials&client_id=${encodeURIComponent(clientId)}&client_secret=${encodeURIComponent(clientSecret)}`;
      const req = https.request({
        hostname: 'services.sentinel-hub.com',
        path: '/oauth/token',
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(payload)
        },
        timeout: 5000
      }, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          if (res.statusCode === 200) {
            try {
              const parsed = JSON.parse(body);
              resolve(parsed.access_token);
            } catch (e) { reject(e); }
          } else {
            reject(new Error(`OAuth error HTTP ${res.statusCode}`));
          }
        });
      });
      req.on('error', reject);
      req.write(payload);
      req.end();
    });
  }

  /**
   * LEGACY / REFERENCE ONLY: Executes Sentinel Hub Processing API request with an NDWI flood compositing evalscript
   * NOT_USED_FOR_LATEST_SENTINEL1 (Replaced by Copernicus Data Space Ecosystem)
   */
  callSentinelProcessingApi(token, focalPoints) {
    if (!focalPoints.length) return null;
    const pt = focalPoints[0];
    const bbox = [pt.lng - 0.05, pt.lat - 0.05, pt.lng + 0.05, pt.lat + 0.05];

    const evalscript = `//VERSION=3
function setup() {
  return {
    input: ["B03", "B08", "dataMask"],
    output: { bands: 1 }
  };
}
function evaluatePixel(sample) {
  let ndwi = (sample.B03 - sample.B08) / (sample.B03 + sample.B08);
  return [ndwi > 0.1 ? 1 : 0]; // 1 if water
}`;

    const requestBody = JSON.stringify({
      input: {
        bounds: {
          bbox: bbox,
          properties: { crs: 'http://www.opengis.net/def/crs/EPSG/0/4326' }
        },
        data: [{
          type: 'sentinel-2-l2a',
          dataFilter: {
            timeRange: {
              from: new Date(Date.now() - 5 * 86400000).toISOString(),
              to: new Date().toISOString()
            },
            maxCloudCoverage: 30
          }
        }]
      },
      evalscript: evalscript
    });

    return new Promise((resolve) => {
      const req = https.request({
        hostname: 'services.sentinel-hub.com',
        path: '/api/v1/process',
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Content-Length': Buffer.byteLength(requestBody)
        },
        timeout: 6000
      }, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          if (res.statusCode === 200) {
            // Honest processing: only report live authenticated status with verified composites
            resolve({
              provider: 'Sentinel Hub Processing API (Live)',
              isLiveAuthenticated: true,
              composites: []
            });
          } else {
            resolve(null);
          }
        });
      });
      req.on('error', () => resolve(null));
      req.write(requestBody);
      req.end();
    });
  }

  /**
   * Main Correlator: Associates Satellite Signals with Dynamic Zones & Clusters
   */
  async getSatelliteHazardSummary(zones = [], habitations = []) {
    const firmsData = await this.fetchNasaFirmsHotspots();
    const focalPoints = [
      { key: 'kakinada_uppada', lat: 16.98, lng: 82.25, name: 'Kakinada-Uppada Coast' },
      { key: 'godavari_delta', lat: 16.58, lng: 82.01, name: 'Godavari Delta Inundation Corridor' },
      { key: 'krishna_diviseema', lat: 16.02, lng: 80.92, name: 'Diviseema Coastal Reach' },
      { key: 'araku_ghats', lat: 18.33, lng: 82.88, name: 'Araku Valley Landslide Belt' }
    ];

    const sentinelData = await this.fetchSentinelFloodSignals(focalPoints);

    // Correlate hotspots with zones (within 35 km radius)
    const zoneSignals = zones.map(zone => {
      const zLat = zone.lat;
      const zLng = zone.lng;
      let nearbyHotspots = [];
      let maxFrp = 0;

      const hotspotList = firmsData.observations || firmsData.hotspots || [];
      if (zLat && zLng && Array.isArray(hotspotList)) {
        for (const spot of hotspotList) {
          const sLat = spot.latitude !== undefined ? spot.latitude : spot.lat;
          const sLon = spot.longitude !== undefined ? spot.longitude : spot.lon;
          if (typeof sLat !== 'number' || typeof sLon !== 'number') continue;
          const dist = this.calcDistanceKm(zLat, zLng, sLat, sLon);
          if (dist <= 35) { // 35 km radius
            nearbyHotspots.push({
              distKm: Math.round(dist * 10) / 10,
              frp: spot.frp,
              confidence: spot.confidence,
              brightness: spot.brightness,
              date: spot.observedAt || spot.date
            });
            if (typeof spot.frp === 'number' && spot.frp > maxFrp) maxFrp = spot.frp;
          }
        }
      }

      // Match closest Sentinel composite if available
      let matchedSentinel = (sentinelData.composites && sentinelData.composites.length > 0) ? sentinelData.composites[0] : null;
      let closestDist = Infinity;
      if (sentinelData.composites && sentinelData.composites.length > 0) {
        for (const comp of sentinelData.composites) {
          const d = this.calcDistanceKm(zLat, zLng, comp.lat, comp.lng);
          if (d < closestDist) {
            closestDist = d;
            matchedSentinel = comp;
          }
        }
      }

      return {
        zoneId: zone.id || zone.village_id,
        zoneName: zone.name,
        lat: zLat,
        lng: zLng,
        activeHotspotCount: nearbyHotspots.length,
        maxFrpMw: Math.round(maxFrp * 10) / 10,
        nearbyHotspots: nearbyHotspots.slice(0, 5),
        floodExpansionPct: matchedSentinel ? matchedSentinel.waterIndexExpansionPct : null,
        floodRiskStatus: matchedSentinel ? matchedSentinel.floodRiskStatus : (sentinelData.status || 'NOT_CONFIGURED'),
        sensor: matchedSentinel ? matchedSentinel.satelliteSensor : 'Copernicus Sentinel-1 SAR (Not Configured)'
      };
    });

    // Total subcontinental and regional summary
    const totalMonitoredHotspots = zoneSignals.reduce((acc, z) => acc + z.activeHotspotCount, 0);
    const zonesWithFires = zoneSignals.filter(z => z.activeHotspotCount > 0);
    const zonesWithFloods = zoneSignals.filter(z => z.floodExpansionPct !== null && z.floodExpansionPct >= 15);

    const briefingStatements = [];
    if (firmsData.status === 'NOT_CONFIGURED') {
      briefingStatements.push('NASA FIRMS VIIRS fire feed not configured (add NASA_FIRMS_MAP_KEY to .env).');
    } else if (firmsData.status === 'UNAVAILABLE') {
      briefingStatements.push('NASA VIIRS thermal anomaly feed currently unavailable from upstream.');
    } else if (zonesWithFires.length > 0) {
      const topFireZone = zonesWithFires[0];
      briefingStatements.push(`NASA VIIRS detected ${topFireZone.activeHotspotCount} active fire hotspot(s) (peak FRP ${topFireZone.maxFrpMw} MW) within 35km of ${topFireZone.zoneName}.`);
    } else {
      briefingStatements.push('NASA VIIRS thermal anomaly sweep confirms zero active fire clusters in monitored habitations.');
    }

    if (sentinelData.status === 'NOT_CONFIGURED') {
      briefingStatements.push('Copernicus Data Space Ecosystem (Sentinel-1 SAR) not configured (add credentials to .env).');
    } else if (sentinelData.status === 'UNAVAILABLE') {
      briefingStatements.push('Copernicus Data Space Ecosystem (Sentinel-1 SAR) currently unavailable from upstream.');
    } else if (sentinelData.latestObservation && sentinelData.latestObservation.sceneId) {
      const proc = sentinelData.processing;
      if (proc && proc.status === 'PROCESSED' && proc.indicators && proc.indicators.sarBackscatterStats) {
        briefingStatements.push(`Latest Sentinel-1 observation (${sentinelData.latestObservation.sceneId}) processed: Mean backscatter ${proc.indicators.sarBackscatterStats.meanDb} dB, anomaly ${proc.indicators.surfaceWaterAnomaly.status}.`);
      } else {
        briefingStatements.push(`Latest Sentinel-1 observation acquired at ${sentinelData.latestObservation.acquisitionStart || 'recent pass'} across Andhra Pradesh (Platform ${sentinelData.latestObservation.platform}, Polarisation ${sentinelData.latestObservation.polarization || 'Dual'}). Satellite processing unavailable.`);
      }
    } else if (zonesWithFloods.length > 0) {
      const topFloodZone = zonesWithFloods[0];
      briefingStatements.push(`Sentinel-1 SAR radar reveals +${topFloodZone.floodExpansionPct}% surface-water inundation expansion across ${topFloodZone.zoneName}.`);
    }

    return {
      fetchedAt: new Date().toISOString(),
      firmsStatus: firmsData.status || 'UNAVAILABLE',
      firmsSubcontinentTotal: firmsData.rawCount || firmsData.observationCount || 0,
      totalMonitoredHotspots,
      zonesWithFiresCount: zonesWithFires.length,
      zonesWithFloodsCount: zonesWithFloods.length,
      briefingStatements,
      zoneSignals,
      sentinelProvider: sentinelData.provider,
      sentinelStatus: sentinelData.status,
      latestObservation: sentinelData.latestObservation || null,
      processing: sentinelData.processing || null
    };
  }

}

const instance = new SatelliteSignal();
module.exports = instance;
