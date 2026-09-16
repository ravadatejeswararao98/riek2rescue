/**
 * RISK2RESCUE — CANONICAL LIVE STATE MODULE (js/live-state.js)
 * 
 * Central Normalized Operational State Layer.
 * Universal Module: Usable in Node.js backend (CommonJS) and browser frontends (window.LiveState).
 * 
 * TELEMETRY TRUTH DIRECTIVES:
 * 1. Single operational source for all operational data:
 *    hazards, risk zones, weather, river levels, citizen reports, official alerts,
 *    satellite/fire observations, shelter occupancy, habitations, population exposure,
 *    routing/ETA, summary statistics, and AI context.
 * 2. Strict Normalization Contract:
 *    Every metric exposes: value, sourceId, agency, observedAt, fetchedAt, status, freshnessSeconds, confidence, unit, provenance.
 * 3. Never invent a number:
 *    Unavailable live telemetry resolves to value: null, status: "UNAVAILABLE" or "NOT_CONFIGURED".
 *    Unknown shelter occupancy resolves to value: null, status: "UNKNOWN".
 * 4. Andhra Pradesh boundary enforcement:
 *    Coordinates and polygons are validated against the authoritative AP boundary.
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    // Node.js CommonJS
    module.exports = factory();
  } else {
    // Browser global
    root.LiveState = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // --- Helper: Universal Metric Normalizer ---
  function normalizeMetric({
    value = null,
    sourceId = 'unknown',
    agency = 'Unknown Agency',
    observedAt = null,
    fetchedAt = null,
    status = 'UNAVAILABLE',
    confidence = null,
    unit = '',
    tier = 'LIVE_API',
    role = 'PRIMARY',
    contributingSources = []
  }) {
    const fetchTs = fetchedAt || new Date().toISOString();
    let freshnessSeconds = null;
    if (observedAt) {
      const ageMs = Date.now() - new Date(observedAt).getTime();
      if (!isNaN(ageMs)) freshnessSeconds = Math.max(0, Math.round(ageMs / 1000));
    } else if (fetchedAt) {
      const ageMs = Date.now() - new Date(fetchedAt).getTime();
      if (!isNaN(ageMs)) freshnessSeconds = Math.max(0, Math.round(ageMs / 1000));
    }

    return {
      value,
      sourceId,
      agency,
      observedAt,
      fetchedAt: fetchTs,
      status: (value === null && status === 'LIVE') ? 'UNAVAILABLE' : status,
      freshnessSeconds,
      confidence,
      unit,
      provenance: {
        tier,
        role,
        contributingSources
      }
    };
  }

  // --- State Container ---
  let currentState = null;
  const subscribers = new Set();

  function getDefaultEmptyState() {
    const now = new Date().toISOString();
    return {
      version: '2.0.0',
      timestamp: now,
      summary: {
        activeHazardsCount: 0,
        populationAtRisk: normalizeMetric({
          value: 0,
          sourceId: 'census_india_ap',
          agency: 'Census 2011 & AP SDMA',
          tier: 'DERIVED',
          role: 'PRIMARY',
          status: 'BASELINE',
          unit: 'citizens',
          contributingSources: ['cap_imd', 'census_india_ap']
        }),
        sheltersReportingCount: 0,
        totalShelterCapacity: 0,
        totalShelterOccupancy: null,
        shelterOccupancyStatus: 'UNKNOWN',
        liveSourceCount: 0,
        status: 'INITIALIZING'
      },
      weather: {
        sourceId: 'openmeteo_weather',
        source: 'Open-Meteo',
        status: 'UNAVAILABLE',
        latitude: null,
        longitude: null,
        temperatureC: null,
        apparentTemperatureC: null,
        relativeHumidity: null,
        precipitationMm: null,
        rainMm: null,
        snowfallCm: null,
        pressureHpa: null,
        windSpeedKmh: null,
        windDirectionDeg: null,
        maxGustKmh: null,
        weatherCode: null,
        weatherDescription: null,
        observedAt: null,
        fetchedAt: null,
        forecastTime: null,
        provenance: null,
        surfaceWindKmh: normalizeMetric({ value: null, sourceId: 'openmeteo_weather', agency: 'Open-Meteo', unit: 'km/h', status: 'UNAVAILABLE' }),
        maxGustKmhMetric: normalizeMetric({ value: null, sourceId: 'openmeteo_weather', agency: 'Open-Meteo', unit: 'km/h', status: 'UNAVAILABLE' }),
        corePressureHpa: normalizeMetric({ value: null, sourceId: 'openmeteo_weather', agency: 'Open-Meteo', unit: 'hPa', status: 'UNAVAILABLE' }),
        precipitationMmMetric: normalizeMetric({ value: null, sourceId: 'openmeteo_weather', agency: 'Open-Meteo', unit: 'mm', status: 'UNAVAILABLE' }),
        temperatureCMetric: normalizeMetric({ value: null, sourceId: 'openmeteo_weather', agency: 'Open-Meteo', unit: '°C', status: 'UNAVAILABLE' })
      },
      airQuality: {
        sourceId: 'openmeteo_airquality',
        source: 'Open-Meteo Air Quality',
        status: 'UNAVAILABLE',
        latitude: null,
        longitude: null,
        observedAt: null,
        fetchedAt: null,
        europeanAqi: null,
        usAqi: null,
        pm2_5: null,
        pm10: null,
        carbonMonoxide: null,
        nitrogenDioxide: null,
        sulphurDioxide: null,
        ozone: null,
        category: 'Unavailable',
        color: '#94a3b8',
        provenance: null,
        pm25Metric: normalizeMetric({ value: null, sourceId: 'openmeteo_airquality', agency: 'Open-Meteo Atmospheric Quality Feed', unit: 'µg/m³', status: 'UNAVAILABLE' }),
        pm10Metric: normalizeMetric({ value: null, sourceId: 'openmeteo_airquality', agency: 'Open-Meteo Atmospheric Quality Feed', unit: 'µg/m³', status: 'UNAVAILABLE' }),
        usAqiMetric: normalizeMetric({ value: null, sourceId: 'openmeteo_airquality', agency: 'Open-Meteo Atmospheric Quality Feed', unit: 'AQI', status: 'UNAVAILABLE' })
      },
      seismic: {
        status: 'NORMAL',
        latestQuake: null,
        countInsideAP: 0,
        maxMagnitude: 0,
        sourceId: 'usgs_earthquakes',
        agency: 'National Center for Seismology (NCS India)'
      },
      riverLevels: {
        status: 'UNAVAILABLE',
        sourceId: 'cwc_nwic_river',
        source: 'National Water Data Portal (NWIC / Central Water Commission)',
        stationId: null,
        stationName: null,
        riverName: null,
        latitude: null,
        longitude: null,
        observedAt: null,
        fetchedAt: null,
        waterLevel: null,
        waterLevelUnit: 'm',
        dangerLevel: null,
        dangerLevelUnit: 'm',
        warningLevel: null,
        warningLevelUnit: 'm',
        stationStatus: 'UNAVAILABLE',
        floodCondition: 'UNKNOWN',
        trend: 'UNKNOWN',
        discharge: null,
        dischargeUnit: 'cusecs',
        provenance: 'cwc_nwic_live',
        stale: false,
        stations: [],
        derivedCondition: {
          sourceId: 'derived_flood_condition',
          status: 'UNAVAILABLE',
          contributingSources: [],
          condition: 'UNKNOWN'
        }
      },
      alerts: [],
      hazards: [],
      riskZones: [],
      shelters: [],
      habitations: [],
      priorityQueue: [],
      fire: {
        sourceId: 'nasa_firms_viirs',
        source: 'NASA FIRMS VIIRS (Active Fire / Thermal Anomaly)',
        status: 'UNAVAILABLE',
        observations: [],
        observationCount: 0,
        latestObservedAt: null,
        fetchedAt: null,
        peakFrpMw: null,
        stale: false,
        provenance: 'nasa_firms_live'
      },
      satellite: {
        status: 'NOT_CONFIGURED',
        sourceId: 'copernicus_dataspace',
        source: 'Copernicus Data Space Ecosystem (Sentinel-1 SAR GRD)',
        observationType: 'LATEST_SATELLITE_OBSERVATION',
        satellite: 'Sentinel-1',
        productType: 'GRD',
        sceneId: null,
        title: null,
        acquisitionStart: null,
        acquisitionEnd: null,
        discoveredAt: null,
        platform: null,
        instrument: 'C-SAR',
        orbitDirection: null,
        relativeOrbit: null,
        polarization: null,
        mode: null,
        footprint: null,
        sourceUrl: null,
        provenance: 'copernicus_dataspace_live',
        stale: false,
        historical: false,
        scenes: [],
        sceneList: [],
        nasaFirmsHotspots: [],
        hotspotsInsideAPCount: 0,
        peakFrpMw: 0,
        sentinelFloodStatus: 'NOT_CONFIGURED',
        briefingStatements: [],
        processing: {
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
        }
      },
      citizenReports: {
        verified: [],
        pendingQueue: [],
        rejected: [],
        resolved: [],
        drill: [],
        totalReported: 0,
        pendingCount: 0,
        verifiedCount: 0,
        rejectedCount: 0,
        resolvedCount: 0
      },
      sourceHealth: null,
      aiContext: null
    };
  }

  // --- Backend Compiler (Used on server) ---
  function buildCanonicalState({
    weatherRaw = null,
    airQualityRaw = null,
    seismicRaw = null,
    cwcRaw = null,
    googleFloodRaw = null,
    capAlerts = [],
    gdacsRaw = [],
    firmsRaw = null,
    sentinelRaw = null,
    sheltersRaw = [],
    censusHabitations = [],
    citizenReportsRaw = [],
    sourceHealthReport = null,
    isCoordInsideAP = null
  } = {}) {
    const now = new Date().toISOString();
    const state = getDefaultEmptyState();
    state.timestamp = now;

    // 1. Weather Normalization
    if (weatherRaw && (weatherRaw.success || weatherRaw.current || weatherRaw.temperatureC !== undefined)) {
      const curr = weatherRaw.current || {};
      const summ = weatherRaw.summary || {};
      const obsTime = weatherRaw.observedAt || curr.time || null;
      const fetchTime = weatherRaw.fetchedAt || null;
      const lat = (weatherRaw.latitude !== undefined && weatherRaw.latitude !== null) ? Number(weatherRaw.latitude) : null;
      const lon = (weatherRaw.longitude !== undefined && weatherRaw.longitude !== null) ? Number(weatherRaw.longitude) : null;
      const tempC = curr.temperature_2m !== undefined && curr.temperature_2m !== null ? Number(curr.temperature_2m.toFixed(1)) : (weatherRaw.temperatureC !== undefined && weatherRaw.temperatureC !== null ? Number(Number(weatherRaw.temperatureC).toFixed(1)) : null);
      const appTempC = curr.apparent_temperature !== undefined && curr.apparent_temperature !== null ? Number(curr.apparent_temperature.toFixed(1)) : (weatherRaw.apparentTemperatureC !== undefined && weatherRaw.apparentTemperatureC !== null ? Number(Number(weatherRaw.apparentTemperatureC).toFixed(1)) : null);
      const relHum = curr.relative_humidity_2m !== undefined && curr.relative_humidity_2m !== null ? Number(curr.relative_humidity_2m) : (weatherRaw.relativeHumidity !== undefined && weatherRaw.relativeHumidity !== null ? Number(weatherRaw.relativeHumidity) : null);
      const windKmh = curr.wind_speed_10m !== undefined && curr.wind_speed_10m !== null ? Number(curr.wind_speed_10m.toFixed(1)) : (weatherRaw.windSpeedKmh !== undefined && weatherRaw.windSpeedKmh !== null ? Number(Number(weatherRaw.windSpeedKmh).toFixed(1)) : null);
      const windDir = curr.wind_direction_10m !== undefined && curr.wind_direction_10m !== null ? Number(curr.wind_direction_10m) : (weatherRaw.windDirectionDeg !== undefined && weatherRaw.windDirectionDeg !== null ? Number(weatherRaw.windDirectionDeg) : null);
      const gustKmh = summ.maxGustKmh !== undefined && summ.maxGustKmh !== null ? Number(summ.maxGustKmh.toFixed(1)) : (curr.wind_gusts_10m !== undefined && curr.wind_gusts_10m !== null ? Number(curr.wind_gusts_10m.toFixed(1)) : (weatherRaw.maxGustKmh !== undefined && weatherRaw.maxGustKmh !== null ? Number(Number(weatherRaw.maxGustKmh).toFixed(1)) : null));
      const pressHpa = curr.surface_pressure !== undefined && curr.surface_pressure !== null ? Number(curr.surface_pressure.toFixed(1)) : (weatherRaw.pressureHpa !== undefined && weatherRaw.pressureHpa !== null ? Number(Number(weatherRaw.pressureHpa).toFixed(1)) : null);
      const precipMm = curr.precipitation !== undefined && curr.precipitation !== null ? Number(curr.precipitation.toFixed(1)) : (weatherRaw.precipitationMm !== undefined && weatherRaw.precipitationMm !== null ? Number(Number(weatherRaw.precipitationMm).toFixed(1)) : null);
      const rainMm = curr.rain !== undefined && curr.rain !== null ? Number(curr.rain.toFixed(1)) : (weatherRaw.rainMm !== undefined && weatherRaw.rainMm !== null ? Number(Number(weatherRaw.rainMm).toFixed(1)) : null);
      const snowCm = curr.snowfall !== undefined && curr.snowfall !== null ? Number(curr.snowfall.toFixed(1)) : (weatherRaw.snowfallCm !== undefined && weatherRaw.snowfallCm !== null ? Number(Number(weatherRaw.snowfallCm).toFixed(1)) : null);
      const wCode = curr.weather_code !== undefined && curr.weather_code !== null ? Number(curr.weather_code) : (weatherRaw.weatherCode !== undefined && weatherRaw.weatherCode !== null ? Number(weatherRaw.weatherCode) : null);
      const wDesc = weatherRaw.weatherDescription || null;
      const wStatus = weatherRaw.status || (weatherRaw.stale ? 'DEGRADED' : 'LIVE');

      state.weather = {
        sourceId: 'openmeteo_weather',
        source: weatherRaw.source || 'Open-Meteo Weather API',
        status: wStatus,
        station: weatherRaw.station || 'Open-Meteo Surface Observation',
        latitude: lat,
        longitude: lon,
        coordinates: (lat !== null && lon !== null) ? { lat, lon } : null,
        temperatureC: tempC,
        apparentTemperatureC: appTempC,
        relativeHumidity: relHum,
        precipitationMm: precipMm,
        rainMm: rainMm,
        snowfallCm: snowCm,
        pressureHpa: pressHpa,
        windSpeedKmh: windKmh,
        windDirectionDeg: windDir,
        maxGustKmh: gustKmh,
        weatherCode: wCode,
        weatherDescription: wDesc,
        observedAt: obsTime,
        fetchedAt: fetchTime,
        forecastTime: weatherRaw.forecastTime || null,
        provenance: weatherRaw.provenance || {
          tier: 'LIVE_API',
          role: 'PRIMARY',
          contributingSources: ['openmeteo_weather']
        },
        surfaceWindKmh: normalizeMetric({
          value: windKmh,
          sourceId: 'openmeteo_weather',
          agency: 'Open-Meteo (ECMWF/GFS)',
          observedAt: obsTime,
          status: wStatus,
          unit: 'km/h',
          tier: 'LIVE_API',
          role: 'PRIMARY'
        }),
        maxGustKmhMetric: normalizeMetric({
          value: gustKmh,
          sourceId: 'openmeteo_weather',
          agency: 'Open-Meteo (ECMWF/GFS)',
          observedAt: obsTime,
          status: wStatus,
          unit: 'km/h',
          tier: 'LIVE_API',
          role: 'PRIMARY'
        }),
        corePressureHpa: normalizeMetric({
          value: pressHpa,
          sourceId: 'openmeteo_weather',
          agency: 'Open-Meteo (ECMWF/GFS)',
          observedAt: obsTime,
          status: wStatus,
          unit: 'hPa',
          tier: 'LIVE_API',
          role: 'PRIMARY'
        }),
        precipitationMmMetric: normalizeMetric({
          value: precipMm,
          sourceId: 'openmeteo_weather',
          agency: 'Open-Meteo (ECMWF/GFS)',
          observedAt: obsTime,
          status: wStatus,
          unit: 'mm',
          tier: 'LIVE_API',
          role: 'PRIMARY'
        }),
        temperatureCMetric: normalizeMetric({
          value: tempC,
          sourceId: 'openmeteo_weather',
          agency: 'Open-Meteo (ECMWF/GFS)',
          observedAt: obsTime,
          status: wStatus,
          unit: '°C',
          tier: 'LIVE_API',
          role: 'PRIMARY'
        })
      };
    }

    // 1b. Air Quality Normalization (Open-Meteo atmospheric / CPCB ground station)
    if (airQualityRaw && (airQualityRaw.success || airQualityRaw.pm2_5 !== undefined || airQualityRaw.usAqi !== undefined || airQualityRaw.us_aqi !== undefined)) {
      const aqStatus = airQualityRaw.status || (airQualityRaw.stale ? 'DEGRADED' : 'LIVE');
      const lat = (airQualityRaw.latitude !== undefined && airQualityRaw.latitude !== null) ? Number(airQualityRaw.latitude) : null;
      const lon = (airQualityRaw.longitude !== undefined && airQualityRaw.longitude !== null) ? Number(airQualityRaw.longitude) : null;
      const obsTime = airQualityRaw.observedAt || null;
      const fetchTime = airQualityRaw.fetchedAt || null;
      const pm25 = (airQualityRaw.pm2_5 !== undefined && airQualityRaw.pm2_5 !== null) ? Number(Number(airQualityRaw.pm2_5).toFixed(1)) : null;
      const pm10 = (airQualityRaw.pm10 !== undefined && airQualityRaw.pm10 !== null) ? Number(Number(airQualityRaw.pm10).toFixed(1)) : null;
      const co = (airQualityRaw.carbonMonoxide !== undefined && airQualityRaw.carbonMonoxide !== null) ? Number(Number(airQualityRaw.carbonMonoxide).toFixed(1)) : null;
      const no2 = (airQualityRaw.nitrogenDioxide !== undefined && airQualityRaw.nitrogenDioxide !== null) ? Number(Number(airQualityRaw.nitrogenDioxide).toFixed(1)) : null;
      const so2 = (airQualityRaw.sulphurDioxide !== undefined && airQualityRaw.sulphurDioxide !== null) ? Number(Number(airQualityRaw.sulphurDioxide).toFixed(1)) : null;
      const o3 = (airQualityRaw.ozone !== undefined && airQualityRaw.ozone !== null) ? Number(Number(airQualityRaw.ozone).toFixed(1)) : null;
      const eaqui = (airQualityRaw.europeanAqi !== undefined && airQualityRaw.europeanAqi !== null) ? Math.round(airQualityRaw.europeanAqi) : null;
      const usaqi = (airQualityRaw.usAqi !== undefined && airQualityRaw.usAqi !== null) ? Math.round(airQualityRaw.usAqi) : ((airQualityRaw.us_aqi !== undefined && airQualityRaw.us_aqi !== null) ? Math.round(airQualityRaw.us_aqi) : null);

      state.airQuality = {
        sourceId: airQualityRaw.sourceId || 'openmeteo_airquality',
        source: airQualityRaw.source || 'Open-Meteo Air Quality',
        status: aqStatus,
        latitude: lat,
        longitude: lon,
        coordinates: (lat !== null && lon !== null) ? { lat, lon } : null,
        observedAt: obsTime,
        fetchedAt: fetchTime,
        europeanAqi: eaqui,
        usAqi: usaqi,
        pm2_5: pm25,
        pm10: pm10,
        carbonMonoxide: co,
        nitrogenDioxide: no2,
        sulphurDioxide: so2,
        ozone: o3,
        category: airQualityRaw.category || 'Unavailable',
        color: airQualityRaw.color || '#94a3b8',
        provenance: airQualityRaw.provenance || {
          sourceId: 'openmeteo_airquality',
          agency: 'Open-Meteo',
          tier: 'LIVE_API',
          role: 'PRIMARY'
        },
        pm25Metric: normalizeMetric({
          value: pm25,
          sourceId: airQualityRaw.sourceId || 'openmeteo_airquality',
          agency: 'Open-Meteo Atmospheric Quality Feed',
          observedAt: obsTime,
          status: aqStatus,
          unit: 'µg/m³',
          tier: 'LIVE_API',
          role: 'PRIMARY'
        }),
        pm10Metric: normalizeMetric({
          value: pm10,
          sourceId: airQualityRaw.sourceId || 'openmeteo_airquality',
          agency: 'Open-Meteo Atmospheric Quality Feed',
          observedAt: obsTime,
          status: aqStatus,
          unit: 'µg/m³',
          tier: 'LIVE_API',
          role: 'PRIMARY'
        }),
        usAqiMetric: normalizeMetric({
          value: usaqi,
          sourceId: airQualityRaw.sourceId || 'openmeteo_airquality',
          agency: 'Open-Meteo Atmospheric Quality Feed',
          observedAt: obsTime,
          status: aqStatus,
          unit: 'AQI',
          tier: 'LIVE_API',
          role: 'PRIMARY'
        })
      };
    }

    // 2. Seismic Telemetry (Filtered strictly inside AP)
    if (seismicRaw && Array.isArray(seismicRaw.earthquakes)) {
      let quakes = seismicRaw.earthquakes;
      if (typeof isCoordInsideAP === 'function') {
        quakes = quakes.filter(q => isCoordInsideAP(q.lng, q.lat));
      }
      const maxMag = quakes.length > 0 ? Math.max(...quakes.map(q => q.mag || 0)) : 0;
      const latest = quakes[0] || null;

      state.seismic = {
        status: maxMag >= 5.0 ? 'ELEVATED' : (quakes.length > 0 ? 'LIVE' : 'NORMAL'),
        latestQuake: latest ? {
          id: latest.id,
          mag: latest.mag,
          place: latest.place,
          time: latest.time,
          depthKm: latest.depthKm,
          lat: latest.lat,
          lng: latest.lng
        } : null,
        countInsideAP: quakes.length,
        maxMagnitude: maxMag,
        sourceId: 'usgs_earthquakes',
        agency: seismicRaw.source || 'National Center for Seismology (NCS India)'
      };
    }

    // 3. River Gauges (CWC NWIC) + Google Flood Forecast
    const contributingSources = [];

    if (cwcRaw && (cwcRaw.success || (Array.isArray(cwcRaw.stations) && cwcRaw.stations.length > 0))) {
      contributingSources.push('cwc_nwic_river');
      const reportingStations = (cwcRaw.stations || []).map(s => {
        const wLevel = (typeof s.waterLevel === 'number' && !isNaN(s.waterLevel))
          ? s.waterLevel
          : ((typeof s.waterLevelMeters === 'number' && !isNaN(s.waterLevelMeters)) ? s.waterLevelMeters : null);
        const dLevel = (typeof s.dangerLevel === 'number' && !isNaN(s.dangerLevel))
          ? s.dangerLevel
          : ((typeof s.dangerMarkMeters === 'number' && !isNaN(s.dangerMarkMeters)) ? s.dangerMarkMeters : null);
        const wMark = (typeof s.warningLevel === 'number' && !isNaN(s.warningLevel))
          ? s.warningLevel
          : ((typeof s.warningMarkMeters === 'number' && !isNaN(s.warningMarkMeters)) ? s.warningMarkMeters : null);
        
        return {
          id: s.stationId || s.id || s.stationName || s.station,
          stationId: s.stationId || s.id || s.stationName || s.station,
          stationName: s.stationName || s.station,
          station: s.stationName || s.station,
          riverName: s.riverName || s.river || s.basin,
          river: s.riverName || s.river || s.basin,
          basin: s.basin,
          district: s.district || '',
          state: s.state || 'Andhra Pradesh',
          latitude: (typeof s.latitude === 'number') ? s.latitude : ((typeof s.lat === 'number') ? s.lat : null),
          longitude: (typeof s.longitude === 'number') ? s.longitude : ((typeof s.lon === 'number') ? s.lon : null),
          lat: (typeof s.latitude === 'number') ? s.latitude : ((typeof s.lat === 'number') ? s.lat : null),
          lon: (typeof s.longitude === 'number') ? s.longitude : ((typeof s.lon === 'number') ? s.lon : null),
          waterLevel: wLevel,
          waterLevelMeters: wLevel,
          waterLevelUnit: s.waterLevelUnit || 'm',
          dangerLevel: dLevel,
          dangerLevelUnit: s.dangerLevelUnit || 'm',
          warningLevel: wMark,
          warningLevelUnit: s.warningLevelUnit || 'm',
          stationStatus: wLevel !== null ? 'LIVE' : 'UNAVAILABLE',
          floodCondition: s.floodCondition || 'UNKNOWN',
          trend: s.trend || 'UNKNOWN',
          discharge: (typeof s.discharge === 'number') ? s.discharge : null,
          dischargeUnit: s.dischargeUnit || 'cusecs',
          observedAt: s.observedAt || s.timestamp || null,
          timestamp: s.observedAt || s.timestamp || null,
          fetchedAt: s.fetchedAt || cwcRaw.fetchedAt || null,
          agency: s.agency || 'CWC',
          sourceId: 'cwc_nwic_river',
          provenance: s.provenance || 'cwc_nwic_live',
          stale: !!s.stale || !!cwcRaw.stale
        };
      });

      const validReporting = reportingStations.filter(s => s.waterLevel !== null);
      const isDegraded = cwcRaw.status === 'DEGRADED' || (cwcRaw.stale === true);
      const hasReporting = validReporting.length > 0;

      // Peak station for summary representation
      const peakStation = validReporting.length > 0
        ? validReporting.reduce((max, s) => ((s.waterLevel > (max.waterLevel || 0)) ? s : max), validReporting[0])
        : (reportingStations[0] || {});

      state.riverLevels = {
        status: isDegraded ? 'DEGRADED' : (hasReporting ? 'LIVE' : 'UNAVAILABLE'),
        sourceId: 'cwc_nwic_river',
        source: cwcRaw.source || 'National Water Data Portal (NWIC / Central Water Commission)',
        stationId: peakStation.stationId || null,
        stationName: peakStation.stationName || null,
        riverName: peakStation.riverName || null,
        latitude: peakStation.latitude || null,
        longitude: peakStation.longitude || null,
        observedAt: peakStation.observedAt || null,
        fetchedAt: cwcRaw.fetchedAt || now,
        waterLevel: peakStation.waterLevel !== undefined ? peakStation.waterLevel : null,
        waterLevelUnit: 'm',
        dangerLevel: peakStation.dangerLevel !== undefined ? peakStation.dangerLevel : null,
        dangerLevelUnit: 'm',
        warningLevel: peakStation.warningLevel !== undefined ? peakStation.warningLevel : null,
        warningLevelUnit: 'm',
        stationStatus: peakStation.stationStatus || (hasReporting ? 'LIVE' : 'UNAVAILABLE'),
        floodCondition: peakStation.floodCondition || 'UNKNOWN',
        trend: peakStation.trend || 'UNKNOWN',
        discharge: peakStation.discharge !== undefined ? peakStation.discharge : null,
        dischargeUnit: 'cusecs',
        provenance: 'cwc_nwic_live',
        stale: isDegraded,
        stations: reportingStations
      };
    }

    // Google Flood Forecast Integration (Optional Secondary)
    if (googleFloodRaw && googleFloodRaw.success && Array.isArray(googleFloodRaw.gauges) && googleFloodRaw.gauges.length > 0) {
      contributingSources.push('google_flood_forecast');
      state.googleFlood = {
        status: googleFloodRaw.status || 'LIVE',
        sourceId: 'google_flood_forecast',
        agency: 'Google Flood Hub',
        role: 'FORECAST',
        gauges: googleFloodRaw.gauges,
        count: googleFloodRaw.gauges.length,
        fetchedAt: googleFloodRaw.fetchedAt || now,
        provenance: 'google_flood_forecast_live'
      };
    }

    // Derived Flood Condition
    state.riverLevels.derivedCondition = {
      sourceId: 'derived_flood_condition',
      status: contributingSources.length > 0 ? 'DERIVED' : 'UNAVAILABLE',
      contributingSources: contributingSources,
      condition: state.riverLevels.floodCondition || 'UNKNOWN'
    };

    // 4. Official Operational Alerts: IMD CAP + GDACS (Filtered strictly inside AP)
    const alertMap = new Map();
    const nowMs = Date.now();

    function hashStr(s) {
      let h = 0;
      for (let i = 0; i < s.length; i++) {
        h = ((h << 5) - h) + s.charCodeAt(i);
        h |= 0;
      }
      return Math.abs(h);
    }

    function haversineDistKm(lat1, lon1, lat2, lon2) {
      if (lat1 === null || lon1 === null || lat2 === null || lon2 === null) return null;
      if (isNaN(lat1) || isNaN(lon1) || isNaN(lat2) || isNaN(lon2)) return null;
      const R = 6371;
      const dLat = (lat2 - lat1) * Math.PI / 180;
      const dLon = (lon2 - lon1) * Math.PI / 180;
      const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                Math.sin(dLon / 2) * Math.sin(dLon / 2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      return R * c;
    }

    function pointInPolygonLocal(pt, polyCoords) {
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

    function normalizeLiveAlert(alt, defaultSource = 'cap_imd') {
      if (!alt) return null;

      const sourceId = alt.sourceId || alt.source || defaultSource;
      const isArchived = (sourceId === 'cap_ndma' || alt.operationalState === 'ARCHIVED' || alt.tier === 'ARCHIVED');
      const isDrill = !!(alt.isDrill || alt.isSimulated || alt.role === 'DRILL' || alt.tier === 'SIMULATED' ||
                         (alt.title && String(alt.title).toLowerCase().includes('[drill]')));

      // 1. ACTIVE ALERT LOGIC: Exclude expired records from active
      let isExpired = false;
      const expStr = alt.expiresAt || alt.expires;
      if (expStr) {
        const expTime = new Date(expStr).getTime();
        if (!isNaN(expTime) && expTime < nowMs) isExpired = true;
      } else {
        const issuedStr = alt.issuedAt || alt.sent || alt.effectiveAt || alt.effective || alt.pubDate;
        if (issuedStr) {
          const issuedTime = new Date(issuedStr).getTime();
          if (!isNaN(issuedTime) && (nowMs - issuedTime) > (30 * 24 * 60 * 60 * 1000)) isExpired = true;
        }
      }

      let operationalState = 'ACTIVE';
      if (isDrill) operationalState = 'DRILL';
      else if (isArchived) operationalState = 'ARCHIVED';
      else if (isExpired) operationalState = 'EXPIRED';

      const tier = isDrill ? 'SIMULATED' : (isArchived ? 'ARCHIVED' : (alt.tier || 'LIVE_API'));
      const role = isDrill ? 'DRILL' : (isArchived ? 'REFERENCE' : (alt.role || 'PRIMARY'));

      // 2. GEOMETRY & COORDINATES
      let lat = (typeof alt.lat === 'number' && !isNaN(alt.lat)) ? alt.lat : (typeof alt.latitude === 'number' && !isNaN(alt.latitude) ? alt.latitude : null);
      let lng = (typeof alt.lng === 'number' && !isNaN(alt.lng)) ? alt.lng : (typeof alt.longitude === 'number' && !isNaN(alt.longitude) ? alt.longitude : null);
      const polygon = Array.isArray(alt.polygon) ? alt.polygon : null;
      const circle = alt.circle || null;
      let geometry = alt.geometry || null;

      if (circle && typeof circle.lat === 'number' && typeof circle.lon === 'number') {
        if (lat === null) lat = circle.lat;
        if (lng === null) lng = circle.lon;
        if (!geometry) geometry = { type: 'Point', coordinates: [circle.lon, circle.lat] };
      } else if (polygon && polygon.length > 0) {
        if (lat === null || lng === null) {
          const sumLat = polygon.reduce((s, p) => s + (p.lat ?? p[1]), 0);
          const sumLon = polygon.reduce((s, p) => s + (p.lon ?? p[0]), 0);
          lat = Number((sumLat / polygon.length).toFixed(4));
          lng = Number((sumLon / polygon.length).toFixed(4));
        }
        if (!geometry) {
          geometry = { type: 'Polygon', coordinates: [polygon.map(p => [(p.lon ?? p[0]), (p.lat ?? p[1])])] };
        }
      }

      // 3. FAIL-CLOSED GEOGRAPHIC FILTERING
      const hasCoords = lat !== null && lng !== null;
      if (typeof isCoordInsideAP === 'function') {
        if (hasCoords) {
          if (!isCoordInsideAP(lng, lat)) return null; // Explicit coordinates outside AP -> Reject
        } else if (polygon) {
          if (!polygon.some(p => isCoordInsideAP(p.lon ?? p[0], p.lat ?? p[1]))) return null;
        } else if (alt.geoMatch === 'TEXT' || alt.isInsideAP === true) {
          // Text-matched advisory with no coordinates (secondary metadata only)
        } else {
          return null;
        }
      }

      const rawId = alt.id || alt.alertId || alt.capIdentifier || ('ALT_' + hashStr(alt.title || ''));
      const eventName = alt.event || alt.eventType || alt.hazardType || alt.hazard_type || 'Weather Alert';
      const issuedStr = alt.issuedAt || alt.sent || alt.effectiveAt || alt.effective || alt.pubDate;

      return {
        id: String(rawId),
        alertId: String(rawId),
        source: sourceId,
        sourceId: sourceId,
        sourceAlertId: String(alt.sourceAlertId || rawId),
        agency: alt.agency || (sourceId === 'cap_imd' ? 'India Meteorological Department (IMD)' : (sourceId === 'gdacs_events' ? 'GDACS (UN / EC)' : (sourceId === 'cap_ndma' ? 'National Disaster Management Authority (NDMA)' : 'Official Alert Feed'))),
        title: alt.title || 'Official Hazard Alert',
        event: eventName,
        eventType: eventName,
        hazardType: eventName,
        hazard_type: eventName,
        severity: alt.severity || 'UNKNOWN',
        sourceSeverity: alt.sourceSeverity || alt.severity || 'UNKNOWN',
        normalizedSeverity: alt.normalizedSeverity || alt.severity || 'UNKNOWN',
        urgency: alt.urgency || 'UNKNOWN',
        certainty: alt.certainty || 'UNKNOWN',
        status: operationalState === 'ACTIVE' ? 'LIVE' : operationalState,
        operationalState,
        tier,
        role,
        isDrill,
        isSimulated: isDrill,
        issuedAt: issuedStr || null,
        effectiveAt: alt.effectiveAt || alt.effective || issuedStr || null,
        expiresAt: expStr || null,
        observedAt: alt.observedAt || issuedStr || null,
        fetchedAt: alt.fetchedAt || now,
        checkedAt: alt.checkedAt || now,
        effective: alt.effectiveAt || alt.effective || issuedStr || null,
        expires: expStr || null,
        sent: issuedStr || null,
        lat: lat,
        latitude: lat,
        lng: lng,
        longitude: lng,
        geometry: geometry,
        geometryStatus: geometry ? 'AVAILABLE' : 'UNAVAILABLE',
        area: alt.area || alt.areaDesc || 'Andhra Pradesh Sector',
        areaDesc: alt.areaDesc || alt.area || 'Andhra Pradesh Sector',
        geoMatch: alt.geoMatch || (hasCoords ? 'COORDINATES' : 'TEXT'),
        description: (alt.description || '').replace(/<[^>]+>/g, '').substring(0, 600).trim(),
        instruction: alt.instruction ? alt.instruction.replace(/<[^>]+>/g, '').substring(0, 600).trim() : null,
        sourceUrl: alt.sourceUrl || alt.link || null,
        sourceTimestamp: issuedStr || null,
        isInsideAP: true,
        polygon: polygon,
        circle: circle,
        link: alt.link || alt.sourceUrl || null,
        expirationStatus: expStr ? 'AUTHENTIC_EXPIRY' : 'UNKNOWN_EXPIRY',
        requiresTemporalValidation: !expStr,
        provenance: alt.provenance || {
          sourceId: sourceId,
          sourceTier: tier,
          sourceRole: role,
          agency: alt.agency || sourceId,
          url: alt.sourceUrl || alt.link || null,
          originalSourceTimestamp: issuedStr || null,
          fetchedAt: now,
          contributingSources: [sourceId]
        }
      };
    }

    // Ingest CAP Alerts (IMD + NDMA if provided)
    const allNormalizedAlerts = [];
    if (Array.isArray(capAlerts)) {
      for (const alt of capAlerts) {
        const norm = normalizeLiveAlert(alt, alt.sourceId || 'cap_imd');
        if (norm) {
          const key = `${norm.sourceId}_${norm.id}`;
          if (!alertMap.has(key)) {
            alertMap.set(key, norm);
            allNormalizedAlerts.push(norm);
          }
        }
      }
    }

    // Ingest GDACS Events (Only genuinely AP events)
    const gdacsList = Array.isArray(gdacsRaw) ? gdacsRaw : (gdacsRaw && Array.isArray(gdacsRaw.apEvents) ? gdacsRaw.apEvents : []);
    for (const evt of gdacsList) {
      const norm = normalizeLiveAlert(evt, 'gdacs_events');
      if (norm) {
        const key = `${norm.sourceId}_${norm.id}`;
        if (!alertMap.has(key)) {
          alertMap.set(key, norm);
          allNormalizedAlerts.push(norm);
        }
      }
    }

    // Partition into canonical lifecycle states
    const activeAlerts = allNormalizedAlerts.filter(a => a.operationalState === 'ACTIVE' && a.sourceId !== 'cap_ndma' && !a.isDrill);
    const expiredAlerts = allNormalizedAlerts.filter(a => a.operationalState === 'EXPIRED');
    const archivedAlerts = allNormalizedAlerts.filter(a => a.operationalState === 'ARCHIVED' || a.sourceId === 'cap_ndma');
    const drillAlerts = allNormalizedAlerts.filter(a => a.operationalState === 'DRILL' || a.isDrill);

    const validAlerts = activeAlerts.sort((a, b) => {
      return new Date(b.effectiveAt || b.issuedAt || 0).getTime() - new Date(a.effectiveAt || a.issuedAt || 0).getTime();
    });

    state.alerts = validAlerts;
    state.expiredAlerts = expiredAlerts;
    state.archivedAlerts = archivedAlerts;
    state.drillAlerts = drillAlerts;

    // Derived summary KPIs
    state.summary.activeAlerts = validAlerts.length;
    state.summary.officialAlerts = validAlerts.filter(a => a.tier === 'LIVE_API').length;
    state.summary.expiredAlerts = expiredAlerts.length;
    state.summary.archivedAlerts = archivedAlerts.length;
    state.summary.drillAlerts = drillAlerts.length;

    // 5. Active Hazards & Dynamic Risk Zones (Derived honestly from alerts with verified coordinates)
    const activeHazards = [];
    validAlerts.forEach((alt, idx) => {
      const lat = typeof alt.lat === 'number' && !isNaN(alt.lat) ? alt.lat : null;
      const lng = typeof alt.lng === 'number' && !isNaN(alt.lng) ? alt.lng : null;

      activeHazards.push({
        id: `HAZ_LIVE_${idx + 1}`,
        type: alt.hazardType,
        name: alt.title,
        severity: (alt.severity || 'UNKNOWN').toUpperCase(),
        state: 'Andhra Pradesh',
        lat: lat,
        lng: lng,
        radius: alt.circle ? (alt.circle.radiusKm * 1000) : null, // PURGED: No fake fallback radius
        confidence: alt.certainty === 'Observed' ? 95 : (alt.certainty === 'Likely' ? 80 : 65),
        eta: alt.urgency === 'Immediate' ? 'Immediate' : 'Expected',
        desc: alt.description,
        sourceId: alt.sourceId,
        agency: alt.agency,
        polygon: alt.polygon || null,
        geometry: alt.geometry || null,
        tier: 'DERIVED',
        status: 'LIVE'
      });
    });

    state.hazards = activeHazards;

    // Multi-Hazard Spatiotemporal Correlation (Strict Correlation != Causation)
    let multiHazardList = [];
    try {
      let mhFn = null;
      if (typeof require === 'function') {
        try { mhFn = require('../sources/multi-hazard.js').correlateMultiHazards; } catch (e) {}
      }
      if (typeof mhFn === 'function') {
        multiHazardList = mhFn(validAlerts, { nowMs });
      }
    } catch (mhErr) {
      console.warn('[LiveState] Multi-hazard correlator error:', mhErr.message);
    }
    state.correlatedHazards = multiHazardList;
    state.summary.correlatedHazardsCount = multiHazardList.length;

    // 6. Shelters & Carrying Capacity
    if (Array.isArray(sheltersRaw)) {
      let filteredShelters = sheltersRaw;
      if (typeof isCoordInsideAP === 'function') {
        filteredShelters = filteredShelters.filter(s => {
          if (s.lat === null || s.lat === undefined || s.lng === null || s.lng === undefined) return false;
          const lat = Number(s.lat);
          const lng = Number(s.lng);
          if (isNaN(lat) || isNaN(lng)) return false;
          return isCoordInsideAP(lng, lat);
        });
      }

      state.shelters = filteredShelters.map(s => {
        // Reference capacity: must be a positive number, else null
        const rawCap = s.capacity ?? s.max_capacity ?? s.referenceCapacity;
        const hasCap = rawCap !== null && rawCap !== undefined && !isNaN(Number(rawCap)) && Number(rawCap) > 0;
        const capacity = hasCap ? Number(rawCap) : null;

        // Strict truth: if current_occupancy is not a valid non-negative number, keep null with UNKNOWN status
        const rawOcc = s.currentOccupancy ?? s.current_occupancy ?? s.occupancy;
        const hasOccupancy = typeof rawOcc === 'number' && !isNaN(rawOcc) && rawOcc >= 0;
        const occupancy = hasOccupancy ? rawOcc : null;

        // Occupancy status: LIVE, STALE, UNKNOWN
        let occupancyStatus = 'UNKNOWN';
        if (hasOccupancy) {
          const observedAt = s.last_updated || s.occupancyObservedAt || s.observedAt || null;
          if (s.occupancyStatus === 'STALE' || (observedAt && (Date.now() - new Date(observedAt).getTime() > 24 * 3600 * 1000))) {
            occupancyStatus = 'STALE';
          } else {
            occupancyStatus = s.occupancyStatus || 'LIVE';
          }
        }

        // Operational status: do NOT default to 'open'; UNKNOWN when unsupported
        const rawStatus = (s.status || s.operationalStatus || '').toLowerCase();
        const operationalStatus = ['open', 'full', 'closed'].includes(rawStatus) ? rawStatus : 'UNKNOWN';

        // Availability: separate reference directory existence from live operational availability
        let availability = 'UNKNOWN';
        if (operationalStatus === 'closed') {
          availability = 'CLOSED';
        } else if (operationalStatus === 'full' || (hasCap && hasOccupancy && occupancy >= capacity)) {
          availability = 'FULL';
        } else if (operationalStatus === 'open' && hasCap && hasOccupancy) {
          availability = (capacity - occupancy > 0) ? 'AVAILABLE' : 'FULL';
        } else if (operationalStatus === 'open') {
          availability = 'OPEN_UNCONFIRMED_CAPACITY';
        }

        // Available capacity: null if either capacity or occupancy is unknown
        const availableCapacity = (hasCap && hasOccupancy) ? Math.max(0, capacity - occupancy) : null;

        // Utilization: currentOccupancy / referenceCapacity * 100 strictly when both exist
        const utilization = (hasCap && hasOccupancy && capacity > 0) ? Math.round((occupancy / capacity) * 100) : null;

        return {
          id: s.id || s.shelter_id || s.shelterId,
          shelterId: s.shelter_id || s.id || s.shelterId,
          name: s.name || s.shelter_name,
          district: s.district || 'Andhra Pradesh',
          lat: Number(s.lat),
          lng: Number(s.lng),
          latitude: Number(s.lat),
          longitude: Number(s.lng),
          referenceCapacity: capacity,
          capacity,
          currentOccupancy: occupancy,
          occupancyStatus,
          occupancyObservedAt: hasOccupancy ? (s.last_updated || s.occupancyObservedAt || s.observedAt || null) : null,
          availability,
          availableCapacity,
          operationalStatus,
          status: operationalStatus,
          utilization,
          utilizationPct: utilization,
          sourceId: 'ap_sdma_shelters',
          agency: 'Andhra Pradesh SDMA',
          tier: 'OFFICIAL_BASELINE',
          reference: true,
          provenance: s.updated_by || 'AP SDMA Reference Baseline',
          lastUpdated: s.last_updated || null
        };
      });

      const totalCap = state.shelters.reduce((acc, s) => acc + (s.referenceCapacity || 0), 0);
      const reportingShelters = state.shelters.filter(s => s.currentOccupancy !== null);
      const totalOcc = reportingShelters.length > 0 ? reportingShelters.reduce((acc, s) => acc + s.currentOccupancy, 0) : null;

      state.summary.totalShelterCapacity = totalCap;
      state.summary.totalShelterOccupancy = totalOcc;
      state.summary.sheltersReportingCount = reportingShelters.length;
      state.summary.shelterOccupancyStatus = reportingShelters.length === state.shelters.length ? 'LIVE' : (reportingShelters.length > 0 ? 'PARTIAL' : 'UNKNOWN');
    }

    // 7. Habitations & Baseline Demographic Exposure
    if (Array.isArray(censusHabitations)) {
      state.habitations = censusHabitations.map(v => ({
        id: v.village_id || v.id,
        name: v.village_name || v.name,
        mandal: v.mandal || '',
        district: v.district || '',
        lat: v.lat,
        lng: v.lng,
        population: Number(v.growth_adjusted_pop || v.census_2011_pop || v.pop || 0),
        elevation_m: v.elevation_m || 0,
        hazardType: v.hazard_type || 'cyclone',
        travelTimeMins: v.travelTimeMins || null,
        tier: 'OFFICIAL_BASELINE',
        sourceId: 'census_india_ap',
        agency: 'Census of India (MoHA)'
      }));

      // Compute active population exposure based STRICTLY on genuine active hazard geometry
      let exposedPop = 0;
      const hazardsWithGeom = state.hazards.filter(h => (h.radius !== null && h.radius > 0) || h.polygon !== null);
      if (hazardsWithGeom.length > 0) {
        state.habitations.forEach(v => {
          const isExposed = hazardsWithGeom.some(h => {
            if (h.radius !== null && h.lat !== null && h.lng !== null) {
              const dKm = haversineDistKm(v.lat, v.lng, h.lat, h.lng);
              return dKm !== null && (dKm * 1000) <= h.radius;
            }
            if (h.polygon && Array.isArray(h.polygon)) {
              const polyCoords = h.polygon.map(p => [(p.lon ?? p[0]), (p.lat ?? p[1])]);
              return pointInPolygonLocal([v.lng, v.lat], polyCoords);
            }
            return false;
          });
          if (isExposed) {
            exposedPop += v.population;
          }
        });
      }

      state.summary.populationAtRisk = normalizeMetric({
        value: exposedPop,
        sourceId: 'census_india_ap',
        agency: 'Census of India 2011 Reference Baseline & Active Hazard Geometry',
        tier: 'DERIVED',
        role: 'PRIMARY',
        status: exposedPop > 0 ? 'LIVE' : 'BASELINE',
        unit: 'citizens',
        contributingSources: ['cap_imd', 'census_india_ap']
      });
    }

    // 8. Satellite & Fire Telemetry (NASA FIRMS VIIRS & Copernicus)
    let apHotspots = [];
    let peakFrp = null;
    if (firmsRaw) {
      const rawObs = Array.isArray(firmsRaw.observations) ? firmsRaw.observations : (Array.isArray(firmsRaw.hotspots) ? firmsRaw.hotspots : []);
      apHotspots = rawObs;
      if (typeof isCoordInsideAP === 'function') {
        apHotspots = apHotspots.filter(h => {
          const lon = h.longitude !== undefined ? h.longitude : h.lon;
          const lat = h.latitude !== undefined ? h.latitude : h.lat;
          return (lon !== null && lat !== null && typeof lon === 'number' && typeof lat === 'number') ? isCoordInsideAP(lon, lat) : false;
        });
      }

      const validFrps = apHotspots.map(h => typeof h.frp === 'number' ? h.frp : null).filter(f => f !== null);
      peakFrp = validFrps.length > 0 ? Math.max(...validFrps) : null;

      const fStatus = firmsRaw.status || (apHotspots.length > 0 ? 'LIVE' : (firmsRaw.status === 'NOT_CONFIGURED' ? 'NOT_CONFIGURED' : 'UNAVAILABLE'));

      state.fire = {
        sourceId: firmsRaw.sourceId || 'nasa_firms_viirs',
        source: firmsRaw.source || 'NASA FIRMS VIIRS (Active Fire / Thermal Anomaly)',
        status: fStatus,
        observations: apHotspots,
        observationCount: apHotspots.length,
        latestObservedAt: firmsRaw.latestObservedAt || (apHotspots.length > 0 ? apHotspots[0].observedAt : null),
        fetchedAt: firmsRaw.fetchedAt || null,
        peakFrpMw: peakFrp !== null ? Math.round(peakFrp * 10) / 10 : null,
        stale: !!firmsRaw.stale,
        provenance: firmsRaw.provenance || 'nasa_firms_live'
      };

    }

    // 8b. Copernicus Data Space Ecosystem (Sentinel-1 SAR GRD Latest Observation)
    const satObs = (sentinelRaw && sentinelRaw.latestObservation) ? sentinelRaw.latestObservation : (sentinelRaw || null);
    const hasConfig = !!(process.env.COPERNICUS_CLIENT_ID && process.env.COPERNICUS_CLIENT_SECRET) || !!(process.env.COPERNICUS_USERNAME && process.env.COPERNICUS_PASSWORD);
    let satStatus = 'NOT_CONFIGURED';
    if (satObs) {
      satStatus = satObs.status || (satObs.stale ? 'DEGRADED' : 'LIVE');
    } else if (apHotspots && apHotspots.length > 0) {
      satStatus = 'LIVE';
    } else if (hasConfig) {
      satStatus = 'UNAVAILABLE';
    } else {
      satStatus = 'NOT_CONFIGURED';
    }

    const satProcessing = (sentinelRaw && sentinelRaw.processing) ? sentinelRaw.processing : {
      status: (satObs && satObs.status === 'LIVE' && hasConfig) ? 'PROCESSING_UNAVAILABLE' : (hasConfig ? 'UNAVAILABLE' : 'NOT_CONFIGURED'),
      sourceId: 'copernicus_dataspace',
      sourceSceneId: (satObs && satObs.sceneId) ? satObs.sceneId : null,
      observationType: 'LATEST_SATELLITE_OBSERVATION',
      indicatorType: 'SENTINEL1_GRD_DERIVED_INDICATORS',
      derivedAt: null,
      processedAt: null,
      contributingSources: ['copernicus_dataspace'],
      indicators: null,
      reason: hasConfig ? 'Authenticated Sentinel-1 GRD raster product not downloaded' : 'COPERNICUS_CLIENT_ID or COPERNICUS_CLIENT_SECRET unset in .env'
    };

    state.satellite = {
      status: satStatus,
      sourceId: 'copernicus_dataspace',
      source: (satObs && satObs.source) ? satObs.source : 'Copernicus Data Space Ecosystem (Sentinel-1 SAR GRD)',
      observationType: 'LATEST_SATELLITE_OBSERVATION',
      satellite: 'Sentinel-1',
      productType: (satObs && satObs.productType) ? satObs.productType : 'GRD',
      sceneId: (satObs && satObs.sceneId) ? satObs.sceneId : null,
      title: (satObs && satObs.title) ? satObs.title : null,
      acquisitionStart: (satObs && satObs.acquisitionStart) ? satObs.acquisitionStart : null,
      acquisitionEnd: (satObs && satObs.acquisitionEnd) ? satObs.acquisitionEnd : null,
      discoveredAt: (satObs && (satObs.discoveredAt || satObs.fetchedAt)) ? (satObs.discoveredAt || satObs.fetchedAt) : null,
      platform: (satObs && satObs.platform) ? satObs.platform : null,
      instrument: (satObs && satObs.instrument) ? satObs.instrument : 'C-SAR',
      orbitDirection: (satObs && satObs.orbitDirection) ? satObs.orbitDirection : null,
      relativeOrbit: (satObs && satObs.relativeOrbit !== undefined) ? satObs.relativeOrbit : null,
      polarization: (satObs && satObs.polarization) ? satObs.polarization : null,
      mode: (satObs && satObs.mode) ? satObs.mode : null,
      footprint: (satObs && satObs.footprint) ? satObs.footprint : null,
      sourceUrl: (satObs && satObs.sourceUrl) ? satObs.sourceUrl : null,
      provenance: (satObs && satObs.provenance) ? satObs.provenance : 'copernicus_dataspace_live',
      stale: !!(satObs && satObs.stale),
      historical: false,
      scenes: (satObs && Array.isArray(satObs.scenes)) ? satObs.scenes : [],
      sceneList: (satObs && Array.isArray(satObs.sceneList)) ? satObs.sceneList : [],
      nasaFirmsHotspots: (state.fire && Array.isArray(state.fire.observations)) ? state.fire.observations.slice(0, 50) : [],
      hotspotsInsideAPCount: (state.fire && state.fire.observationCount !== undefined) ? state.fire.observationCount : 0,
      peakFrpMw: (state.fire && state.fire.peakFrpMw !== undefined && state.fire.peakFrpMw !== null) ? state.fire.peakFrpMw : 0,
      sentinelFloodStatus: satStatus,
      briefingStatements: (satObs && satObs.briefingStatements && satObs.briefingStatements.length > 0)
        ? satObs.briefingStatements
        : ((sentinelRaw && sentinelRaw.briefingStatements) ? sentinelRaw.briefingStatements : ((firmsRaw && firmsRaw.briefingStatements) ? firmsRaw.briefingStatements : [])),
      processing: satProcessing
    };

    // 9. Citizen Reports (Full Lifecycle Partitioning)
    if (Array.isArray(citizenReportsRaw)) {
      const processedReports = citizenReportsRaw.map(rawRep => {
        const r = { ...rawRep };
        const lat = r.lat ?? r.latitude;
        const lng = r.lng ?? r.lon ?? r.longitude;
        const hasCoords = (lat !== null && lat !== undefined && lng !== null && lng !== undefined && !isNaN(Number(lat)) && !isNaN(Number(lng)));

        if (hasCoords && typeof isCoordInsideAP === 'function') {
          const inside = isCoordInsideAP(Number(lng), Number(lat));
          if (!inside) {
            r.status = 'Rejected';
            r.lifecycleStatus = 'REJECTED';
            r.verificationStatus = 'REJECTED';
            r.rejectionReason = r.rejectionReason || 'Out of State — Coordinate outside Andhra Pradesh operational boundary';
          }
        }
        return r;
      });

      const drillReports = processedReports.filter(r => r.isDrill || r.isSimulated || r.tier === 'SIMULATED' || r.role === 'DRILL');
      const operationalReports = processedReports.filter(r => !r.isDrill && !r.isSimulated && r.tier !== 'SIMULATED' && r.role !== 'DRILL');

      const verified = operationalReports.filter(r => r.status === 'Verified' || r.lifecycleStatus === 'VERIFIED');
      const rejected = operationalReports.filter(r => r.status === 'Rejected' || r.status === 'Dismissed' || r.lifecycleStatus === 'REJECTED');
      const resolved = operationalReports.filter(r => r.status === 'Resolved' || r.lifecycleStatus === 'RESOLVED');
      const pendingQueue = operationalReports.filter(r => 
        (r.status === 'Pending' || r.status === 'Submitted' || r.status === 'Reviewing' || r.status === 'HIGH_PRIORITY_URGENT' || r.status === 'Escalated' || r.status === 'PENDING_TRIAGE' || r.lifecycleStatus === 'PENDING' || r.lifecycleStatus === 'SUBMITTED' || r.lifecycleStatus === 'ESCALATED') &&
        r.status !== 'Verified' && r.status !== 'Rejected' && r.status !== 'Dismissed' && r.status !== 'Resolved'
      );

      state.citizenReports = {
        verified,
        pendingQueue,
        rejected,
        resolved,
        drill: drillReports,
        totalReported: operationalReports.length,
        pendingCount: pendingQueue.length,
        verifiedCount: verified.length,
        rejectedCount: rejected.length,
        resolvedCount: resolved.length
      };

      state.summary.verifiedReportsCount = verified.length;
      state.summary.pendingReportsCount = pendingQueue.length;
    }

    // 10. Source Health Integration
    if (sourceHealthReport) {
      state.sourceHealth = sourceHealthReport;
      state.summary.liveSourceCount = sourceHealthReport.summary ? sourceHealthReport.summary.live : 0;
    }

    // Update Summary Counts
    state.summary.activeHazardsCount = state.hazards.length;
    state.summary.status = 'READY';

    currentState = state;
    return state;
  }

  // --- Browser Client Store ---
  function getState() {
    if (!currentState) {
      currentState = getDefaultEmptyState();
    }
    return currentState;
  }

  function setState(newState) {
    currentState = newState;
    subscribers.forEach(cb => {
      try { cb(currentState); } catch (e) { console.error('[LiveState] Subscriber error:', e); }
    });
  }

  function subscribe(callback) {
    if (typeof callback === 'function') {
      subscribers.add(callback);
      if (currentState) {
        try { callback(currentState); } catch (e) { }
      }
      return () => subscribers.delete(callback);
    }
    return () => {};
  }

  async function fetchLiveState() {
    if (typeof fetch === 'function') {
      try {
        const res = await fetch('/api/canonical-state');
        if (res.ok) {
          const json = await res.json();
          if (json && json.timestamp) {
            setState(json);
            return json;
          }
        }
      } catch (err) {
        console.warn('[LiveState] Client fetch failed, retaining cached state:', err.message);
      }
    }
    return getState();
  }

  return {
    normalizeMetric,
    buildCanonicalState,
    get: getState,
    set: setState,
    fetch: fetchLiveState,
    subscribe,
    getDefaultEmptyState
  };
}));
