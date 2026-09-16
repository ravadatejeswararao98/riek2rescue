/**
 * RISK2RESCUE — OFFICIAL REFERENCE BASELINES (js/reference-data.js)
 * Tier: REFERENCE (Verified enumerated civil infrastructure & historical reference)
 * 
 * NOTE: These are NOT real-time telemetry. They are static civil registers
 * and geography defaults. Never label as "Live".
 */

(function(window) {
  'use strict';

  const REFERENCE_DATA = {
    // ---- Map Configuration (Focused on Andhra Pradesh) ----
    mapConfig: {
      center: [15.9129, 79.7400],
      zoom: 7,
      minZoom: 5,
      maxZoom: 18,
      sourceId: 'ap_boundary_polygon',
      tier: 'REFERENCE'
    },

    // ---- Registered Hospitals Directory (Andhra Pradesh Civil Register) ----
    hospitals: [
      { id: 'HOSP001', name: 'GGH Kakinada',                             lat: 16.9800, lng: 82.2400, beds: 1500, emergency: true, district: 'Kakinada', sourceId: 'ap_sdma_shelters', tier: 'REFERENCE' },
      { id: 'HOSP002', name: 'King George Hospital (KGH) Visakhapatnam', lat: 17.7088, lng: 83.3056, beds: 1200, emergency: true, district: 'Visakhapatnam', sourceId: 'ap_sdma_shelters', tier: 'REFERENCE' },
      { id: 'HOSP003', name: 'GGH Vijayawada',                           lat: 16.5120, lng: 80.6380, beds: 1000, emergency: true, district: 'NTR', sourceId: 'ap_sdma_shelters', tier: 'REFERENCE' },
      { id: 'HOSP004', name: 'RIMS Ongole',                              lat: 15.5120, lng: 80.0450, beds: 800,  emergency: true, district: 'Prakasam', sourceId: 'ap_sdma_shelters', tier: 'REFERENCE' },
      { id: 'HOSP005', name: 'SVIMS Tirupati',                           lat: 13.6380, lng: 79.4080, beds: 900,  emergency: true, district: 'Tirupati', sourceId: 'ap_sdma_shelters', tier: 'REFERENCE' },
      { id: 'HOSP006', name: 'District Hospital Rajahmundry',            lat: 17.0050, lng: 81.7820, beds: 650,  emergency: true, district: 'East Godavari', sourceId: 'ap_sdma_shelters', tier: 'REFERENCE' }
    ],

    // ---- Historical Events Catalog (Andhra Pradesh Regional Disasters) ----
    historicalEvents: [
      { year: 2023, type: 'Cyclone', name: 'Cyclone Michaung', affected: 350000, state: 'Andhra Pradesh', tier: 'HISTORICAL' },
      { year: 2022, type: 'Flood',   name: 'Godavari Flash Deluge', affected: 420000, state: 'Andhra Pradesh', tier: 'HISTORICAL' },
      { year: 2018, type: 'Cyclone', name: 'Cyclone Titli', affected: 280000, state: 'Andhra Pradesh', tier: 'HISTORICAL' },
      { year: 2014, type: 'Cyclone', name: 'Cyclone Hudhud', affected: 500000, state: 'Andhra Pradesh', tier: 'HISTORICAL' },
      { year: 1990, type: 'Cyclone', name: '1990 AP Super Cyclone', affected: 1000000, state: 'Andhra Pradesh', tier: 'HISTORICAL' }
    ]
  };

  // Disaster History Lookup Service
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

  window.REFERENCE_DATA = REFERENCE_DATA;
  window.DisasterHistoryService = DisasterHistoryService;
})(typeof window !== 'undefined' ? window : global);
