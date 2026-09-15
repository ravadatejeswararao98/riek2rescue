// ================================================================
// DATA.JS — Andhra Pradesh Disaster Management Command System Data
// ================================================================
// Authoritative operational dataset strictly restricted to Andhra Pradesh.

const APP_DATA = {

  // ---- Map Configuration (Focused on Andhra Pradesh) ----
  mapConfig: {
    center: [15.9129, 79.7400],
    zoom: 7,
    minZoom: 5,
    maxZoom: 18
  },

  // ---- Active Hazards (Andhra Pradesh Operational Incidents) ----
  activeHazards: [
    { id: 'HAZ_IMD_001', type: 'Squall', name: 'Coastal Thunderstorm Warning', severity: 'MODERATE', state: 'Andhra Pradesh', lat: 16.5, lng: 81.5, radius: 100000, confidence: 85, eta: 'Active', desc: 'IMD warning for thunderstorms and lightning across Coastal Andhra Pradesh.' },
    { id: 'HAZ_IMD_002', type: 'Squall', name: 'Rayalaseema Squall Advisory', severity: 'MODERATE', state: 'Andhra Pradesh', lat: 14.5, lng: 78.5, radius: 90000, confidence: 80, eta: 'Active', desc: 'Heavy rain and local squall probability in Rayalaseema districts.' },
    { id: 'HAZ_EQ_001', type: 'Earthquake', name: 'Kurnool Earthquake (M3.6)', severity: 'HIGH', state: 'Andhra Pradesh', lat: 15.594, lng: 77.269, radius: 35000, confidence: 99, eta: 'Occurred', desc: 'M3.6 Earthquake recorded by NCS in Kurnool on 2026-09-10' }
  ],

  // ---- Risk Zones (Concentric Multi-Ring Hazard Epicenters & AP Regional Sectors) ----
  riskZones: [
    { id: 'RZ_IMD_001', epicenter: { lat: 16.5, lng: 81.5 }, hazardType: 'squall', baseRadius: 100000, level: 'YELLOW', name: 'Coastal AP Thunderstorm Belt', lat: 16.5, lng: 81.5, radius: 100000, pop: 150000, desc: 'IMD active lightning and thunderstorm warning region' },
    { id: 'RZ_IMD_002', epicenter: { lat: 14.5, lng: 78.5 }, hazardType: 'squall', baseRadius: 90000, level: 'YELLOW', name: 'Rayalaseema Squall Sector', lat: 14.5, lng: 78.5, radius: 90000, pop: 85000, desc: 'Incoming heavy rain and squall advisory zone' },
    { id: 'RZ_EQ_001', epicenter: { lat: 15.594, lng: 77.269 }, hazardType: 'earthquake', baseRadius: 35000, level: 'RED', name: 'Kurnool Earthquake (M3.6)', lat: 15.594, lng: 77.269, radius: 35000, pop: 45000, desc: 'M3.6 Earthquake recorded by NCS in Kurnool on 2026-09-10' }
  ],

  // ---- Safe Sites / Evacuation Shelters (Andhra Pradesh Only) ----
  safeSites: [
    { id: 'SS001', name: 'Kakinada Port Relief Camp',          lat: 16.9891, lng: 82.2475, capacity: 5000, current: 1240, type: 'Relief Camp',       amenities: ['Food','Water','Medical','Power'], district: 'Kakinada' },
    { id: 'SS002', name: 'Visakhapatnam Port Shelter',         lat: 17.6868, lng: 83.2185, capacity: 4500, current: 890,  type: 'Cyclone Shelter',   amenities: ['Food','Water','Power','Helipad'], district: 'Visakhapatnam' },
    { id: 'SS003', name: 'Rajahmundry Flood Relief Center',     lat: 17.0005, lng: 81.8040, capacity: 6000, current: 1850, type: 'Flood Relief Hub',  amenities: ['Food','Water','Medical','Power'], district: 'East Godavari' },
    { id: 'SS004', name: 'Vijayawada Indoor Stadium Shelter',   lat: 16.5062, lng: 80.6480, capacity: 8000, current: 2100, type: 'Evacuation Hub',   amenities: ['Food','Water','Medical','Power'], district: 'NTR' },
    { id: 'SS005', name: 'Machilipatnam Cyclone Shelter',       lat: 16.1875, lng: 81.1389, capacity: 3500, current: 640,  type: 'Cyclone Shelter',   amenities: ['Food','Water','Power'],           district: 'Krishna' },
    { id: 'SS006', name: 'Ongole RIMS Evacuation Hub',          lat: 15.5057, lng: 80.0499, capacity: 3000, current: 420,  type: 'Medical Shelter',   amenities: ['Food','Water','Medical'],         district: 'Prakasam' },
    { id: 'SS007', name: 'Tirupati TTD Community Hall Shelter', lat: 13.6288, lng: 79.4192, capacity: 4000, current: 300,  type: 'Staging Shelter',   amenities: ['Food','Water','Power'],           district: 'Tirupati' }
  ],

  // ---- Habitations (Villages/Towns in Andhra Pradesh) ----
  habitations: [
    { id: 'HAB001', name: 'Tallarevu',        lat: 16.7800, lng: 82.2700, pop: 18200, risk: 'RED',    hazard: 'Cyclone',     district: 'Kakinada',      evacuated: false },
    { id: 'HAB002', name: 'Uppada',           lat: 17.0800, lng: 82.3300, pop: 22000, risk: 'RED',    hazard: 'Cyclone',     district: 'Kakinada',      evacuated: true  },
    { id: 'HAB003', name: 'Antarvedi',        lat: 16.3320, lng: 81.7280, pop: 15400, risk: 'RED',    hazard: 'Flood',       district: 'Konaseema',     evacuated: false },
    { id: 'HAB004', name: 'Gilakaladindi',    lat: 16.1750, lng: 81.1850, pop: 9800,  risk: 'ORANGE', hazard: 'Storm Surge', district: 'Krishna',       evacuated: false },
    { id: 'HAB005', name: 'Suryalanka',       lat: 15.8650, lng: 80.5250, pop: 11200, risk: 'ORANGE', hazard: 'Flood',       district: 'Bapatla',       evacuated: false },
    { id: 'HAB006', name: 'Bheemunipatnam',   lat: 17.8913, lng: 83.4542, pop: 24000, risk: 'YELLOW', hazard: 'Squall',      district: 'Visakhapatnam', evacuated: false },
    { id: 'HAB007', name: 'Kalingapatnam',    lat: 18.3364, lng: 84.1291, pop: 14500, risk: 'YELLOW', hazard: 'Squall',      district: 'Srikakulam',    evacuated: false },
    { id: 'HAB008', name: 'Mypadu',           lat: 14.5020, lng: 80.1780, pop: 12800, risk: 'GREEN',  hazard: 'None',        district: 'Nellore',       evacuated: false }
  ],

  // ---- Hospitals (Andhra Pradesh Only) ----
  hospitals: [
    { id: 'HOSP001', name: 'GGH Kakinada',                            lat: 16.9800, lng: 82.2400, beds: 1500, emergency: true, district: 'Kakinada' },
    { id: 'HOSP002', name: 'King George Hospital (KGH) Visakhapatnam',lat: 17.7088, lng: 83.3056, beds: 1200, emergency: true, district: 'Visakhapatnam' },
    { id: 'HOSP003', name: 'GGH Vijayawada',                          lat: 16.5120, lng: 80.6380, beds: 1000, emergency: true, district: 'NTR' },
    { id: 'HOSP004', name: 'RIMS Ongole',                             lat: 15.5120, lng: 80.0450, beds: 800,  emergency: true, district: 'Prakasam' },
    { id: 'HOSP005', name: 'SVIMS Tirupati',                          lat: 13.6380, lng: 79.4080, beds: 900,  emergency: true, district: 'Tirupati' },
    { id: 'HOSP006', name: 'District Hospital Rajahmundry',           lat: 17.0050, lng: 81.7820, beds: 650,  emergency: true, district: 'East Godavari' }
  ],

  // ---- Citizen Reports (Andhra Pradesh Only) ----
  citizenReports: [
    { id: 'REP001', lat: 16.9891, lng: 82.2475, type: 'Flood',      severity: 'High',   status: 'Verified',  desc: 'Roads submerged near Kakinada port area, knee-deep water', time: '2h ago',  reporter: 'Suresh Varma',  phone: '+91-**-****-3421', upvotes: 14 },
    { id: 'REP002', lat: 17.0800, lng: 82.3300, type: 'Storm Surge',severity: 'Critical',status: 'Pending',   desc: 'Severe coastal wave runup breaching Uppada seawall',        time: '45m ago', reporter: 'Priya Reddy',   phone: '+91-**-****-8821', upvotes: 9  },
    { id: 'REP003', lat: 17.0005, lng: 81.8040, type: 'Flood',      severity: 'High',   status: 'Reviewing', desc: 'Godavari backwater overflowing ghat stairs in Rajahmundry',time: '3h ago',  reporter: 'K. Rama Rao',   phone: '+91-**-****-5541', upvotes: 5  },
    { id: 'REP004', lat: 16.1875, lng: 81.1389, type: 'Storm',      severity: 'Medium', status: 'Pending',   desc: 'Strong gale winds uprooted trees along Bandar coastal road', time: '1h ago',  reporter: 'Sheetal Naidu', phone: '+91-**-****-9921', upvotes: 4  },
    { id: 'REP005', lat: 17.6868, lng: 83.2185, type: 'Squall',     severity: 'Medium', status: 'Verified',  desc: 'High swells along RK Beach, fishing boats secured',         time: '6h ago',  reporter: 'Appala Raju',   phone: '+91-**-****-1141', upvotes: 18 }
  ],

  // ---- Alert Feed (Andhra Pradesh Only) ----
  alerts: [
    { id: 'ALT001', level: 'CRITICAL', type: 'Cyclone',     title: 'Severe Cyclone Landfall Warning',          time: '14:32', area: 'Andhra Pradesh Coastline',        confidence: 91, sources: ['IMD','NCMRWF','Satellite'], active: true },
    { id: 'ALT002', level: 'HIGH',     type: 'Flood',       title: 'Godavari Basin Danger Level Exceeded',     time: '13:15', area: 'Konaseema & East Godavari',       confidence: 96, sources: ['CWC','RFRC','Ground Station'], active: true },
    { id: 'ALT003', level: 'HIGH',     type: 'Storm Surge', title: 'Krishna Delta Inundation Warning',         time: '12:48', area: 'Krishna & Bapatla Coastal Belt',  confidence: 78, sources: ['INCOIS','Radar Data'],       active: true },
    { id: 'ALT004', level: 'MODERATE', type: 'Squall',      title: 'North Coastal Andhra Heavy Squall Watch',  time: '11:22', area: 'Visakhapatnam & Srikakulam',      confidence: 84, sources: ['IMD Cyclone Radar'],         active: true },
    { id: 'ALT005', level: 'INFO',     type: 'Heat Advisory',title: 'Rayalaseema Daytime Advisory',            time: '09:30', area: 'YSR Kadapa & Kurnool',            confidence: 88, sources: ['IMD'],                       active: false }
  ],

  // ---- Multi-Risk Data (Andhra Pradesh Risk Breakdown) ----
  multiRiskBreakdown: {
    labels: ['Cyclone','Flood','Storm Surge','Coastal Erosion','Heavy Squall','Heat Stress','Urban Waterlogging','Estuarine Breach'],
    affected: [148000, 112000, 48000, 22000, 34000, 25000, 18000, 14000],
    riskScores: [9.2, 8.8, 7.9, 6.8, 6.4, 5.2, 5.8, 7.1]
  },

  // ---- Historical Events (Andhra Pradesh Regional Disasters) ----
  historicalEvents: [
    { year: 2023, type: 'Cyclone',    name: 'Cyclone Michaung',     affected: 350000, state: 'Andhra Pradesh' },
    { year: 2022, type: 'Flood',      name: 'Godavari Flash Deluge',affected: 420000, state: 'Andhra Pradesh' },
    { year: 2018, type: 'Cyclone',    name: 'Cyclone Titli',        affected: 280000, state: 'Andhra Pradesh' },
    { year: 2014, type: 'Cyclone',    name: 'Cyclone Hudhud',       affected: 500000, state: 'Andhra Pradesh' },
    { year: 1990, type: 'Cyclone',    name: '1990 AP Super Cyclone',affected: 1000000,state: 'Andhra Pradesh' }
  ],

  // ---- Summary Stats ----
  summary: {
    activeHazards: 5,
    highRiskHabitations: 8,
    populationAtRisk: 142000,
    safeSiteCapacity: 34000,
    safeOccupancy: 6640,
    activeAlerts: 4,
    verifiedReports: 2,
    pendingReports: 3,
    overallRiskScore: 8.4
  }
};

// Weather simulation for Andhra Pradesh Coastal and Inland Sectors
const WEATHER_DATA = {
  'Coastal Andhra':     { temp: 31, feels: 37, humidity: 88, wind: 65, condition: 'Storm Surge', icon: '⛈️' },
  'Godavari Delta':     { temp: 29, feels: 35, humidity: 92, wind: 48, condition: 'Heavy Rain',  icon: '🌧️' },
  'North Coastal AP':   { temp: 28, feels: 33, humidity: 85, wind: 52, condition: 'Squall',      icon: '🌊' },
  'Krishna Basin':      { temp: 30, feels: 36, humidity: 82, wind: 38, condition: 'Rainy',       icon: '🌧️' },
  'Rayalaseema':        { temp: 34, feels: 38, humidity: 62, wind: 20, condition: 'Partly Cloudy',icon: '⛅' },
  'default':            { temp: 30, feels: 35, humidity: 80, wind: 35, condition: 'Advisory Active',icon: '🌦️' }
};

// ================================================================
// PHASE 2: DISASTER HISTORY SERVICE (Andhra Pradesh Locations Only)
// ================================================================
window.DisasterHistoryService = {
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
      const a = Math.sin(dLat/2)**2 + Math.cos(lat*Math.PI/180) * Math.cos(v.lat*Math.PI/180) * Math.sin(dLon/2)**2;
      const d = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
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
async function syncLiveDashboardState() {
  if (typeof fetch === 'undefined') return;
  try {
    const res = await fetch('/api/dashboard/state');
    if (res.ok) {
      const liveState = await res.json();
      if (liveState) {
        if (Array.isArray(liveState.alerts) && liveState.alerts.length > 0) {
          APP_DATA.alerts = liveState.alerts;
        }
        if (Array.isArray(liveState.activeHazards) && liveState.activeHazards.length > 0) {
          APP_DATA.activeHazards = liveState.activeHazards;
        }
        if (liveState.summary) {
          APP_DATA.summary = { ...APP_DATA.summary, ...liveState.summary };
        }
        if (Array.isArray(liveState.safeSites) && liveState.safeSites.length > 0) {
          APP_DATA.safeSites = liveState.safeSites;
        }
      }
    }
  } catch (e) {
    console.warn('[APP_DATA] Live sync notice:', e.message);
  }
}

if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', () => {
    syncLiveDashboardState();
  });
}

if (typeof window !== 'undefined') {
  window.APP_DATA = APP_DATA;
  window.syncLiveDashboardState = syncLiveDashboardState;
}
if (typeof global !== 'undefined') {
  global.APP_DATA = APP_DATA;
}

