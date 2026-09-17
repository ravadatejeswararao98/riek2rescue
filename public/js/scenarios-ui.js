/**
 * ================================================================
 * SCENARIOS-UI.JS — Multi-Hazard Scenario Selector & Map Synchronizer
 * ================================================================
 * RISK2RESCUE PLATFORM
 */

class ScenarioController {
  constructor() {
    this.scenarios = [];
    this.activeScenarioId = 'scenario-cyclone-vayu';
    this.init();
  }

  async init() {
    try {
      const res = await fetch('data/scenarios.json');
      if (res.ok) {
        this.scenarios = await res.json();
      }
    } catch (e) {
      console.warn("Could not load scenarios from data/scenarios.json:", e);
    }
  }

  openScenarioModal() {
    let modal = document.getElementById('teja-scenario-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'teja-scenario-modal';
      modal.className = 'modal-overlay';
      modal.style.display = 'flex';
      modal.style.zIndex = '10007';
      document.body.appendChild(modal);
    }

    modal.innerHTML = `
      <div class="modal-box" style="max-width: 680px;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
          <div>
            <h3 style="font-size:18px; font-weight:800; color:#f1f5f9; margin:0;">
              🌍 Select Hazard Simulation Scenario
            </h3>
            <p style="font-size:12px; color:#94a3b8; margin-top:2px;">
              Load pre-configured multi-hazard scenarios to test evacuation routing and command operations.
            </p>
          </div>
          <button style="background:none; border:none; color:#94a3b8; font-size:24px; cursor:pointer;" onclick="document.getElementById('teja-scenario-modal').remove()">&times;</button>
        </div>

        <div class="scenario-grid">
          ${(this.scenarios.length ? this.scenarios : this.getDefaultScenarios()).map(sc => `
            <div class="scenario-card ${sc.id === this.activeScenarioId ? 'active' : ''}" onclick="window.scenarioController.selectScenario('${sc.id}')">
              <div>
                <div style="display:flex; justify-content:space-between; align-items:center;">
                  <span style="font-size:11px; font-weight:700; color:#ef4444; text-transform:uppercase;">${sc.hazardType}</span>
                  <span class="risk-badge" style="font-size:10px;">${sc.severity}</span>
                </div>
                <h4 style="font-size:14px; font-weight:700; color:#fff; margin:6px 0 2px;">${sc.name}</h4>
                <div style="font-size:11px; color:#94a3b8;">📍 ${sc.region}</div>
              </div>
              <div style="display:flex; justify-content:space-between; margin-top:12px; font-size:11px; color:#cbd5e1; border-top:1px solid rgba(255,255,255,0.08); padding-top:8px;">
                <span>💨 ${sc.windGustsKmH} km/h</span>
                <span>🌊 ${sc.surgeMeters}m surge</span>
                <span>👥 ${(sc.populationImpacted / 1000).toFixed(0)}k at risk</span>
              </div>
            </div>
          `).join('')}
        </div>

        <div style="display:flex; justify-content:flex-end; gap:8px; margin-top:16px;">
          <button class="btn btn-glass" onclick="document.getElementById('teja-scenario-modal').remove()">Close</button>
        </div>
      </div>
    `;
  }

  selectScenario(id) {
    const sc = (this.scenarios.length ? this.scenarios : this.getDefaultScenarios()).find(s => s.id === id);
    if (!sc) return;

    this.activeScenarioId = id;

    // Pan Leaflet map to new center
    if (window.map && sc.center) {
      window.map.flyTo(sc.center, sc.zoom, { duration: 1.5 });
    }

    // Invalidate hazard cache and trigger full re-render for the selected scenario
    const engine = window.hazardEngine || window.authHazardEngine;
    if (engine) {
      const hazardKey = (sc.hazardType || 'cyclone').toLowerCase();
      engine.invalidateCache(hazardKey);
      engine.render(hazardKey, true);
    }

    // Update Topbar Weather and Risk Chip
    const cityEl = document.getElementById('chip-city');
    const windEl = document.getElementById('chip-wind');
    const tempEl = document.getElementById('chip-temp');
    const riskEl = document.getElementById('chip-risk');
    if (cityEl) cityEl.textContent = sc.region.split('/')[0].trim();
    if (windEl) windEl.textContent = `${sc.windGustsKmH} km/h`;
    if (tempEl) tempEl.textContent = sc.temperature;
    if (riskEl) {
      riskEl.textContent = `${sc.severity} ZONE`;
      riskEl.className = `windy-risk-chip ${sc.severity === 'CRITICAL' ? 'red' : 'orange'}`;
    }

    // Update Banner
    const banner = document.getElementById('citizen-emergency-banner');
    const bTitle = document.getElementById('cit-banner-title');
    const bMsg = document.getElementById('cit-banner-msg');
    if (banner && bTitle && bMsg && sc.activeAlerts && sc.activeAlerts.length) {
      banner.style.display = 'block';
      bTitle.textContent = sc.activeAlerts[0].title;
      bMsg.textContent = sc.activeAlerts[0].description;
    }

    // Close modal
    const modal = document.getElementById('teja-scenario-modal');
    if (modal) modal.remove();

    if (typeof showToast === 'function') {
      showToast(`Loaded Scenario: ${sc.name}`, "info");
    }

    // Automatically prompt or start drill
    if (window.simulationEngine) {
      window.simulationEngine.startDrill(sc);
    }
  }

  getDefaultScenarios() {
    return [
      {
        id: "scenario-cyclone-gulab",
        name: "Super Cyclone 'Gulab' (Cat 3 Coastal Landfall)",
        hazardType: "cyclone",
        region: "Kakinada Coast & Godavari Estuary, Andhra Pradesh",
        center: [16.9891, 82.2475],
        zoom: 11,
        severity: "CRITICAL",
        windGustsKmH: 145,
        surgeMeters: 3.4,
        temperature: "29°C",
        populationImpacted: 135000
      },
      {
        id: "scenario-godavari-delta-flood",
        name: "Godavari River Peak Delta Inundation",
        hazardType: "flood",
        region: "Konaseema & Amalapuram Delta, Andhra Pradesh",
        center: [16.5787, 82.0061],
        zoom: 11,
        severity: "EXTREME",
        windGustsKmH: 65,
        surgeMeters: 4.2,
        temperature: "27°C",
        populationImpacted: 185000
      },
      {
        id: "scenario-vizag-cyclone",
        name: "North-Coastal Cyclone Surge",
        hazardType: "cyclone",
        region: "Visakhapatnam & Bheemunipatnam Corridor, Andhra Pradesh",
        center: [17.6868, 83.2185],
        zoom: 11,
        severity: "CRITICAL",
        windGustsKmH: 155,
        surgeMeters: 3.8,
        temperature: "30°C",
        populationImpacted: 162000
      }
    ];
  }
}

// Global instance
if (typeof window !== 'undefined') {
  window.scenarioController = new ScenarioController();
}
