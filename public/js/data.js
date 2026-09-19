// ================================================================
// DATA.JS — Andhra Pradesh Disaster Management Command System Data
// ================================================================
// Architecture: Strict 4-Tier Separation
// 1. REFERENCE: Static authoritative civil infrastructure & geography
// 2. HISTORICAL: Regional disaster events archive & impact history
// 3. DEMO/DRILL: Isolated simulation scenarios (gated strictly for drills)
// 4. LIVE: Dynamic operational state (empty initial state; strictly live telemetry)
//
// Prime Directive: Empty live result = empty live result. Never fall back to seeded records.

// ================================================================
// TIER 1: REFERENCE DATASETS (Authoritative Civil Registers)
// ================================================================
const REFERENCE_DATA = {
  tier: 'REFERENCE',

  // ---- Map Configuration (Authoritative Andhra Pradesh Geographic Frame) ----
  mapConfig: {
    center: [15.9129, 79.7400],
    zoom: 7,
    minZoom: 5,
    maxZoom: 18,
    tier: 'REFERENCE',
    sourceId: 'ap_boundary_polygon'
  },

  // ---- Registered Evacuation Shelter Directory (AP SDMA) ----
  // Fixed infrastructure definitions. Current occupancy is null until confirmed by live telemetry.
  safeSites: [
    { id: 'SS001', name: 'Kakinada Port Relief Camp',          lat: 16.9891, lng: 82.2475, capacity: 5000, current: null, type: 'Relief Camp',       amenities: ['Food','Water','Medical','Power'], district: 'Kakinada',      tier: 'REFERENCE', sourceId: 'ap_sdma_shelters' },
    { id: 'SS002', name: 'Visakhapatnam Port Shelter',         lat: 17.6868, lng: 83.2185, capacity: 4500, current: null, type: 'Cyclone Shelter',   amenities: ['Food','Water','Power','Helipad'], district: 'Visakhapatnam', tier: 'REFERENCE', sourceId: 'ap_sdma_shelters' },
    { id: 'SS003', name: 'Rajahmundry Flood Relief Center',     lat: 17.0005, lng: 81.8040, capacity: 6000, current: null, type: 'Flood Relief Hub',  amenities: ['Food','Water','Medical','Power'], district: 'East Godavari', tier: 'REFERENCE', sourceId: 'ap_sdma_shelters' },
    { id: 'SS004', name: 'Vijayawada Indoor Stadium Shelter',   lat: 16.5062, lng: 80.6480, capacity: 8000, current: null, type: 'Evacuation Hub',   amenities: ['Food','Water','Medical','Power'], district: 'NTR',           tier: 'REFERENCE', sourceId: 'ap_sdma_shelters' },
    { id: 'SS005', name: 'Machilipatnam Cyclone Shelter',       lat: 16.1875, lng: 81.1389, capacity: 3500, current: null, type: 'Cyclone Shelter',   amenities: ['Food','Water','Power'],           district: 'Krishna',       tier: 'REFERENCE', sourceId: 'ap_sdma_shelters' },
    { id: 'SS006', name: 'Ongole RIMS Evacuation Hub',          lat: 15.5057, lng: 80.0499, capacity: 3000, current: null, type: 'Medical Shelter',   amenities: ['Food','Water','Medical'],         district: 'Prakasam',      tier: 'REFERENCE', sourceId: 'ap_sdma_shelters' },
    { id: 'SS007', name: 'Tirupati TTD Community Hall Shelter', lat: 13.6288, lng: 79.4192, capacity: 4000, current: null, type: 'Staging Shelter',   amenities: ['Food','Water','Power'],           district: 'Tirupati',      tier: 'REFERENCE', sourceId: 'ap_sdma_shelters' }
  ],

  // ---- Coastal Habitations Demographic Baseline (Census 2011) ----
  // Fixed demographic reference. Risk and hazard exposure are computed dynamically by Priority Engine.
  habitations: [
    { id: 'HAB001', name: 'Tallarevu',        lat: 16.7800, lng: 82.2700, pop: 18200, censusPopulation: 18200, censusYear: 2011, populationType: 'REFERENCE_CENSUS_2011', district: 'Kakinada',      mandal: 'Tallarevu',       tier: 'REFERENCE', sourceId: 'census_india_ap', agency: 'Census India 2011' },
    { id: 'HAB002', name: 'Uppada',           lat: 17.0800, lng: 82.3300, pop: 22000, censusPopulation: 22000, censusYear: 2011, populationType: 'REFERENCE_CENSUS_2011', district: 'Kakinada',      mandal: 'U.Kothapalli',    tier: 'REFERENCE', sourceId: 'census_india_ap', agency: 'Census India 2011' },
    { id: 'HAB003', name: 'Antarvedi',        lat: 16.3320, lng: 81.7280, pop: 15400, censusPopulation: 15400, censusYear: 2011, populationType: 'REFERENCE_CENSUS_2011', district: 'Konaseema',     mandal: 'Sakhinetipalli',  tier: 'REFERENCE', sourceId: 'census_india_ap', agency: 'Census India 2011' },
    { id: 'HAB004', name: 'Gilakaladindi',    lat: 16.1750, lng: 81.1850, pop: 9800,  censusPopulation: 9800,  censusYear: 2011, populationType: 'REFERENCE_CENSUS_2011', district: 'Krishna',       mandal: 'Machilipatnam',   tier: 'REFERENCE', sourceId: 'census_india_ap', agency: 'Census India 2011' },
    { id: 'HAB005', name: 'Suryalanka',       lat: 15.8650, lng: 80.5250, pop: 11200, censusPopulation: 11200, censusYear: 2011, populationType: 'REFERENCE_CENSUS_2011', district: 'Bapatla',       mandal: 'Bapatla',         tier: 'REFERENCE', sourceId: 'census_india_ap', agency: 'Census India 2011' },
    { id: 'HAB006', name: 'Bheemunipatnam',   lat: 17.8913, lng: 83.4542, pop: 24000, censusPopulation: 24000, censusYear: 2011, populationType: 'REFERENCE_CENSUS_2011', district: 'Visakhapatnam', mandal: 'Bheemunipatnam',  tier: 'REFERENCE', sourceId: 'census_india_ap', agency: 'Census India 2011' },
    { id: 'HAB007', name: 'Kalingapatnam',    lat: 18.3364, lng: 84.1291, pop: 14500, censusPopulation: 14500, censusYear: 2011, populationType: 'REFERENCE_CENSUS_2011', district: 'Srikakulam',    mandal: 'Gara',            tier: 'REFERENCE', sourceId: 'census_india_ap', agency: 'Census India 2011' },
    { id: 'HAB008', name: 'Mypadu',           lat: 14.5020, lng: 80.1780, pop: 12800, censusPopulation: 12800, censusYear: 2011, populationType: 'REFERENCE_CENSUS_2011', district: 'Nellore',       mandal: 'Indukurpet',      tier: 'REFERENCE', sourceId: 'census_india_ap', agency: 'Census India 2011' }
  ],

  // ---- Authoritative Hospital Directory (Andhra Pradesh Civil Register) ----
  hospitals: [
    { id: 'HOSP001', name: 'GGH Kakinada',                             lat: 16.9800, lng: 82.2400, beds: 1500, emergency: true, district: 'Kakinada',      tier: 'REFERENCE', sourceId: 'ap_sdma_shelters' },
    { id: 'HOSP002', name: 'King George Hospital (KGH) Visakhapatnam', lat: 17.7088, lng: 83.3056, beds: 1200, emergency: true, district: 'Visakhapatnam', tier: 'REFERENCE', sourceId: 'ap_sdma_shelters' },
    { id: 'HOSP003', name: 'GGH Vijayawada',                           lat: 16.5120, lng: 80.6380, beds: 1000, emergency: true, district: 'NTR',           tier: 'REFERENCE', sourceId: 'ap_sdma_shelters' },
    { id: 'HOSP004', name: 'RIMS Ongole',                              lat: 15.5120, lng: 80.0450, beds: 800,  emergency: true, district: 'Prakasam',      tier: 'REFERENCE', sourceId: 'ap_sdma_shelters' },
    { id: 'HOSP005', name: 'SVIMS Tirupati',                           lat: 13.6380, lng: 79.4080, beds: 900,  emergency: true, district: 'Tirupati',      tier: 'REFERENCE', sourceId: 'ap_sdma_shelters' },
    { id: 'HOSP006', name: 'District Hospital Rajahmundry',            lat: 17.0050, lng: 81.7820, beds: 650,  emergency: true, district: 'East Godavari', tier: 'REFERENCE', sourceId: 'ap_sdma_shelters' }
  ]
};

// ================================================================
// TIER 2: HISTORICAL DATASETS (Regional Disaster Records)
// ================================================================
const HISTORICAL_DATA = {
  tier: 'HISTORICAL',
  events: [
    { year: 2023, type: 'Cyclone', name: 'Cyclone Michaung',     affected: 350000,  state: 'Andhra Pradesh', tier: 'HISTORICAL' },
    { year: 2022, type: 'Flood',   name: 'Godavari Flash Deluge',affected: 420000,  state: 'Andhra Pradesh', tier: 'HISTORICAL' },
    { year: 2018, type: 'Cyclone', name: 'Cyclone Titli',        affected: 280000,  state: 'Andhra Pradesh', tier: 'HISTORICAL' },
    { year: 2014, type: 'Cyclone', name: 'Cyclone Hudhud',       affected: 500000,  state: 'Andhra Pradesh', tier: 'HISTORICAL' },
    { year: 1990, type: 'Cyclone', name: '1990 AP Super Cyclone',affected: 1000000, state: 'Andhra Pradesh', tier: 'HISTORICAL' }
  ]
};

// ================================================================
// TIER 3: DEMO / DRILL SCENARIO (Explicit Simulation Datasets Only)
// ================================================================
// Gated strictly behind explicit drill mode. NEVER displayed as real-time LIVE telemetry.
const DRILL_SCENARIO_DATA = {
  tier: 'SIMULATED',
  role: 'DRILL',
  activeHazards: [
    { id: 'HAZ_DRILL_001', type: 'Squall', name: '[DRILL] Coastal Thunderstorm Warning', severity: 'MODERATE', state: 'Andhra Pradesh', lat: 16.5, lng: 81.5, radius: 100000, confidence: 85, eta: 'Drill Injected', desc: 'SIMULATED DRILL: IMD squall exercise across Coastal AP.', tier: 'SIMULATED', role: 'DRILL' },
    { id: 'HAZ_DRILL_002', type: 'Squall', name: '[DRILL] Rayalaseema Squall Advisory', severity: 'MODERATE', state: 'Andhra Pradesh', lat: 14.5, lng: 78.5, radius: 90000, confidence: 80, eta: 'Drill Injected', desc: 'SIMULATED DRILL: Heavy squall drill exercise.', tier: 'SIMULATED', role: 'DRILL' },
    { id: 'HAZ_DRILL_003', type: 'Earthquake', name: '[DRILL] Kurnool Earthquake (M3.6)', severity: 'HIGH', state: 'Andhra Pradesh', lat: 15.594, lng: 77.269, radius: 35000, confidence: 99, eta: 'Drill Injected', desc: 'SIMULATED DRILL: NCS Kurnool seismic drill event.', tier: 'SIMULATED', role: 'DRILL' }
  ],
  riskZones: [
    { id: 'RZ_DRILL_001', epicenter: { lat: 16.5, lng: 81.5 }, hazardType: 'squall', baseRadius: 100000, level: 'YELLOW', name: '[DRILL] Coastal AP Thunderstorm Belt', lat: 16.5, lng: 81.5, radius: 100000, pop: 150000, desc: 'SIMULATED: Coastal thunderstorm drill region', tier: 'SIMULATED', role: 'DRILL' },
    { id: 'RZ_DRILL_002', epicenter: { lat: 14.5, lng: 78.5 }, hazardType: 'squall', baseRadius: 90000, level: 'YELLOW', name: '[DRILL] Rayalaseema Squall Sector', lat: 14.5, lng: 78.5, radius: 90000, pop: 85000, desc: 'SIMULATED: Rayalaseema squall drill sector', tier: 'SIMULATED', role: 'DRILL' },
    { id: 'RZ_DRILL_003', epicenter: { lat: 15.594, lng: 77.269 }, hazardType: 'earthquake', baseRadius: 35000, level: 'RED', name: '[DRILL] Kurnool Earthquake Ring', lat: 15.594, lng: 77.269, radius: 35000, pop: 45000, desc: 'SIMULATED: Kurnool seismic drill epicenter', tier: 'SIMULATED', role: 'DRILL' }
  ],
  citizenReports: [
    { id: 'REP_DRILL_001', lat: 16.9891, lng: 82.2475, type: 'Flood', severity: 'High', status: 'Verified', desc: '[DRILL] Roads submerged near Kakinada port area', time: 'Drill', reporter: 'Drill Agent 1', phone: '+91-**-****-3421', upvotes: 14, tier: 'SIMULATED', role: 'DRILL' },
    { id: 'REP_DRILL_002', lat: 17.0800, lng: 82.3300, type: 'Storm Surge', severity: 'Critical', status: 'Pending', desc: '[DRILL] Coastal wave runup breaching Uppada seawall', time: 'Drill', reporter: 'Drill Agent 2', phone: '+91-**-****-8821', upvotes: 9, tier: 'SIMULATED', role: 'DRILL' },
    { id: 'REP_DRILL_003', lat: 17.0005, lng: 81.8040, type: 'Flood', severity: 'High', status: 'Reviewing', desc: '[DRILL] Godavari backwater overflowing ghat stairs', time: 'Drill', reporter: 'Drill Agent 3', phone: '+91-**-****-5541', upvotes: 5, tier: 'SIMULATED', role: 'DRILL' }
  ],
  alerts: [
    { id: 'ALT_DRILL_001', level: 'CRITICAL', type: 'Cyclone', title: '[DRILL] Severe Cyclone Landfall Warning', time: '14:32', area: 'Andhra Pradesh Coastline', confidence: 91, sources: ['IMD Drill'], active: true, tier: 'SIMULATED', role: 'DRILL' },
    { id: 'ALT_DRILL_002', level: 'HIGH', type: 'Flood', title: '[DRILL] Godavari Basin Danger Level Warning', time: '13:15', area: 'Konaseema & East Godavari', confidence: 96, sources: ['CWC Drill'], active: true, tier: 'SIMULATED', role: 'DRILL' }
  ],
  multiRiskBreakdown: {
    labels: ['Cyclone', 'Flood', 'Storm Surge', 'Coastal Erosion', 'Heavy Squall', 'Heat Stress'],
    affected: [148000, 112000, 48000, 22000, 34000, 25000],
    riskScores: [9.2, 8.8, 7.9, 6.8, 6.4, 5.2],
    tier: 'SIMULATED'
  },
  simulatedWeather: {
    'Coastal Andhra':   { temp: 31, feels: 37, humidity: 88, wind: 65, condition: 'Storm Surge', icon: '<i class="fi fi-rr-thunderstorm" aria-hidden="true"></i>', iconClass: 'fi-rr-thunderstorm', tier: 'SIMULATED' },
    'Godavari Delta':   { temp: 29, feels: 35, humidity: 92, wind: 48, condition: 'Heavy Rain',  icon: '<i class="fi fi-rr-cloud-rain" aria-hidden="true"></i>', iconClass: 'fi-rr-cloud-rain', tier: 'SIMULATED' },
    'North Coastal AP': { temp: 28, feels: 33, humidity: 85, wind: 52, condition: 'Squall',      icon: '<i class="fi fi-rr-wind" aria-hidden="true"></i>', iconClass: 'fi-rr-wind', tier: 'SIMULATED' },
    'Krishna Basin':    { temp: 30, feels: 36, humidity: 82, wind: 38, condition: 'Rainy',       icon: '<i class="fi fi-rr-cloud-rain" aria-hidden="true"></i>', iconClass: 'fi-rr-cloud-rain', tier: 'SIMULATED' },
    'Rayalaseema':      { temp: 34, feels: 38, humidity: 62, wind: 20, condition: 'Partly Cloudy',icon: '<i class="fi fi-rr-clouds" aria-hidden="true"></i>', iconClass: 'fi-rr-clouds', tier: 'SIMULATED' },
    'default':          { temp: 30, feels: 35, humidity: 80, wind: 35, condition: 'Advisory Active',icon: '<i class="fi fi-rr-cloud-drizzle" aria-hidden="true"></i>', iconClass: 'fi-rr-cloud-drizzle', tier: 'SIMULATED' }
  },
  simulatedAirQuality: {
    tier: 'SIMULATED',
    role: 'DRILL',
    status: 'SIMULATED',
    source: 'Drill Simulation Air Quality Feed',
    usAqi: 85,
    category: 'Moderate',
    pm2_5: 28.5,
    pm10: 55.0
  },
  simulatedRiverLevels: {
    status: 'SIMULATED',
    sourceId: 'cwc_nwic_river',
    source: 'CWC NWIC Drill Scenario Data',
    role: 'DRILL',
    tier: 'SIMULATED',
    stationId: 'DRILL_STN_001',
    stationName: 'Dowleswaram Barrage (Drill)',
    riverName: 'Godavari',
    latitude: 16.938,
    longitude: 81.765,
    observedAt: '2026-09-15T12:00:00Z',
    fetchedAt: '2026-09-15T12:05:00Z',
    waterLevel: 14.8,
    waterLevelUnit: 'm',
    dangerLevel: 14.5,
    dangerLevelUnit: 'm',
    warningLevel: 13.0,
    warningLevelUnit: 'm',
    stationStatus: 'WARNING',
    floodCondition: 'DANGER',
    trend: 'RISING',
    discharge: 850000,
    dischargeUnit: 'cusecs',
    provenance: 'cwc_drill',
    stale: false,
    stations: []
  },
  simulatedFire: {
    status: 'SIMULATED',
    sourceId: 'nasa_firms_viirs',
    source: 'NASA FIRMS VIIRS Drill Scenario Data',
    role: 'DRILL',
    tier: 'SIMULATED',
    observations: [
      {
        id: 'drill_hotspot_001',
        latitude: 17.0,
        longitude: 82.2,
        brightness: 340.5,
        scan: 0.4,
        track: 0.4,
        observedAt: '2026-09-15T12:00:00Z',
        satellite: 'N',
        instrument: 'VIIRS',
        confidence: 'n',
        version: '2.0NRT',
        brightT31: 295.2,
        frp: 15.6,
        daynight: 'D',
        provenance: 'nasa_firms_drill'
      }
    ],
    observationCount: 1,
    latestObservedAt: '2026-09-15T12:00:00Z',
    fetchedAt: '2026-09-15T12:05:00Z',
    peakFrpMw: 15.6,
    stale: false,
    provenance: 'nasa_firms_drill'
  },
  simulatedSatellite: {
    status: 'SIMULATED',
    sourceId: 'copernicus_dataspace',
    source: 'Copernicus Data Space Drill Scenario Data',
    observationType: 'LATEST_SATELLITE_OBSERVATION',
    satellite: 'Sentinel-1',
    productType: 'GRD',
    role: 'DRILL',
    tier: 'SIMULATED',
    sceneId: 'S1A_IW_GRDH_1SDV_20260915T120000_DRILL',
    title: 'S1A_IW_GRDH_1SDV_20260915T120000_DRILL.SAFE',
    acquisitionStart: '2026-09-15T12:00:00Z',
    acquisitionEnd: '2026-09-15T12:00:25Z',
    discoveredAt: '2026-09-15T12:05:00Z',
    platform: 'Sentinel-1A',
    instrument: 'C-SAR',
    orbitDirection: 'DESCENDING',
    relativeOrbit: 120,
    polarization: 'VV+VH',
    mode: 'IW',
    footprint: { type: 'Polygon', coordinates: [[[80.0, 16.0], [82.0, 16.0], [82.0, 18.0], [80.0, 18.0], [80.0, 16.0]]] },
    sourceUrl: null,
    provenance: 'copernicus_drill',
    stale: false,
    historical: false,
    scenes: [],
    sceneList: []
  },
  simulatedSatelliteProcessing: {
    status: 'SIMULATED',
    sourceId: 'copernicus_dataspace',
    sourceSceneId: 'S1A_IW_GRDH_1SDV_20260915T120000_DRILL',
    observationType: 'LATEST_SATELLITE_OBSERVATION',
    indicatorType: 'SENTINEL1_GRD_DERIVED_INDICATORS',
    role: 'DRILL',
    tier: 'SIMULATED',
    derivedAt: '2026-09-15T12:10:00Z',
    processedAt: '2026-09-15T12:10:00Z',
    contributingSources: ['copernicus_dataspace'],
    provenance: {
      sourceId: 'copernicus_dataspace',
      sourceSceneId: 'S1A_IW_GRDH_1SDV_20260915T120000_DRILL',
      observationType: 'LATEST_SATELLITE_OBSERVATION',
      indicatorType: 'SENTINEL1_GRD_DERIVED_INDICATORS',
      status: 'DERIVED',
      role: 'DRILL',
      tier: 'SIMULATED',
      derivedAt: '2026-09-15T12:10:00Z',
      contributingSources: ['copernicus_dataspace']
    },
    indicators: {
      sarBackscatterStats: {
        sampleCount: 1000,
        meanDb: -14.2,
        minDb: -28.5,
        maxDb: 2.1,
        stdDevDb: 4.8
      },
      surfaceWaterAnomaly: {
        thresholdDb: -16.0,
        waterPixelCount: 220,
        waterRatio: 0.22,
        status: 'ANOMALY_ELEVATED'
      },
      processedFootprint: { type: 'Polygon', coordinates: [[[80.0, 16.0], [82.0, 16.0], [82.0, 18.0], [80.0, 18.0], [80.0, 16.0]]] },
      processingQuality: 'SIMULATED_DRILL_FIXTURE'
    }
  }
};

// ================================================================
// TIER 4: LIVE OPERATIONAL STATE (Single Truth Operational Layer)
// ================================================================
// Starts clean and unpolluted. Hydrated strictly by live telemetry from /api/canonical-state.
const APP_DATA = {
  mode: 'LIVE',
  tier: 'LIVE',

  // Strict Separated State Architecture
  live: {
    hazards: [],
    get activeHazards() { return this.hazards; },
    set activeHazards(v) { this.hazards = Array.isArray(v) ? v : []; },
    riskZones: [],
    shelters: [],
    habitations: [],
    citizenReports: [],
    alerts: [],
    weather: null,
    airQuality: null,
    riverLevels: null,
    earthquakes: null,
    fire: null,
    satellite: null,
    summary: {
      activeHazards: 0,
      highRiskHabitations: 0,
      populationAtRisk: 0,
      safeSiteCapacity: REFERENCE_DATA.safeSites.reduce((sum, s) => sum + (s.capacity || 0), 0),
      safeOccupancy: null, // Unknown until reported by live operational feeds
      activeAlerts: 0,
      verifiedReports: 0,
      pendingReports: 0,
      overallRiskScore: null,
      status: 'INITIALIZING'
    }
  },

  reference: REFERENCE_DATA,
  historical: HISTORICAL_DATA,
  drillScenario: DRILL_SCENARIO_DATA,

  // Backward-compatible accessors for legacy callers reading/writing root properties
  get activeHazards() { return this.live.hazards; },
  set activeHazards(v) { this.live.hazards = Array.isArray(v) ? v : []; },

  get riskZones() { return this.live.riskZones; },
  set riskZones(v) { this.live.riskZones = Array.isArray(v) ? v : []; },

  get citizenReports() { return this.live.citizenReports; },
  set citizenReports(v) { this.live.citizenReports = Array.isArray(v) ? v : []; },

  get alerts() { return this.live.alerts; },
  set alerts(v) { this.live.alerts = Array.isArray(v) ? v : []; },

  get weather() { return this.live.weather; },
  set weather(v) { this.live.weather = v; },

  get airQuality() { return this.live.airQuality; },
  set airQuality(v) { this.live.airQuality = v; },

  get riverLevels() { return this.live.riverLevels; },
  set riverLevels(v) { this.live.riverLevels = v; },

  get fire() { return this.live.fire; },
  set fire(v) { this.live.fire = v; },

  get satellite() { return this.live.satellite; },
  set satellite(v) { this.live.satellite = v; },

  get summary() { return this.live.summary; },
  set summary(v) { this.live.summary = v || {}; },

  get safeSites() { return this.reference.safeSites; },
  set safeSites(v) { this.reference.safeSites = Array.isArray(v) ? v : []; },

  get shelters() { return this.reference.safeSites; },
  set shelters(v) { this.reference.safeSites = Array.isArray(v) ? v : []; },

  get habitations() { return this.reference.habitations; },
  set habitations(v) { this.reference.habitations = Array.isArray(v) ? v : []; },

  get hospitals() { return this.reference.hospitals; },
  set hospitals(v) { this.reference.hospitals = Array.isArray(v) ? v : []; },

  get mapConfig() { return this.reference.mapConfig; },
  set mapConfig(v) { this.reference.mapConfig = v || {}; },

  get historicalEvents() { return this.historical.events; },
  set historicalEvents(v) { this.historical.events = Array.isArray(v) ? v : []; },

  // Dynamic multi-risk breakdown calculated from current active hazards
  get multiRiskBreakdown() {
    if (this.mode === 'DRILL') {
      return DRILL_SCENARIO_DATA.multiRiskBreakdown;
    }
    const hazards = this.live.hazards || [];
    if (hazards.length === 0) {
      return {
        labels: ['No Active Hazards'],
        affected: [0],
        riskScores: [0]
      };
    }
    const typeMap = {};
    hazards.forEach(h => {
      const type = h.type || 'Hazard';
      if (!typeMap[type]) {
        typeMap[type] = { count: 0, pop: 0, maxConf: 0 };
      }
      typeMap[type].count += 1;
      typeMap[type].pop += (h.popAtRisk || 0);
      const confVal = (typeof h.confidence === 'number' && !isNaN(h.confidence)) ? h.confidence : 0;
      typeMap[type].maxConf = Math.max(typeMap[type].maxConf, confVal / 10);
    });
    const labels = Object.keys(typeMap);
    return {
      labels,
      affected: labels.map(l => typeMap[l].pop),
      riskScores: labels.map(l => Number(typeMap[l].maxConf.toFixed(1)))
    };
  },

  // Explicit Drill Mode activation and deactivation
  activateDrillMode() {
    this.mode = 'DRILL';
    this.live.hazards = [...DRILL_SCENARIO_DATA.activeHazards];
    this.live.riskZones = [...DRILL_SCENARIO_DATA.riskZones];
    this.live.alerts = [...DRILL_SCENARIO_DATA.alerts];
    this.live.citizenReports = [...DRILL_SCENARIO_DATA.citizenReports];
    this.live.riverLevels = { ...DRILL_SCENARIO_DATA.simulatedRiverLevels };
    this.live.fire = { ...DRILL_SCENARIO_DATA.simulatedFire };
    this.live.satellite = { ...DRILL_SCENARIO_DATA.simulatedSatellite };
    this.live.summary = {
      activeHazards: this.live.hazards.length,
      highRiskHabitations: 3,
      populationAtRisk: 142000,
      safeSiteCapacity: 34000,
      safeOccupancy: 6640,
      activeAlerts: this.live.alerts.length,
      verifiedReports: 1,
      pendingReports: 2,
      overallRiskScore: 8.4,
      status: 'SIMULATION_DRILL_ACTIVE'
    };
    console.log('🔴 [APP_DATA] EXPLICIT DRILL MODE ACTIVATED. Displaying simulated scenarios.');
    if (typeof window !== 'undefined' && typeof window.renderZoneManager === 'function') {
      window.renderZoneManager();
    }
  },

  deactivateDrillMode() {
    this.mode = 'LIVE';
    this.live.hazards = [];
    this.live.riskZones = [];
    this.live.shelters = [];
    this.live.habitations = [];
    this.live.alerts = [];
    this.live.citizenReports = [];
    this.live.weather = null;
    this.live.airQuality = null;
    this.live.riverLevels = null;
    this.live.earthquakes = null;
    this.live.fire = null;
    this.live.satellite = null;
    this.live.summary = {
      activeHazards: 0,
      highRiskHabitations: 0,
      populationAtRisk: 0,
      safeSiteCapacity: REFERENCE_DATA.safeSites.reduce((sum, s) => sum + (s.capacity || 0), 0),
      safeOccupancy: null,
      activeAlerts: 0,
      verifiedReports: 0,
      pendingReports: 0,
      overallRiskScore: null,
      status: 'READY'
    };
    console.log('🟢 [APP_DATA] DRILL MODE DEACTIVATED. Restoring live telemetry operational state.');
    syncLiveDashboardState();
  }
};

// ================================================================
// WEATHER DATA ACCESSOR (For backwards compatibility)
// ================================================================
// Gated to simulated scenario data. Live weather telemetry is read from LiveState / Open-Meteo.
const WEATHER_DATA = DRILL_SCENARIO_DATA.simulatedWeather;

// ================================================================
// DISASTER HISTORY SERVICE (Andhra Pradesh Locations Only)
// ================================================================
const DisasterHistoryService = {
  getSummary(name) {
    if (!name) return '';
    const lower = name.toLowerCase();
    if (lower.includes('tallarevu')) return 'Affected by Cyclone Hudhud (2014) and Titli (2018)';
    if (lower.includes('uppada')) return 'Affected by Cyclone Hudhud (2014) and Michaung (2023)';
    if (lower.includes('antarvedi')) return 'Affected by Godavari Flood Deluge (2022) and Cyclone Michaung (2023)';
    if (lower.includes('coringa')) return 'Protected mangrove buffer; impacted by Cyclone Hudhud (2014)';
    if (lower.includes('vakalapudi')) return 'Affected by Cyclone Hudhud (2014) and Titli (2018)';
    if (lower.includes('machilipatnam')) return 'Affected by 1990 AP Super Cyclone and Cyclone Phethai (2018)';
    if (lower.includes('bheemunipatnam') || lower.includes('bheemili')) return 'Affected by Cyclone Hudhud (2014)';
    if (lower.includes('suryalanka') || lower.includes('bapatla')) return 'Affected by Cyclone Michaung (2023) Landfall';
    if (lower.includes('kalingapatnam')) return 'Affected by Cyclone Titli (2018) and Cyclone Gulab (2021)';
    return '';
  },
  getNearest(lat, lon, maxDistKm = 35) {
    const villages = [
      { name: 'Uppada', lat: 17.0800, lon: 82.3300, text: 'This area was affected by Cyclone Hudhud (2014) and Michaung (2023)' },
      { name: 'Tallarevu', lat: 16.7800, lon: 82.2700, text: 'This area was affected by Cyclone Hudhud (2014) and Titli (2018)' },
      { name: 'Antarvedi', lat: 16.3320, lon: 81.7280, text: 'This area was affected by Godavari Flood Deluge (2022)' },
      { name: 'Machilipatnam', lat: 16.1875, lon: 81.1389, text: 'This area was affected by 1990 Super Cyclone and Cyclone Phethai (2018)' },
      { name: 'Suryalanka', lat: 15.8650, lon: 80.5250, text: 'This area was affected by Cyclone Michaung (2023) landfall' },
      { name: 'Bheemunipatnam', lat: 17.8913, lon: 83.4542, text: 'This area was affected by Cyclone Hudhud (2014)' },
      { name: 'Kalingapatnam', lat: 18.3364, lon: 84.1291, text: 'This area was affected by Cyclone Titli (2018)' }
    ];
    let closest = null;
    let minD = Infinity;
    villages.forEach(v => {
      const R = 6371;
      const dLat = (v.lat - lat) * Math.PI / 180;
      const dLon = (v.lon - lon) * Math.PI / 180;
      const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat * Math.PI / 180) * Math.cos(v.lat * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
      const d = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      if (d < minD) { minD = d; closest = v; }
    });
    if (closest && minD <= maxDistKm) {
      return closest.text;
    }
    return null;
  }
};

// ================================================================
// LIVE RUNTIME STATE SYNCHRONIZATION
// ================================================================
// Strict Truth Contract:
// If live endpoint returns 0 records, APP_DATA gets 0 records.
// In LIVE mode: empty live result = empty live result. Never fall back to static data.
async function syncLiveDashboardState() {
  if (typeof fetch === 'undefined') return;
  // LIVE-ONLY MODE: Always fetch from live canonical state.
  // Drill mode hardcoded data is no longer used for zone rendering.

  try {
    const res = await fetch('/api/canonical-state');
    if (res.ok) {
      const liveState = await res.json();
      if (liveState) {
        // Strict canonical live state assignment: empty live result = empty live result
        APP_DATA.live.hazards = Array.isArray(liveState.hazards) ? liveState.hazards : [];
        APP_DATA.live.riskZones = Array.isArray(liveState.riskZones) ? liveState.riskZones : [];
        APP_DATA.live.shelters = Array.isArray(liveState.shelters) ? liveState.shelters : [];
        APP_DATA.live.habitations = Array.isArray(liveState.habitations) ? liveState.habitations : [];
        APP_DATA.live.alerts = Array.isArray(liveState.alerts) ? liveState.alerts : [];
        APP_DATA.live.weather = liveState.weather || null;
        APP_DATA.live.airQuality = liveState.airQuality || null;
        APP_DATA.live.riverLevels = liveState.riverLevels || null;
        APP_DATA.live.earthquakes = liveState.earthquakes || null;
        APP_DATA.live.satellite = liveState.satellite || null;
        APP_DATA.live.fire = liveState.fire || ((liveState.satellite && liveState.satellite.nasaFirmsHotspots) ? liveState.satellite : null);
        
        const backendReports = liveState.citizenReports ? [
          ...(Array.isArray(liveState.citizenReports.verified) ? liveState.citizenReports.verified : []),
          ...(Array.isArray(liveState.citizenReports.pendingQueue) ? liveState.citizenReports.pendingQueue : [])
        ] : [];

        const realtimeReports = (typeof window !== 'undefined' && window.firebaseLive && Array.isArray(window.firebaseLive.reports))
          ? window.firebaseLive.reports
          : (APP_DATA.live.citizenReports || []);

        const mergedReports = [...realtimeReports];
        backendReports.forEach(br => {
          if (!mergedReports.some(mr => mr.id === br.id)) {
            mergedReports.push(br);
          }
        });
        APP_DATA.live.citizenReports = mergedReports;

        // Live KPI synchronization
        if (liveState.summary) {
          APP_DATA.live.summary = {
            activeHazards: APP_DATA.live.hazards.length,
            highRiskHabitations: liveState.summary.highRiskHabitationsCount || 0,
            populationAtRisk: liveState.summary.populationAtRisk?.value ?? 0,
            safeSiteCapacity: liveState.summary.totalShelterCapacity || REFERENCE_DATA.safeSites.reduce((sum, s) => sum + (s.capacity || 0), 0),
            safeOccupancy: liveState.summary.totalShelterOccupancy,
            activeAlerts: APP_DATA.live.alerts.length,
            verifiedReports: liveState.citizenReports?.verified?.length || 0,
            pendingReports: liveState.citizenReports?.pendingQueue?.length || 0,
            overallRiskScore: liveState.summary.overallRiskScore ?? null,
            status: liveState.summary.status || 'READY'
          };
        }

        // Live shelter occupancy mapping onto reference directory
        if (Array.isArray(liveState.shelters) && liveState.shelters.length > 0) {
          REFERENCE_DATA.safeSites.forEach(refSite => {
            const liveMatch = liveState.shelters.find(ls => (ls.id || ls.shelterId) === refSite.id || ls.name === refSite.name);
            const liveOcc = liveMatch ? (liveMatch.currentOccupancy ?? liveMatch.current_occupancy ?? null) : null;
            refSite.current = liveOcc;
            refSite.currentOccupancy = liveOcc;
            refSite.live = liveMatch ? {
              currentOccupancy: liveOcc,
              occupancyStatus: liveMatch.occupancyStatus || (liveOcc !== null ? 'LIVE' : 'UNKNOWN'),
              occupancyObservedAt: liveMatch.occupancyObservedAt || null,
              operationalStatus: liveMatch.operationalStatus || 'UNKNOWN',
              availability: liveMatch.availability || 'UNKNOWN',
              utilization: liveMatch.utilization ?? null,
              provenance: liveMatch.provenance || 'AP SDMA Reference Baseline'
            } : null;
          });
        }
      }
    }
  } catch (e) {
    console.warn('[APP_DATA] Live sync notice:', e.message);
  }

  // Trigger map zone re-render after data update
  // This ensures zones visually refresh within 10 seconds of new live data
  if (typeof window !== 'undefined') {
    if (window.hazardEngine && typeof window.hazardEngine.render === 'function') {
      window.hazardEngine.render(window.hazardEngine.currentHazard || 'all', true);
    }
    // Also dispatch a custom event so other components can react
    window.dispatchEvent(new CustomEvent('liveSyncUpdated', {
      detail: { timestamp: Date.now() }
    }));
  }
}

// ================================================================
// LIVE 10-SECOND POLLING LOOP
// ================================================================
// Fetches fresh hazard, zone, and alert data from /api/canonical-state
// every 10 seconds. Zones on the map update automatically with live data.
if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', () => {
    // Immediate first fetch on page load
    syncLiveDashboardState();

    // Then poll every 10 seconds for live updates
    setInterval(() => {
      syncLiveDashboardState().then(() => {
        console.log(`[LiveSync] ✅ Data refreshed at ${new Date().toLocaleTimeString()}`);
      }).catch(err => {
        console.warn('[LiveSync] ⚠️ Sync failed:', err.message);
      });
    }, 10000); // 10,000ms = 10 seconds
  });
}

// Global Exports
if (typeof window !== 'undefined') {
  window.APP_DATA = APP_DATA;
  window.REFERENCE_DATA = REFERENCE_DATA;
  window.HISTORICAL_DATA = HISTORICAL_DATA;
  window.DRILL_SCENARIO_DATA = DRILL_SCENARIO_DATA;
  window.WEATHER_DATA = WEATHER_DATA;
  window.DisasterHistoryService = DisasterHistoryService;
  window.syncLiveDashboardState = syncLiveDashboardState;
}
if (typeof global !== 'undefined') {
  global.APP_DATA = APP_DATA;
  global.REFERENCE_DATA = REFERENCE_DATA;
  global.HISTORICAL_DATA = HISTORICAL_DATA;
  global.DRILL_SCENARIO_DATA = DRILL_SCENARIO_DATA;
  global.WEATHER_DATA = WEATHER_DATA;
  global.DisasterHistoryService = DisasterHistoryService;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    APP_DATA,
    REFERENCE_DATA,
    HISTORICAL_DATA,
    DRILL_SCENARIO_DATA,
    WEATHER_DATA,
    DisasterHistoryService,
    syncLiveDashboardState
  };
}
