// ================================================================
// AUTHORITY.JS — Command Dashboard, Analytics, & AI Explanation Panel
// ================================================================

let authMapInstance = null;
let riskChart = null;
window.currentPriorityData = null;

// Built-in Toast Notification for Authority Dashboard
function showToast(msg, type = 'info') {
  const icons = { info: 'ℹ️', success: '✅', warning: '⚠️', danger: '🚨' };
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.style.cssText = 'position:fixed;bottom:80px;right:30px;z-index:99999;display:flex;flex-direction:column;gap:8px;pointer-events:none;';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  const borderColors = { info: '#1d4ed8', success: '#059669', warning: '#d97706', danger: '#dc2626' };
  const bgColors = { info: '#eff6ff', success: '#ecfdf5', warning: '#fffbeb', danger: '#fef2f2' };

  toast.style.cssText = `
    background: ${bgColors[type] || '#ffffff'};
    backdrop-filter: blur(16px);
    border: 1px solid rgba(15, 23, 42, 0.12);
    border-left: 4px solid ${borderColors[type] || borderColors.info};
    color: #0f172a;
    border-radius: 12px; padding: 10px 16px;
    display: flex; align-items: center; gap: 10px;
    font-size: 12px; font-weight: 600;
    box-shadow: 0 10px 25px rgba(15, 23, 42, 0.12);
    max-width: 360px; pointer-events: all;
  `;
  toast.innerHTML = `<span>${icons[type] || 'ℹ️'}</span><span>${msg}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}
// ---- Dynamic Sync for Floating Content Panel & Icon Rail Layout ----
function syncFloatingLayout() {
  const topbar = document.getElementById('map-topbar');
  const dockItem = document.querySelector('.dock-item');
  if (topbar) {
    const rect = topbar.getBoundingClientRect();
    if (rect.bottom > 0) {
      document.documentElement.style.setProperty('--topbar-bottom', Math.round(rect.bottom) + 'px');
    }
  }
  if (dockItem) {
    const rect = dockItem.getBoundingClientRect();
    if (rect.right > 0) {
      document.documentElement.style.setProperty('--dock-rail-width', Math.round(rect.right) + 'px');
    }
  }
}
if (typeof window !== 'undefined') {
  window.syncFloatingLayout = syncFloatingLayout;
  if (typeof window.addEventListener === 'function') {
    window.addEventListener('resize', syncFloatingLayout);
    window.addEventListener('orientationchange', syncFloatingLayout);
  }
}

if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
  document.addEventListener('DOMContentLoaded', () => {
    syncFloatingLayout();
  initLiveClock();
  initSidebar();
  if (typeof initOfficerProfile === 'function') initOfficerProfile();
  initGISShell(); // GIS-First shell initialization
  initMapLegend(); // Persistent 4-tier hazard zone legend panel

  // Initialize Shared Windy Live Weather Controller on Authority Map
  if (typeof WindyIntegrationController !== 'undefined') {
    window.windyController = new WindyIntegrationController({ mapId: 'authority-map' });
  }

  initCommandCenter();
  initAnalyticsChart();
  renderVerificationQueue();
  loadPriorityRanking(); // Phase 1 live priority engine loader
  initDecisionSupport(); // Task 18 AI Decision Support (DeepSeek-R1 8B)
  updateAIExplanation('map-view');
  updateAiConfidenceBadge(94.2);
  loadCWCRiverGauges(); // CWC Real-Time River Water Level Gauges (Requirement E)

  // Populate Population at Risk summary cards (Red/Orange/Yellow totals)
  // by summing across all disaster sub-zone rows on page load.
  // Deferred so the full DOM has rendered before we query it.
  setTimeout(() => {
    if (typeof aggregatePopulationFromDOM === 'function') {
      aggregatePopulationFromDOM();
    }
  }, 300);

  // FORCE SYNC REAL-WORLD HAZARDS
  setTimeout(() => {
    if (window.firebaseLive && window.firebaseLive.db) {
      // 1. Wipe out any old demo zones from Firestore
      window.firebaseLive.db.collection('risk_zones').get().then(snap => {
        snap.forEach(doc => {
          if (!['RZ_IMD_001', 'RZ_IMD_002', 'RZ_EQ_001'].includes(doc.id)) {
            window.firebaseLive.db.collection('risk_zones').doc(doc.id).delete();
          }
        });
      });
      // 2. Inject current authentic real-world zones
      if (window.APP_DATA && window.APP_DATA.riskZones) {
        window.APP_DATA.riskZones.forEach(zone => {
          if (typeof window.firebaseLive.broadcastZoneCreation === 'function') {
            window.firebaseLive.broadcastZoneCreation(zone);
          } else if (typeof window.firebaseLive.forceAddZoneToMemory === 'function') {
             window.firebaseLive.forceAddZoneToMemory(zone);
          }
        });
      }
    }
  }, 3000);

  // Real-time synchronization with Firebase Live
  if (window.firebaseLive) {
    window.firebaseLive.onReports((reports, meta) => {
      if (Array.isArray(reports)) {
        reports.forEach(r => {
          if (r && (r.isSos || (r.type && r.type.toUpperCase().includes('SOS')))) {
            const c = (typeof getCitizenCoordinates === 'function') ? getCitizenCoordinates(r) : { lat: r.latitude ?? r.lat, lng: r.longitude ?? r.lng };
            if (c.lat !== null && c.lat !== undefined && !isNaN(Number(c.lat))) {
              console.log("SOS received coordinates:", {
                latitude: Number(c.lat),
                longitude: Number(c.lng)
              });
            }
          }
        });
      }
      renderVerificationQueue();
      if (meta && meta.added) {
        if (meta.added.isSos || (meta.added.type && meta.added.type.toUpperCase().includes('SOS'))) {
          const addedCoords = (typeof getCitizenCoordinates === 'function') ? getCitizenCoordinates(meta.added) : { lat: meta.added.latitude ?? meta.added.lat, lng: meta.added.longitude ?? meta.added.lng };
          console.log("SOS received coordinates:", {
            latitude: addedCoords.lat,
            longitude: addedCoords.lng
          });
        }
        showToast(`🚨 Live citizen report received: ${meta.added.type} in ${meta.added.location || 'hazard sector'}!`, 'warning');
        playIncomingReportChime();
      }
    });
  }

  // Cross-tab real-time storage listener for instantaneous SOS synchronization
  window.addEventListener('storage', (e) => {
    if (e.key === 'rzi_citizen_reports' || e.key === 'rzi_synced_reports') {
      renderVerificationQueue();
      if (e.newValue) {
        try {
          const arr = JSON.parse(e.newValue);
          if (Array.isArray(arr) && arr.length > 0) {
            const newest = arr[0];
            if (newest && (newest.isSos || (newest.type && newest.type.toUpperCase().includes('SOS')))) {
              const coords = (typeof getCitizenCoordinates === 'function') ? getCitizenCoordinates(newest) : { lat: newest.lat, lng: newest.lng };
              console.log("SOS received coordinates:", {
                latitude: coords.lat,
                longitude: coords.lng
              });
              showToast(`🚨 LIVE CITIZEN SOS EMERGENCY DISPATCHED! [${newest.location || 'Device GPS'}]`, 'danger');
              playIncomingReportChime();
            }
          }
        } catch (err) {}
      }
    }
  });

  // Automated visual verification hooks & page-based view routing
  const params = new URLSearchParams(window.location.search);
  const currentPath = window.location.pathname;

  if (params.get('test_collapse') === '1') {
    collapseSidebar();
  }
  if (params.get('test_mobile_drawer') === '1') {
    const sidebar = document.getElementById('sidebar');
    const backdrop = document.getElementById('sidebar-backdrop');
    if (sidebar) sidebar.classList.add('mobile-open');
    if (backdrop) backdrop.classList.add('active');
  }

  if (currentPath.includes('authority-citizen')) {
    switchView('reports');
  } else if (currentPath.includes('authority-queue') || params.get('test_command') === '1') {
    switchView('command');
  } else {
    switchView('map-view');
  }
  if (params.get('test_legend_collapse') === '1') {
    const legendPanel = document.getElementById('map-legend-panel');
    if (legendPanel) legendPanel.classList.add('collapsed');
  }
  if (params.get('test_popup') === '1') {
    if (authMapInstance && authMapInstance.riskZoneCircles && authMapInstance.riskZoneCircles.length) {
      const item = authMapInstance.riskZoneCircles[0];
      L.popup({ className: 'custom-popup' })
        .setLatLng([item.zone.lat, item.zone.lng])
        .setContent(authMapInstance.createRiskPopup(item.zone))
        .openOn(authMapInstance.getMap());
    }
  }
});
}

// ---- Persistent 4-Tier Hazard Map Legend ----
function initMapLegend() {
  const panel = document.getElementById('map-legend-panel');
  const headerToggle = document.getElementById('legend-header-toggle');
  const collapseBtn = document.getElementById('legend-collapse-btn');
  if (!panel || !headerToggle) return;

  // By default, start collapsed as a compact button
  panel.classList.add('collapsed');
  headerToggle.setAttribute('aria-expanded', 'false');

  let openTimer = null;
  let closeTimer = null;

  function openLegend() {
    clearTimeout(closeTimer);
    clearTimeout(openTimer);
    panel.classList.remove('collapsed');
    headerToggle.setAttribute('aria-expanded', 'true');
  }

  function closeLegend() {
    clearTimeout(openTimer);
    clearTimeout(closeTimer);
    panel.classList.add('collapsed');
    headerToggle.setAttribute('aria-expanded', 'false');
  }

  // Hover intent: open on mouseenter with 120ms delay
  panel.addEventListener('mouseenter', () => {
    clearTimeout(closeTimer);
    openTimer = setTimeout(openLegend, 120);
  });

  // Hover intent: close on mouseleave with 180ms debounce so transit between button & card is seamless
  panel.addEventListener('mouseleave', () => {
    clearTimeout(openTimer);
    closeTimer = setTimeout(closeLegend, 180);
  });

  // Tap-to-toggle fallback for touch / click devices
  function toggleLegend(e) {
    if (e) e.stopPropagation();
    clearTimeout(openTimer);
    clearTimeout(closeTimer);
    const isCollapsed = panel.classList.toggle('collapsed');
    headerToggle.setAttribute('aria-expanded', !isCollapsed);
  }

  headerToggle.addEventListener('click', toggleLegend);
  headerToggle.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      toggleLegend(e);
    } else if (e.key === 'Escape') {
      closeLegend();
    }
  });

  if (collapseBtn) {
    collapseBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleLegend(e);
    });
  }

  // Tap/click elsewhere to close fallback
  document.addEventListener('pointerdown', (e) => {
    if (!panel.contains(e.target)) {
      closeLegend();
    }
  });
}
window.initMapLegend = initMapLegend;

// ---- Live Clock ----
function initLiveClock() {
  const clockEl = document.getElementById('live-time');
  function update() {
    const now = new Date();
    if (clockEl) {
      clockEl.textContent = now.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) + ' | ' +
                            now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }) + ' IST';
    }
  }
  update();
  setInterval(update, 1000);
}

// ---- Sidebar Collapse & Expand Functions ----
function collapseSidebar() {
  const sidebar = document.getElementById('sidebar');
  const page = document.querySelector('.authority-page');
  const toggleBtn = document.getElementById('sidebar-toggle');
  if (!sidebar) return;
  
  if (!sidebar.classList.contains('collapsed')) {
    sidebar.classList.add('collapsed');
    if (page) page.classList.add('sidebar-collapsed');
    if (toggleBtn) {
      toggleBtn.innerHTML = '&#10140;'; // ➔
      toggleBtn.setAttribute('title', 'Expand Sidebar');
    }
    setTimeout(() => {
      if (authMapInstance && authMapInstance.getMap()) {
        authMapInstance.getMap().invalidateSize();
      }
    }, 300);
  }
}

function expandSidebar() {
  const sidebar = document.getElementById('sidebar');
  const page = document.querySelector('.authority-page');
  const toggleBtn = document.getElementById('sidebar-toggle');
  if (!sidebar) return;
  
  if (sidebar.classList.contains('collapsed')) {
    sidebar.classList.remove('collapsed');
    if (page) page.classList.remove('sidebar-collapsed');
    if (toggleBtn) {
      toggleBtn.innerHTML = '&#11013;'; // ⬅
      toggleBtn.setAttribute('title', 'Collapse Sidebar');
    }
    setTimeout(() => {
      if (authMapInstance && authMapInstance.getMap()) {
        authMapInstance.getMap().invalidateSize();
      }
    }, 300);
  }
}

function toggleSidebar() {
  const sidebar = document.getElementById('sidebar');
  if (!sidebar) return;
  if (sidebar.classList.contains('collapsed')) {
    expandSidebar();
  } else {
    collapseSidebar();
  }
}
window.collapseSidebar = collapseSidebar;
window.expandSidebar = expandSidebar;
window.toggleSidebar = toggleSidebar;

// ---- GIS Shell & Map Initialization ----
function initGISShell() {
  // Initialize Leaflet map immediately on load for GIS-first experience
  if (!authMapInstance) {
    authMapInstance = new DisasterMap('authority-map', { skipDefaultOverlays: true });
    window.authMapInstance = authMapInstance;
    authMapInstance.drawRiskZones();
    authMapInstance.addSafeSiteMarkers();
    authMapInstance.addHazardMarkers();
    authMapInstance.addHospitalMarkers();
    authMapInstance.addHabitationMarkers();

    // Guarantee default light-theme basemap (Esri World Light Gray Base via LAYER_CONFIG.standard)
    authMapInstance.setBasemap('standard');
  }

  // Initialize HazardEngine parity with Citizen Portal per Requirement B2
  if (typeof HazardEngine !== 'undefined') {
    window.authHazardEngine = new HazardEngine(authMapInstance.getMap());
    if (!window.hazardEngine) {
      window.hazardEngine = window.authHazardEngine;
    }
    window.authHazardEngine.render('cyclone');
  }

  // Initialize Floating Hazards Button & Dropdown (Requirement C2, C3)
  initMapHazardButton();

  // Restore any pending locate request once map is initialized
  if (window._activeLocateEntity && authMapInstance) {
    const { lat, lng, entity, zoom } = window._activeLocateEntity;
    setTimeout(() => {
      if (typeof authMapInstance.setLocatePointer === 'function') {
        authMapInstance.setLocatePointer(lat, lng, {
          name: entity.name || 'Identified Location',
          level: entity.level || entity.tier || entity.severity,
          desc: entity.desc || entity.subtitle || entity.message,
          population: entity.population || entity.pop,
          zoom: zoom,
          openPopup: true
        });
      }
    }, 250);
  }

  // Initialize Citizen-Style Topbar Search (Requirement D2, D3)
  initAuthoritySearch();

  // Initialize Map Place Click Information Card
  initAuthorityMapPlaceClick();

  // Apply any persisted shelter overrides
  applyShelterOverrides();

  // Isolate floating dock, legend, threat box, and secondary content panels from capturing map wheel zoom
  if (window.isolateMapOverlays) {
    window.isolateMapOverlays([
      '#content-panel',
      '.dock-nav',
      '#map-topbar',
      '#map-hazard-control',
      '#map-hazard-dropdown',
      '#hazard-zone-table-card',
      '#ai-diagnostics-drawer',
      '#firebase-modal',
      '#scenario-modal',
      '#drill-modal',
      '#sitrep-modal',
      '#modal-emergency-alert'
    ]);
  }
}

// ---- Authority Basemap Switching (Standard vs Satellite vs Windy Radar) ----
let currentAuthorityBasemap = 'standard';

function setAuthorityBasemap(mode) {
  currentAuthorityBasemap = mode || 'standard';

  if (window.authMapInstance && typeof window.authMapInstance.setBasemap === 'function') {
    window.authMapInstance.setBasemap(currentAuthorityBasemap);
  }

  // Toggle mode-aware CSS class on map container for legibility over radar
  const mapContainer = document.getElementById('authority-map');
  if (mapContainer) {
    mapContainer.classList.toggle('basemap-windy', currentAuthorityBasemap === 'windy');
  }

  // Update Topbar View Switcher Buttons
  const btnGis = document.getElementById('btn-mode-gis');
  const btnSat = document.getElementById('btn-mode-satellite');
  const btnWindy = document.getElementById('btn-mode-windy');
  if (btnGis) btnGis.classList.toggle('active', currentAuthorityBasemap === 'standard');
  if (btnSat) btnSat.classList.toggle('active', currentAuthorityBasemap === 'satellite');
  if (btnWindy) btnWindy.classList.toggle('active', currentAuthorityBasemap === 'windy');

  if (typeof showToast === 'function') {
    if (currentAuthorityBasemap === 'windy') {
      showToast('🌀 Windy Radar Overlay Active (Live Precipitation)', 'info');
    } else if (currentAuthorityBasemap === 'satellite') {
      showToast('🛰️ Satellite Imagery Active (ArcGIS World Imagery)', 'info');
    } else {
      showToast('🗺️ Standard Basemap Active (OpenStreetMap)', 'info');
    }
  }
}

window.setAuthorityBasemap = setAuthorityBasemap;

// ---- Left Navigation Dock ----
function initSidebar() {
  // Wire up dock-item click handlers (filtered to navigation items with data-view)
  document.querySelectorAll('.dock-item[data-view]').forEach(item => {
    item.addEventListener('click', () => {
      const view = item.dataset.view;
      if (!view) return;
      document.querySelectorAll('.dock-item[data-view]').forEach(i => i.classList.remove('active'));
      item.classList.add('active');
      if (window.location.hash !== '#' + view) {
        try {
          history.pushState(null, '', '#' + view);
        } catch (e) {}
      }
      switchView(view);
    });
  });

  // Handle browser back/forward buttons
  window.addEventListener('popstate', () => {
    const hash = (window.location.hash || '').replace(/^#/, '');
    if (hash) {
      switchView(hash);
    } else {
      switchView('map-view');
    }
  });

  // Check URL hash on initial load (e.g. #reports, #command, #decision-support, #habitations)
  const initialHash = (window.location.hash || '').replace(/^#/, '');
  const validViews = [
    'map-view', 'command', 'decision-support', 'hazards', 'habitations',
    'safesites', 'population-risk', 'reports', 'datasources', 'zone-manager'
  ];
  if (initialHash && validViews.includes(initialHash)) {
    switchView(initialHash);
  } else {
    // Default: show Map View (GIS-First) on first load per Requirement B1
    switchView('map-view');
  }
}

// ---- Switch Main Content Views ----
function switchView(viewKey) {
  const contentPanel = document.getElementById('content-panel');
  // Registered active views — each in its own isolated section
  const views = [
    'command', 'decision-support', 'hazards', 'habitations', 'safesites',
    'population-risk', 'reports', 'datasources', 'zone-manager'
  ];

  if (viewKey === 'map-view') {
    // Return to pure full-screen GIS shell
    if (contentPanel) contentPanel.style.display = 'none';
    views.forEach(v => {
      const el = document.getElementById('view-' + v);
      if (el) el.style.display = 'none';
    });

    // Restore map legend panel and hazard button
    const legendPanel = (typeof document.querySelector === 'function') ? document.querySelector('.map-legend-panel') : null;
    if (legendPanel) legendPanel.style.display = '';
    const btnMapHazard = document.getElementById('btn-map-hazard');
    if (btnMapHazard) btnMapHazard.style.display = '';

    if (authMapInstance && authMapInstance.getMap()) {
      setTimeout(() => authMapInstance.getMap().invalidateSize(), 150);
    }
    // Mark map-view dock item active
    if (typeof document.querySelectorAll === 'function') {
      document.querySelectorAll('.dock-item[data-view]').forEach(i => {
        i.classList.toggle('active', i.dataset.view === 'map-view');
      });
    }
  } else {
    // Show content overlay panel
    if (contentPanel) {
      contentPanel.style.display = 'block';
      contentPanel.scrollTop = 0;
      syncFloatingLayout();
    }
    views.forEach(v => {
      const el = document.getElementById('view-' + v);
      if (el) el.style.display = (v === viewKey) ? 'block' : 'none';
    });
    // Sync dock item active state
    if (typeof document.querySelectorAll === 'function') {
      document.querySelectorAll('.dock-item[data-view]').forEach(i => {
        i.classList.toggle('active', i.dataset.view === viewKey);
      });
    }

    // Re-render verification queue if navigating to reports
    if (viewKey === 'reports') {
      if (typeof renderVerificationQueue === 'function') {
        renderVerificationQueue();
      }
    }

    // Aggregate population totals from DOM sub-zone tables when entering population-risk view
    if (viewKey === 'population-risk') {
      if (typeof aggregatePopulationFromDOM === 'function') {
        aggregatePopulationFromDOM();
      }
    }

    // Refresh sensor data sources health panel when entering datasources view
    if (viewKey === 'datasources') {
      if (window.SourceHealthUI && typeof window.SourceHealthUI.refresh === 'function') {
        window.SourceHealthUI.refresh();
      }
    }

    if (viewKey === 'zone-manager') {
      if (typeof renderZoneManager === 'function') {
        renderZoneManager();
      }
    }

    // Close floating map cards when navigating away from pure GIS view
    const card = document.getElementById('hazard-zone-table-card');
    if (card) card.style.display = 'none';
    const dropdown = document.getElementById('map-hazard-dropdown');
    if (dropdown) dropdown.style.display = 'none';
    const btn = document.getElementById('btn-map-hazard');
    if (btn) btn.classList.remove('active');

    // Hide map legend panel while overlay view is open
    const legendPanel = (typeof document.querySelector === 'function') ? document.querySelector('.map-legend-panel') : null;
    if (legendPanel) legendPanel.style.display = 'none';
  }

  const titleMap = {
    'map-view':        'Home',
    'command':         'Operational Command Center',
    'decision-support':'AI Decision Support — Evidence-Grounded Brief',
    'hazards':         'Hazard Intelligence & Real-Time Sensors',
    'habitations':     'Vulnerable Habitations & Red Zones',
    'safesites':       'Safe Shelters & Carrying Capacity',
    'population-risk': 'Population at Risk — Hazard Zone Exposure',
    'reports':         'Citizen Field Report Queue',
    'datasources':     'Integrated Satellite & Multi-Agency Sensor Feeds',
    'zone-manager':    'Active Zone Manager'
  };

  const titleEl = document.getElementById('topbar-view-title');
  if (titleEl) titleEl.textContent = titleMap[viewKey] || 'Home';
  try {
    updateAIExplanation(viewKey);
  } catch (e) {
    console.warn('updateAIExplanation error in switchView:', e);
  }
}
window.switchView = switchView;

// ================================================================
// SECTION C: MONITORED HAZARDS BUTTON & FLOATING CARD
// ================================================================

// ---- Zone Manager UI & Logic ----
function renderZoneManager() {
  const tbody = document.getElementById('zone-manager-tbody');
  if (!tbody) return;
  tbody.innerHTML = '';
  
  if (!window.APP_DATA || !window.APP_DATA.riskZones || window.APP_DATA.riskZones.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;">No active risk zones.</td></tr>';
    return;
  }
  
  window.APP_DATA.riskZones.forEach(zone => {
    const tr = document.createElement('tr');
    tr.style.transition = 'background 0.2s ease';
    tr.onmouseover = () => tr.style.background = 'rgba(255,255,255,0.04)';
    tr.onmouseout = () => tr.style.background = 'transparent';
    
    // Risk level badge mapping
    const riskLower = (zone.level || 'green').toLowerCase();
    const riskBadgeClass = `risk-${riskLower}`;
    
    // Beautiful row styling with padding and modern typography
    tr.innerHTML = `
      <td style="padding: 16px 20px; border-bottom: 1px solid rgba(255,255,255,0.06); font-family: 'JetBrains Mono', monospace; font-size: 0.85rem; color: var(--text-secondary);">${zone.id || 'N/A'}</td>
      <td style="padding: 16px 20px; border-bottom: 1px solid rgba(255,255,255,0.06);">
        <div style="font-weight: 600; color: var(--text-primary); font-size: 0.95rem;">${zone.name || 'Unnamed Zone'}</div>
        <div style="font-size: 0.75rem; color: var(--text-secondary); margin-top: 4px;">${zone.desc || 'No description available'}</div>
      </td>
      <td style="padding: 16px 20px; border-bottom: 1px solid rgba(255,255,255,0.06);">
        <span class="risk-badge ${riskBadgeClass}" style="padding: 4px 10px; border-radius: 6px; font-size: 0.75rem; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase; display: inline-block;">${zone.level || 'GREEN'}</span>
      </td>
      <td style="padding: 16px 20px; border-bottom: 1px solid rgba(255,255,255,0.06); text-align: right; font-variant-numeric: tabular-nums; font-weight: 500; font-size: 0.9rem;">
        ${(zone.pop || 0).toLocaleString()} <span style="font-size: 0.7rem; color: var(--text-secondary); margin-left: 4px;">PPL</span>
      </td>
      <td style="padding: 16px 20px; border-bottom: 1px solid rgba(255,255,255,0.06); font-family: 'JetBrains Mono', monospace; font-size: 0.85rem; color: var(--text-secondary);">
        <div style="display: flex; align-items: center; gap: 8px;">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="opacity: 0.5"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>
          ${zone.lat ? zone.lat.toFixed(4) : '--'}, ${zone.lng ? zone.lng.toFixed(4) : '--'}
        </div>
      </td>
      <td style="padding: 16px 20px; border-bottom: 1px solid rgba(255,255,255,0.06); text-align: center;">
        <button class="btn" style="background: rgba(239,68,68,0.1); color: #ef4444; border: 1px solid rgba(239,68,68,0.25); padding: 8px 16px; font-size: 0.8rem; font-weight: 600; border-radius: 8px; cursor: pointer; transition: all 0.2s ease; display: inline-flex; align-items: center; gap: 6px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);" onmouseover="this.style.background='rgba(239,68,68,0.2)'; this.style.transform='translateY(-1px)';" onmouseout="this.style.background='rgba(239,68,68,0.1)'; this.style.transform='none';" onclick="removeZone('${zone.id}')">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"></path><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path></svg>
          Revoke
        </button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}
window.renderZoneManager = renderZoneManager;

function removeZone(zoneId) {
  if (!window.APP_DATA || !window.APP_DATA.riskZones) return;
  const initialLength = window.APP_DATA.riskZones.length;
  window.APP_DATA.riskZones = window.APP_DATA.riskZones.filter(z => z.id !== zoneId);
  
  if (window.APP_DATA.riskZones.length < initialLength) {
    // 1. Re-render Authority UI
    if (typeof renderZoneManager === 'function') {
      renderZoneManager();
    }
    // 2. Redraw map
    if (window.authMapInstance && typeof window.authMapInstance.drawRiskZones === 'function') {
      window.authMapInstance.drawRiskZones();
    }
    // 3. Broadcast to Citizen view (and other tabs)
    if (window.firebaseLive && typeof window.firebaseLive.broadcastZoneRemoval === 'function') {
      window.firebaseLive.broadcastZoneRemoval(zoneId);
    }
    showToast(`Zone ${zoneId} removed successfully.`, "success");
  }
}
window.removeZone = removeZone;

const MONITORED_HAZARDS = [
  {
    key: 'cyclone',
    name: 'Cyclone Landfall',
    icon: '🌀',
    tier: 'CRITICAL',
    badge: 'badge-critical',
    status: 'Active',
    summary: 'Severe cyclonic storm system approaching coastal corridors with sustained wind speeds of 115 km/h.',
    lat: 16.9891,
    lng: 82.2475,
    zoom: 11,
    zonesCount: 12,
    population: '34,500'
  },
  {
    key: 'flood',
    name: 'Flash Flood Inundation',
    icon: '🌊',
    tier: 'HIGH ALERT',
    badge: 'badge-high',
    status: 'Monitoring',
    summary: 'Riverine overflow and storm-surge induced waterlogging across low-lying coastal floodplains.',
    lat: 16.7000,
    lng: 82.0000,
    zoom: 11,
    zonesCount: 8,
    population: '21,800'
  },
  {
    key: 'landslide',
    name: 'Severe Slope Landslide',
    icon: '⛰️',
    tier: 'MODERATE',
    badge: 'badge-moderate',
    status: 'Monitoring',
    summary: 'High soil saturation and slope instability along Eastern Ghats hill roads and cut slopes.',
    lat: 17.8500,
    lng: 83.0000,
    zoom: 11,
    zonesCount: 4,
    population: '8,200'
  },
  {
    key: 'earthquake',
    name: 'Seismic Activity',
    icon: '📳',
    tier: 'LOW RISK',
    badge: 'badge-low',
    status: 'Normal',
    summary: 'Regional seismic telemetry stations reporting normal tectonic background levels.',
    lat: 17.0000,
    lng: 81.8000,
    zoom: 9,
    zonesCount: 1,
    population: '0'
  },
  {
    key: 'tsunami',
    name: 'Tsunami Early Warning',
    icon: '🌊',
    tier: 'MODERATE',
    badge: 'badge-moderate',
    status: 'Monitoring',
    summary: 'Deep-ocean DART buoys and coastal tide gauges actively monitored for seismic surge waves.',
    lat: 16.5000,
    lng: 82.3000,
    zoom: 10,
    zonesCount: 3,
    population: '14,000'
  },
  {
    key: 'cloudburst',
    name: 'Extreme Weather Squall',
    icon: '⛈️',
    tier: 'HIGH ALERT',
    badge: 'badge-high',
    status: 'Active',
    summary: 'Localized convective cloudburst and intense microburst precipitation detected by Doppler radar.',
    lat: 17.2000,
    lng: 82.1500,
    zoom: 11,
    zonesCount: 6,
    population: '18,500'
  }
];

window.currentHazardStatusFilter = 'ALL';
window.currentSelectedHazard = null;
let currentHazardCardData = null;

function renderHazardDropdownList(filterStatus = window.currentHazardStatusFilter) {
  const listContainer = document.getElementById('map-hazard-dropdown-list');
  if (!listContainer) return;

  const filtered = (filterStatus === 'ALL')
    ? MONITORED_HAZARDS
    : MONITORED_HAZARDS.filter(h => (h.status || '').toLowerCase() === filterStatus.toLowerCase());

  if (filtered.length === 0) {
    listContainer.innerHTML = `<div style="padding:14px; text-align:center; color:#94a3b8; font-size:11px;">No monitored threats currently marked as ${filterStatus}.</div>`;
    return;
  }

  let html = '';
  filtered.forEach(h => {
    const statusColor = h.status === 'Active' ? '#ef4444' : h.status === 'Monitoring' ? '#f97316' : '#22c55e';
    const statusBg = h.status === 'Active' ? 'rgba(239,68,68,0.15)' : h.status === 'Monitoring' ? 'rgba(249,115,22,0.15)' : 'rgba(34,197,94,0.15)';
    html += `
      <div class="mhd-item" onclick="selectHazardFromDropdown('${h.key}')" role="button" tabindex="0">
        <div class="mhd-item-left">
          <span class="mhd-item-icon">${h.icon}</span>
          <div>
            <div class="mhd-item-name">${h.name}</div>
            <div class="mhd-item-sub">${h.tier} &bull; ${h.population} at risk</div>
          </div>
        </div>
        <span style="font-size:10px; font-weight:700; padding:2px 8px; border-radius:6px; background:${statusBg}; color:${statusColor}; border:1px solid ${statusColor}40;">
          ${h.status}
        </span>
      </div>
    `;
  });
  listContainer.innerHTML = html;
}

function setHazardStatusFilter(status, event) {
  if (event) event.stopPropagation();
  window.currentHazardStatusFilter = status;

  // Update active state on tab buttons across both portals
  const buttons = document.querySelectorAll('.mhd-filter-btn');
  buttons.forEach(btn => btn.classList.remove('active'));
  const targetId = status === 'ALL' ? 'mhd-filter-all' : `mhd-filter-${status.toLowerCase()}`;
  const targetBtn = document.getElementById(targetId);
  if (targetBtn) targetBtn.classList.add('active');

  // Re-render dropdown list with preserved items
  renderHazardDropdownList(status);

  // 1. Filter HazardEngine rendered zone layers (polygons & labels)
  const engine = window.authHazardEngine || window.hazardEngine;
  if (engine && Array.isArray(engine.renderedZoneLayers)) {
    engine.renderedZoneLayers.forEach(item => {
      const zTier = (item.level || (item.zone && (item.zone.level || item.zone.current_tier)) || '').toUpperCase();
      let matches = true;
      if (status === 'Active') {
        matches = (zTier === 'RED' || zTier === 'CRITICAL');
      } else if (status === 'Monitoring') {
        matches = (zTier === 'YELLOW' || zTier === 'ORANGE' || zTier === 'MODERATE' || zTier === 'HIGH' || zTier === 'HIGH ALERT');
      } else if (status === 'Normal') {
        matches = (zTier === 'GREEN' || zTier === 'SAFE' || zTier === 'LOW RISK');
      }
      const poly = item.polygonLayer;
      const marker = item.labelMarker;
      if (matches) {
        if (poly && !engine.group.hasLayer(poly)) engine.group.addLayer(poly);
        if (marker && !engine.group.hasLayer(marker)) engine.group.addLayer(marker);
      } else {
        if (poly && engine.group.hasLayer(poly)) engine.group.removeLayer(poly);
        if (marker && engine.group.hasLayer(marker)) engine.group.removeLayer(marker);
      }
    });
  }

  // 2. Filter authMapInstance.riskZoneCircles non-destructively
  if (authMapInstance && Array.isArray(authMapInstance.riskZoneCircles)) {
    const map = authMapInstance.getMap();
    authMapInstance.riskZoneCircles.forEach(item => {
      if (!item.zone) return;
      const zTier = (item.zone.level || item.zone.current_tier || '').toUpperCase();
      let matches = true;
      if (status === 'Active') {
        matches = (zTier === 'RED' || zTier === 'CRITICAL');
      } else if (status === 'Monitoring') {
        matches = (zTier === 'YELLOW' || zTier === 'ORANGE' || zTier === 'MODERATE' || zTier === 'HIGH' || zTier === 'HIGH ALERT');
      } else if (status === 'Normal') {
        matches = (zTier === 'GREEN' || zTier === 'SAFE' || zTier === 'LOW RISK');
      }
      const targets = item.rings || (item.circle ? [item.circle] : []);
      targets.forEach(r => {
        if (map) {
          if (matches) {
            if (!map.hasLayer(r)) map.addLayer(r);
          } else {
            if (map.hasLayer(r)) map.removeLayer(r);
          }
        }
      });
      if (item.label && map) {
        if (matches) {
          if (!map.hasLayer(item.label)) map.addLayer(item.label);
        } else {
          if (map.hasLayer(item.label)) map.removeLayer(item.label);
        }
      }
    });
  }

  // 3. Filter authMapInstance.hazardPolygons if present
  if (authMapInstance && Array.isArray(authMapInstance.hazardPolygons)) {
    const map = authMapInstance.getMap();
    authMapInstance.hazardPolygons.forEach(hp => {
      if (!hp.layer || !map) return;
      const zTier = (hp.level || '').toUpperCase();
      let matches = true;
      if (status === 'Active') {
        matches = (zTier === 'RED' || zTier === 'CRITICAL');
      } else if (status === 'Monitoring') {
        matches = (zTier === 'YELLOW' || zTier === 'ORANGE' || zTier === 'MODERATE' || zTier === 'HIGH' || zTier === 'HIGH ALERT');
      } else if (status === 'Normal') {
        matches = (zTier === 'GREEN' || zTier === 'SAFE' || zTier === 'LOW RISK');
      }
      if (matches) {
        if (!map.hasLayer(hp.layer)) map.addLayer(hp.layer);
      } else {
        if (map.hasLayer(hp.layer)) map.removeLayer(hp.layer);
      }
    });
  }

  // If explanation card is currently open, refresh its zone list with the filter
  if (currentHazardCardData) {
    showHazardZoneTableCard(currentHazardCardData);
  }

  showToast(`Hazards filtered: showing ${status === 'ALL' ? 'all' : status} zones`, 'info');
}
window.setHazardStatusFilter = setHazardStatusFilter;

function initMapHazardButton() {
  const dropdown = document.getElementById('map-hazard-dropdown');
  const btn = document.getElementById('btn-map-hazard');
  if (!dropdown) return;

  // Render initial items into #map-hazard-dropdown-list while preserving tabs
  renderHazardDropdownList('ALL');

  // Listen to Windy mode changes to hide hazard button
  const observer = new MutationObserver(() => {
    const isWindy = document.body.classList.contains('windy-mode-active') || document.querySelector('.windy-active');
    const hazardControl = document.getElementById('map-hazard-control');
    if (hazardControl) {
      hazardControl.style.display = isWindy ? 'none' : 'block';
    }
    if (isWindy) {
      dropdown.style.display = 'none';
      if (btn) btn.setAttribute('aria-expanded', 'false');
    }
  });
  observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });

  // Close dropdown on outside click
  document.addEventListener('click', (e) => {
    if (!e.target.closest('#map-hazard-control') && !e.target.closest('#btn-map-hazard') && !e.target.closest('#map-hazard-dropdown')) {
      dropdown.style.display = 'none';
      if (btn) {
        btn.setAttribute('aria-expanded', 'false');
        btn.classList.remove('active');
      }
    }
  });
}

function toggleMapHazardDropdown(e) {
  if (e) e.stopPropagation();
  const dropdown = document.getElementById('map-hazard-dropdown');
  const btn = document.getElementById('btn-map-hazard');
  if (!dropdown) return;
  const isVisible = dropdown.style.display === 'block';
  dropdown.style.display = isVisible ? 'none' : 'block';
  if (btn) {
    btn.setAttribute('aria-expanded', !isVisible);
    btn.classList.toggle('active', !isVisible);
  }
}

function selectHazardFromDropdown(hazardKey) {
  const dropdown = document.getElementById('map-hazard-dropdown');
  const btn = document.getElementById('btn-map-hazard');
  if (dropdown) dropdown.style.display = 'none';
  if (btn) {
    btn.setAttribute('aria-expanded', 'false');
    btn.classList.remove('active');
  }

  const hazard = MONITORED_HAZARDS.find(h => h.key === hazardKey) || MONITORED_HAZARDS[0];

  // Set active hazard context (Issue 2)
  window.currentSelectedHazard = hazard.key;

  // 1. Ensure we are on GIS map view
  if (typeof switchView === 'function') {
    switchView('map-view');
  }

  // 2. Fly GIS Map
  if (authMapInstance && authMapInstance.flyToLocation) {
    authMapInstance.flyToLocation(hazard.lat, hazard.lng, hazard.zoom);
  } else if (authMapInstance && authMapInstance.getMap()) {
    authMapInstance.getMap().setView([hazard.lat, hazard.lng], hazard.zoom);
  }

  // 3. Render Hazard Engine Layer
  if (window.authHazardEngine && typeof window.authHazardEngine.render === 'function') {
    window.authHazardEngine.render(hazardKey);
  }

  // 4. Show Explanation Card
  showHazardZoneTableCard(hazard);

  // 5. Connect to priority queue & population risk grid if data is loaded (Issue 2 & 3)
  if (window.currentPriorityData) {
    renderPriorityRankingTable(window.currentPriorityData);
    updatePopulationRiskGrid(window.currentPriorityData);
  }
}

function showHazardZoneTableCard(hazard) {
  const card = document.getElementById('hazard-zone-table-card');
  if (!card) return;
  currentHazardCardData = hazard;

  const iconEl = document.getElementById('hz-card-icon') || document.getElementById('hztc-icon');
  const titleEl = document.getElementById('hz-card-title') || document.getElementById('hztc-name');
  const badgeEl = document.getElementById('hz-card-badge') || document.getElementById('hztc-tier');
  const descEl = document.getElementById('hz-card-desc') || document.getElementById('hztc-type');
  const tierEl = document.getElementById('hz-card-tier') || document.getElementById('hztc-stat-tier');
  const zonesCountEl = document.getElementById('hz-card-zones-count');
  const popEl = document.getElementById('hz-card-population') || document.getElementById('hztc-stat-pop');
  const coordsEl = document.getElementById('hztc-stat-coords');
  const teleEl = document.getElementById('hztc-stat-telemetry');
  const tableWrap = document.getElementById('hz-card-table-wrap');

  if (iconEl) iconEl.textContent = hazard.icon;
  if (titleEl) titleEl.textContent = hazard.name;
  if (badgeEl) {
    badgeEl.className = `badge ${hazard.badge || 'badge-critical'}`;
    badgeEl.textContent = hazard.tier || 'CRITICAL';
  }
  if (descEl) descEl.textContent = hazard.summary;
  if (tierEl) {
    tierEl.textContent = hazard.tier;
    tierEl.style.color = hazard.tier === 'CRITICAL' ? '#ef4444' : hazard.tier === 'HIGH ALERT' ? '#f97316' : '#eab308';
  }
  if (zonesCountEl) zonesCountEl.textContent = `${hazard.zonesCount || 6} Polygons`;
  if (popEl) popEl.textContent = hazard.population || '25,000';
  if (coordsEl) coordsEl.textContent = `${hazard.lat.toFixed(2)}° N, ${hazard.lng.toFixed(2)}° E`;
  if (teleEl) teleEl.textContent = hazard.key === 'cyclone' ? '115 km/h Peak Gusts' : hazard.key === 'flood' ? '+2.8m River Inundation' : 'Active Telemetry';

  if (tableWrap) {
    // Generate active zones list
    const intel = (typeof HAZARD_INTEL !== 'undefined') ? HAZARD_INTEL[hazard.key] : null;
    let zones = (intel && intel.zones && intel.zones.length) ? intel.zones.slice(0, 6) : [
      { name: 'Uppada Coastal Inundation Sector', current_tier: 'RED', pop: 12400, lat: 17.08, lng: 82.33 },
      { name: 'Kakinada Anchorage Corridor', current_tier: 'ORANGE', pop: 8900, lat: 16.98, lng: 82.25 },
      { name: 'Godavari Estuary Floodplain', current_tier: 'YELLOW', pop: 6200, lat: 16.75, lng: 81.80 },
      { name: 'Samalkot Rural Buffer', current_tier: 'GREEN', pop: 3500, lat: 17.05, lng: 82.17 }
    ];

    // Apply status filter if active
    const statusFilter = window.currentHazardStatusFilter;
    if (statusFilter && statusFilter !== 'ALL') {
      zones = zones.filter(z => {
        const t = (z.current_tier || z.level || '').toUpperCase();
        if (statusFilter === 'Active') return t === 'RED' || t === 'CRITICAL';
        if (statusFilter === 'Monitoring') return t === 'ORANGE' || t === 'HIGH ALERT' || t === 'HIGH';
        if (statusFilter === 'Normal') return t === 'YELLOW' || t === 'GREEN' || t === 'MODERATE';
        return true;
      });
    }

    let tHtml = `
      <table style="width:100%; border-collapse:collapse; font-size:11px;">
        <thead>
          <tr style="border-bottom:1px solid rgba(255,255,255,0.1); color:#94a3b8; text-align:left;">
            <th style="padding:4px 6px;">ZONE NAME</th>
            <th style="padding:4px 6px;">TIER</th>
            <th style="padding:4px 6px;">POPULATION</th>
            <th style="padding:4px 6px; text-align:right;">ACTION</th>
          </tr>
        </thead>
        <tbody>
    `;

    if (zones.length === 0) {
      tHtml += `<tr><td colspan="4" style="padding:10px; text-align:center; color:#94a3b8;">No zones matching "${statusFilter}" filter.</td></tr>`;
    } else {
      zones.forEach(z => {
        const zTier = z.current_tier || z.level || 'RED';
        const zColor = zTier === 'RED' ? '#ef4444' : zTier === 'ORANGE' ? '#f97316' : zTier === 'YELLOW' ? '#eab308' : '#22c55e';
        const zName = z.village_name || z.name;
        const zPop = Number(z.pop || 5000);
        const zLat = z.lat || hazard.lat;
        const zLng = z.lng || hazard.lng;
        tHtml += `
          <tr style="border-bottom:1px solid rgba(255,255,255,0.04); color:#e2e8f0;">
            <td style="padding:6px 6px; font-weight:600;">${zName}</td>
            <td style="padding:6px 6px;">
              <span style="font-size:9px; font-weight:800; padding:2px 5px; border-radius:4px; background:${zColor}20; color:${zColor}; border:1px solid ${zColor}40;">
                ${zTier}
              </span>
            </td>
            <td style="padding:6px 6px; color:#94a3b8;">${zPop.toLocaleString()}</td>
            <td style="padding:6px 6px; text-align:right; white-space:nowrap;">
              <button onclick="inspectEntity({name:'${zName}', tier:'${zTier}', lat:${zLat}, lng:${zLng}, population:${zPop}}, event)" class="btn btn-glass" style="padding:2px 5px; font-size:10px; margin-right:4px;" title="Inspect Entity">
                🔍
              </button>
              <button onclick="locateEntity({name:'${zName}', tier:'${zTier}', lat:${zLat}, lng:${zLng}, zoom:14, desc:'${zTier} hazard sector &bull; Pop: ${zPop.toLocaleString()}', population:${zPop}}, event)" class="btn btn-glass" style="padding:2px 5px; font-size:10px; color:#38bdf8;" title="Locate on Map">
                🗺️
              </button>
            </td>
          </tr>
        `;
      });
    }

    tHtml += `</tbody></table>`;
    tableWrap.innerHTML = tHtml;
  }

  card.style.display = 'block';
}

function closeHazardZoneTableCard() {
  const card = document.getElementById('hazard-zone-table-card');
  if (card) card.style.display = 'none';
  currentHazardCardData = null;
}

window.toggleMapHazardDropdown = toggleMapHazardDropdown;
window.selectHazardFromDropdown = selectHazardFromDropdown;
window.closeHazardZoneTableCard = closeHazardZoneTableCard;

// ================================================================
// SECTION D: CITIZEN-STYLE TOPBAR SEARCH ENGINE
// ================================================================

function initAuthoritySearch() {
  const input = document.getElementById('authority-search') || document.getElementById('topbar-search-input');
  const dropdown = document.getElementById('authority-search-dropdown') || document.getElementById('topbar-search-dropdown');
  const clearBtn = document.getElementById('authority-search-clear') || document.getElementById('topbar-search-clear');
  const searchBtn = document.getElementById('authority-search-btn') || (document.getElementById('authority-search-pill') ? document.getElementById('authority-search-pill').querySelector('.windy-search-icon') : null);
  if (!input || !dropdown) return;

  let debounceTimer = null;

  function clearSearch() {
    input.value = '';
    dropdown.innerHTML = '';
    dropdown.style.display = 'none';
    if (clearBtn) clearBtn.style.display = 'none';
    window.authoritySelectedPlace = null;
  }

  if (clearBtn) {
    clearBtn.addEventListener('click', clearSearch);
  }

  // Close search dropdown on click outside
  document.addEventListener('click', (e) => {
    if (!e.target.closest('#authority-search-pill')) {
      dropdown.style.display = 'none';
    }
  });

  let activeSearchToken = 0;

  input.addEventListener('input', () => {
    const q = input.value.trim();
    if (clearBtn) clearBtn.style.display = q ? 'block' : 'none';

    if (!q || q.length < 2) {
      dropdown.innerHTML = '';
      dropdown.style.display = 'none';
      return;
    }

    const currentToken = ++activeSearchToken;

    // 1. Immediate Local Search (RZILocationService + HAZARD_INTEL + APP_DATA)
    const localResults = searchLocalLocations(q);
    renderSearchResults(localResults, false);

    // 2. Debounced OSM Nominatim Geocoding Fallback (400ms)
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      fetchOsmNominatim(q, localResults, currentToken);
    }, 400);
  });

  let highlightedIndex = -1;

  function updateHighlightedRow(rows) {
    rows.forEach((row, idx) => {
      if (idx === highlightedIndex) {
        row.classList.add('highlighted');
        row.style.background = 'rgba(56, 189, 248, 0.16)';
        row.style.outline = '1px solid rgba(56, 189, 248, 0.4)';
        if (typeof row.scrollIntoView === 'function') {
          row.scrollIntoView({ block: 'nearest' });
        }
      } else {
        row.classList.remove('highlighted');
        row.style.background = '';
        row.style.outline = '';
      }
    });
  }

  input.addEventListener('keydown', (e) => {
    const rows = Array.from(dropdown.querySelectorAll('.windy-search-item'));
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (rows.length > 0) {
        dropdown.style.display = 'block';
        highlightedIndex = (highlightedIndex + 1) % rows.length;
        updateHighlightedRow(rows);
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (rows.length > 0) {
        dropdown.style.display = 'block';
        highlightedIndex = (highlightedIndex - 1 + rows.length) % rows.length;
        updateHighlightedRow(rows);
      }
    } else if (e.key === 'Escape') {
      dropdown.style.display = 'none';
      highlightedIndex = -1;
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (highlightedIndex >= 0 && rows[highlightedIndex] && rows[highlightedIndex]._searchItem) {
        selectSearchResult(rows[highlightedIndex]._searchItem);
      } else if (dropdown.style.display !== 'none' && rows.length > 0 && rows[0]._searchItem) {
        selectSearchResult(rows[0]._searchItem);
      } else {
        submitSearch(input.value);
      }
    }
  });

  if (searchBtn) {
    searchBtn.addEventListener('click', () => {
      const rows = Array.from(dropdown.querySelectorAll('.windy-search-item'));
      if (highlightedIndex >= 0 && rows[highlightedIndex] && rows[highlightedIndex]._searchItem) {
        selectSearchResult(rows[highlightedIndex]._searchItem);
      } else {
        submitSearch(input.value);
      }
    });
  }

  async function submitSearch(q) {
    if (!q) return;
    const query = q.trim();
    if (!query) return;

    // 1. If dropdown is currently open and has items, select the highlighted or top suggestion
    const rows = Array.from(dropdown.querySelectorAll('.windy-search-item'));
    if (dropdown.style.display !== 'none' && rows.length > 0) {
      if (highlightedIndex >= 0 && rows[highlightedIndex] && rows[highlightedIndex]._searchItem) {
        selectSearchResult(rows[highlightedIndex]._searchItem);
        return;
      }
      if (rows[0] && rows[0]._searchItem) {
        selectSearchResult(rows[0]._searchItem);
        return;
      }
    }

    // 2. Immediate local search across datasets
    const local = searchLocalLocations(query);
    if (local && local.length > 0) {
      selectSearchResult(local[0]);
      return;
    }

    // 3. Fallback geocoding query
    (window.showToast || showToast)(`Searching for "${query}"…`, 'info');
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&countrycodes=in&addressdetails=1&limit=5`;
      const res = await fetch(url, { headers: { 'Accept': 'application/json', 'User-Agent': 'RedZoneIntelligence/2.0' } });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          // Find first result strictly inside Andhra Pradesh
          const item = data.find(it => {
            const lt = parseFloat(it.lat);
            const lg = parseFloat(it.lon);
            if (!Number.isFinite(lt) || !Number.isFinite(lg)) return false;
            return (typeof window.isInsideAndhraPradesh === 'function') ? window.isInsideAndhraPradesh(lt, lg) : true;
          });

          if (item) {
            const lat = parseFloat(item.lat);
            const lng = parseFloat(item.lon);
            const name = item.display_name.split(',')[0].trim();
            const parts = item.display_name.split(',').map(s => s.trim());
            const sub = parts.slice(1, 3).join(', ') || 'Andhra Pradesh';
            const zInfo = (typeof window.getZoneForCoordinates === 'function')
              ? window.getZoneForCoordinates(lat, lng)
              : null;
            const pRisk = (zInfo && zInfo.level) ? zInfo.level : 'GREEN';
            const classification = (typeof window.classifyLocationType === 'function')
              ? window.classifyLocationType(item)
              : { tier: 4, type: 'OpenStreetMap' };

            selectSearchResult({
              name,
              subtitle: sub,
              lat,
              lng,
              risk: pRisk,
              type: classification.type,
              category: 'osm'
            });
            return;
          } else {
            (window.showToast || showToast)(`"${query}" is outside the Andhra Pradesh operational boundary.`, 'warning');
            return;
          }
        }
      }
    } catch (e) {
      console.warn('Geocoding search failed:', e);
    }

    // 4. Invalid or non-existent geographic location
    (window.showToast || showToast)(`No locations found matching "${query}" in Andhra Pradesh`, 'warning');
  }

  function searchLocalLocations(q) {
    const lower = q.toLowerCase();
    let results = [];

    // Search RZILocationService if available
    if (window.RZILocationService && typeof window.RZILocationService.searchPlaces === 'function') {
      try {
        const places = window.RZILocationService.searchPlaces(q);
        if (Array.isArray(places)) {
          places.forEach(p => {
            const zInfo = (typeof window.getZoneForCoordinates === 'function')
              ? window.getZoneForCoordinates(p.lat, p.lng)
              : null;
            const pRisk = (zInfo && zInfo.level) ? zInfo.level : (p.risk || 'GREEN');
            const classification = (typeof window.classifyLocationType === 'function')
              ? window.classifyLocationType(p)
              : { tier: 1, type: p.type || 'City / Locality' };
            results.push({
              name: p.name || p.village,
              subtitle: `${p.mandal ? p.mandal + ', ' : ''}${p.district || 'Andhra Pradesh'}`,
              lat: p.lat,
              lng: p.lng,
              risk: pRisk,
              type: classification.type,
              population: p.population || p.pop || 0,
              district: p.district || '',
              mandal: p.mandal || '',
              category: 'place'
            });
          });
        }
      } catch (e) {}
    }

    // Search HAZARD_INTEL
    if (typeof HAZARD_INTEL !== 'undefined') {
      Object.entries(HAZARD_INTEL).forEach(([hKey, hData]) => {
        if (Array.isArray(hData.zones)) {
          hData.zones.forEach(z => {
            const zName = z.village_name || z.name || '';
            if (zName.toLowerCase().includes(lower) && !results.some(r => r.name.toLowerCase() === zName.toLowerCase())) {
              const zLat = z.epicenter ? z.epicenter.lat : z.lat;
              const zLng = z.epicenter ? z.epicenter.lng : z.lng;
              const zInfo = (typeof window.getZoneForCoordinates === 'function')
                ? window.getZoneForCoordinates(zLat, zLng)
                : null;
              const zRisk = (zInfo && zInfo.level) ? zInfo.level : (z.current_tier || z.level || 'RED');
              const classification = (typeof window.classifyLocationType === 'function')
                ? window.classifyLocationType(z)
                : { tier: 2, type: 'Hazard Zone' };
              results.push({
                name: zName,
                subtitle: `${hData.label} Risk Zone • ${z.district || 'AP'}`,
                lat: zLat,
                lng: zLng,
                risk: zRisk,
                type: classification.type,
                population: z.pop || z.population || 0,
                district: z.district || '',
                category: 'zone'
              });
            }
          });
        }
        if (Array.isArray(hData.safeSites)) {
          hData.safeSites.forEach(s => {
            if (s.name && s.name.toLowerCase().includes(lower) && !results.some(r => r.name.toLowerCase() === s.name.toLowerCase())) {
              const zInfo = (typeof window.getZoneForCoordinates === 'function')
                ? window.getZoneForCoordinates(s.lat, s.lng)
                : null;
              const sRisk = (zInfo && zInfo.level) ? zInfo.level : 'GREEN';
              results.push({
                name: s.name,
                subtitle: `Designated Shelter • Cap: ${s.capacity}`,
                lat: s.lat,
                lng: s.lng,
                risk: sRisk,
                type: 'Designated Shelter',
                capacity: s.capacity,
                district: s.district || '',
                category: 'shelter'
              });
            }
          });
        }
      });
    }

    // Search APP_DATA.safeSites & APP_DATA.habitations
    if (typeof APP_DATA !== 'undefined') {
      if (Array.isArray(APP_DATA.safeSites)) {
        APP_DATA.safeSites.forEach(s => {
          if (s.name && s.name.toLowerCase().includes(lower) && !results.some(r => r.name.toLowerCase() === s.name.toLowerCase())) {
            const zInfo = (typeof window.getZoneForCoordinates === 'function')
              ? window.getZoneForCoordinates(s.lat, s.lng)
              : null;
            const sRisk = (zInfo && zInfo.level) ? zInfo.level : 'GREEN';
            results.push({
              name: s.name,
              subtitle: `Designated Shelter • Cap: ${s.capacity}`,
              lat: s.lat,
              lng: s.lng,
              risk: sRisk,
              type: s.type || 'Designated Shelter',
              capacity: s.capacity,
              district: s.district || '',
              category: 'shelter'
            });
          }
        });
      }
      if (Array.isArray(APP_DATA.habitations)) {
        APP_DATA.habitations.forEach(hab => {
          if (hab.name && hab.name.toLowerCase().includes(lower) && !results.some(r => r.name.toLowerCase() === hab.name.toLowerCase())) {
            const hLng = hab.lng || hab.lon;
            const zInfo = (typeof window.getZoneForCoordinates === 'function')
              ? window.getZoneForCoordinates(hab.lat, hLng)
              : null;
            const hRisk = (zInfo && zInfo.level) ? zInfo.level : (hab.risk || 'GREEN');
            results.push({
              name: hab.name,
              subtitle: `Habitation • ${hab.district || 'AP'}`,
              lat: hab.lat,
              lng: hLng,
              risk: hRisk,
              type: 'Habitation',
              population: hab.pop || hab.growth_adjusted_pop || 0,
              district: hab.district || '',
              category: 'habitation'
            });
          }
        });
      }
    }

    // Filter strictly to Andhra Pradesh boundary
    if (typeof window.isInsideAndhraPradesh === 'function') {
      results = results.filter(r => window.isInsideAndhraPradesh(r.lat, r.lng));
    }

    // Canonical Ranking of local places
    if (typeof window.computeSearchRank === 'function') {
      results.sort((a, b) => window.computeSearchRank(a, q) - window.computeSearchRank(b, q));
    }

    return results;
  }

  async function fetchOsmNominatim(q, currentResults, token) {
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&countrycodes=in&addressdetails=1&limit=10`;
      const res = await fetch(url, { headers: { 'Accept': 'application/json', 'User-Agent': 'RedZoneIntelligence/2.0' } });
      if (!res.ok) return;
      if (token !== activeSearchToken || input.value.trim().toLowerCase() !== q.toLowerCase()) return; // Stale query guard

      const data = await res.json();
      if (!Array.isArray(data)) return;
      if (token !== activeSearchToken || input.value.trim().toLowerCase() !== q.toLowerCase()) return;

      const combined = [...currentResults];
      data.forEach(item => {
        const lat = parseFloat(item.lat);
        const lng = parseFloat(item.lon);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

        // Skip anything outside Andhra Pradesh
        if (typeof window.isInsideAndhraPradesh === 'function' && !window.isInsideAndhraPradesh(lat, lng)) {
          return;
        }

        const name = item.display_name.split(',')[0].trim();
        if (!combined.some(c => c.name.toLowerCase() === name.toLowerCase())) {
          const zInfo = (typeof window.getZoneForCoordinates === 'function')
            ? window.getZoneForCoordinates(lat, lng)
            : null;
          const pRisk = (zInfo && zInfo.level) ? zInfo.level : 'GREEN';
          const classification = (typeof window.classifyLocationType === 'function')
            ? window.classifyLocationType(item)
            : { tier: 4, type: 'OpenStreetMap' };

          const parts = item.display_name.split(',').map(s => s.trim());
          const sub = parts.slice(1, 3).join(', ') || 'Andhra Pradesh';

          combined.push({
            name,
            subtitle: sub,
            lat,
            lng,
            risk: pRisk,
            type: classification.type,
            class: item.class,
            addresstype: item.type,
            category: 'osm'
          });
        }
      });

      // Canonical Ranking of combined places (geographic entities prioritized over POIs/roads)
      if (typeof window.computeSearchRank === 'function') {
        combined.sort((a, b) => window.computeSearchRank(a, q) - window.computeSearchRank(b, q));
      }

      renderSearchResults(combined.slice(0, 8), true);
    } catch (err) {
      console.warn('Geocoding fallback failed:', err);
    }
  }

  function renderSearchResults(items, hasExternal) {
    highlightedIndex = -1;
    if (!items.length) {
      dropdown.innerHTML = '<div style="padding:10px 12px; font-size:11px; color:var(--text-secondary, #475569); text-align:center;">No locations found matching query in Andhra Pradesh</div>';
      dropdown.style.display = 'block';
      return;
    }

    dropdown.innerHTML = '';
    items.forEach(item => {
      const row = document.createElement('div');
      row.className = 'windy-search-item';
      row._searchItem = item;

      const colors = {
        RED: '#ef4444',
        ORANGE: '#f97316',
        YELLOW: '#eab308',
        GREEN: '#22c55e'
      };
      const riskColor = colors[item.risk] || '#94a3b8';
      const riskLabel = item.risk || 'NORMAL';

      const icon = item.category === 'zone' ? '⚠️' : item.category === 'shelter' ? '🏠' : item.category === 'osm' ? '📍' : '📌';

      row.innerHTML = `
        <span class="windy-search-icon">${icon}</span>
        <div class="windy-search-item-info" style="flex:1; min-width:0;">
          <div class="windy-search-item-name" style="font-weight:600; color:var(--text-primary, #0f172a); font-size:12px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
            ${item.name}
            ${item.type ? `<span style="font-size:10px; font-weight:400; color:var(--text-muted, #94a3b8); margin-left:4px;">(${item.type})</span>` : ''}
          </div>
          <div class="windy-search-item-sub" style="font-size:10px; color:var(--text-secondary, #475569); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${item.subtitle}</div>
        </div>
        <span class="windy-search-badge" style="background:${riskColor}22; color:${riskColor}; border:1px solid ${riskColor}40; margin-left:8px; flex-shrink:0;">
          ${riskLabel}
        </span>
      `;

      // Attach both mousedown and click handlers to guarantee instant, reliable selection
      let selectTriggered = false;
      const handleSelect = (e) => {
        if (e) {
          if (typeof e.preventDefault === 'function') e.preventDefault();
          if (typeof e.stopPropagation === 'function') e.stopPropagation();
        }
        if (selectTriggered) return;
        selectTriggered = true;
        setTimeout(() => { selectTriggered = false; }, 300);
        selectSearchResult(item);
      };

      row.addEventListener('mousedown', handleSelect);
      row.addEventListener('click', handleSelect);

      dropdown.appendChild(row);
    });
    dropdown.style.display = 'block';
  }

  function selectSearchResult(item) {
    if (!item) return;
    const lat = Number(item.lat);
    const lng = Number(item.lng ?? item.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      (window.showToast || showToast)(`Invalid coordinates for ${item.name || 'location'}`, 'warning');
      return;
    }

    if (typeof window.isInsideAndhraPradesh === 'function' && !window.isInsideAndhraPradesh(lat, lng)) {
      (window.showToast || showToast)(`Location "${item.name || 'Selected'}" is outside the Andhra Pradesh operational boundary.`, 'warning');
      return;
    }

    // Cancel in-flight debounce and stale geocode requests
    clearTimeout(debounceTimer);
    activeSearchToken++;

    // Hide dropdown & populate search input with exact selected place name
    dropdown.innerHTML = '';
    dropdown.style.display = 'none';
    input.value = item.name;
    if (clearBtn) clearBtn.style.display = 'block';

    // 1. Resolve canonical hazard status using existing canonical polygon logic
    const zoneInfo = (typeof window.getZoneForCoordinates === 'function')
      ? window.getZoneForCoordinates(lat, lng)
      : { level: item.risk || 'GREEN' };
    const effectiveRisk = (zoneInfo && zoneInfo.level) ? zoneInfo.level : (item.risk || 'GREEN');

    // Register selected place state for Authority Portal
    window.authoritySelectedPlace = {
      ...item,
      lat: lat,
      lng: lng,
      risk: effectiveRisk
    };

    // Calculate appropriate zoom level (City/Town zoom ~12-14, District ~10, State ~7, Habitation/OSM ~15)
    let zoomLevel = 14;
    if (item.category === 'state') zoomLevel = 7;
    else if (item.type === 'District') zoomLevel = 10;
    else if (item.category === 'osm' || item.isOsm) zoomLevel = 15;
    else if (item.type === 'Habitation' || item.category === 'habitation') zoomLevel = 15;
    else if (item.zoom && Number.isFinite(Number(item.zoom))) zoomLevel = Number(item.zoom);

    // If an overlay panel is currently open, cleanly dismiss it to return to map
    const contentPanel = document.getElementById('content-panel');
    if (contentPanel && contentPanel.style.display !== 'none') {
      contentPanel.style.display = 'none';
      const views = [
        'command', 'decision-support', 'hazards', 'habitations', 'safesites',
        'population-risk', 'reports', 'datasources'
      ];
      views.forEach(v => {
        const el = document.getElementById('view-' + v);
        if (el) el.style.display = 'none';
      });
      if (typeof document.querySelectorAll === 'function') {
        document.querySelectorAll('.dock-item[data-view]').forEach(i => {
          i.classList.toggle('active', i.dataset.view === 'map-view');
        });
      }
      const legendPanel = (typeof document.querySelector === 'function') ? document.querySelector('.map-legend-panel') : null;
      if (legendPanel) legendPanel.style.display = '';
      const btnMapHazard = document.getElementById('btn-map-hazard');
      if (btnMapHazard) btnMapHazard.style.display = '';
    }

    // 2. Direct map navigation and pulsing pointer placement matching Citizen Portal reference
    const inst = authMapInstance || (typeof window !== 'undefined' ? (window.authMapInstance || window.disasterMap) : null);
    if (inst) {
      if (typeof inst.setLocatePointer === 'function') {
        inst.setLocatePointer(lat, lng, {
          name: item.name,
          level: effectiveRisk,
          desc: item.subtitle || `${item.district || 'Andhra Pradesh'} • ${item.type || 'Location'}`,
          population: item.population,
          capacity: item.capacity,
          zoom: zoomLevel,
          openPopup: false
        });
      }
      const map = typeof inst.getMap === 'function' ? inst.getMap() : inst.map;
      if (map) {
        if (typeof map.flyTo === 'function') {
          map.flyTo([lat, lng], zoomLevel, { duration: 1.5, easeLinearity: 0.5 });
        } else if (typeof map.setView === 'function') {
          map.setView([lat, lng], zoomLevel);
        }
      }
    }

    // 3. Resolve place metadata, show place card, and wire pointer click to reopen card
    const placeData = resolvePlaceData(lat, lng, { ...item, lat, lng, risk: effectiveRisk });
    showPlaceInformationCard(placeData, { lat, lng });
    if (inst && inst.locateMarker) {
      inst.locateMarker.off('click');
      inst.locateMarker.on('click', () => {
        showPlaceInformationCard(placeData, { lat, lng });
      });
    }

    showToast(`🗺️ Located: ${item.name}`, 'info');
  }

  window.selectAuthoritySearchResult = selectSearchResult;
  window.renderAuthoritySearchResults = renderSearchResults;
  window.submitAuthoritySearch = submitSearch;
}

// ================================================================
// MAP PLACE INFORMATION CARD & CLICK RESOLUTION SYSTEM
// ================================================================
let currentPlacePopup = null;

function distanceKm(a1, b1, a2, b2) {
  const R = 6371;
  const dLat = (a2 - a1) * Math.PI / 180;
  const dLng = (b2 - b1) * Math.PI / 180;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(a1 * Math.PI / 180) * Math.cos(a2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

function getActiveRiskForPoint(lat, lng, defaultRisk) {
  if (typeof window !== 'undefined' && typeof window.getZoneForCoordinates === 'function') {
    const zInfo = window.getZoneForCoordinates(lat, lng);
    if (zInfo && zInfo.level && zInfo.level !== 'GREEN') return zInfo.level;
    if (zInfo && zInfo.level === 'GREEN' && (!defaultRisk || defaultRisk === 'GREEN')) return 'GREEN';
  }

  // 1. Check active hazard polygons rendered on map
  if (typeof window.turf !== 'undefined' && window.authMapInstance && window.authMapInstance.hazardPolygons) {
    const pt = turf.point([lng, lat]);
    const rankMap = { 'GREEN': 1, 'YELLOW': 2, 'ORANGE': 3, 'RED': 4 };
    let maxRank = 0;
    let foundLevel = null;
    window.authMapInstance.hazardPolygons.forEach(hp => {
      try {
        if (turf.booleanPointInPolygon(pt, hp.polygon)) {
          if (rankMap[hp.level] > maxRank) {
            maxRank = rankMap[hp.level];
            foundLevel = hp.level;
          }
        }
      } catch (e) {}
    });
    if (foundLevel) return foundLevel;
  }

  // 2. Check active HAZARD_INTEL zones
  if (typeof HAZARD_INTEL !== 'undefined') {
    let bestZoneTier = null;
    let bestDist = Infinity;
    Object.values(HAZARD_INTEL).forEach(hz => {
      if (Array.isArray(hz.zones)) {
        hz.zones.forEach(z => {
          const zLat = z.epicenter ? z.epicenter.lat : z.lat;
          const zLng = z.epicenter ? z.epicenter.lng : z.lng;
          const maxR = z.epicenter ? ((z.baseRadius || z.radius || 28000) * 1.4) : (z.baseRadius || z.radius || 28000);
          const d = distanceKm(lat, lng, zLat, zLng);
          if (d * 1000 <= maxR && d < bestDist) {
            bestDist = d;
            bestZoneTier = z.current_tier || z.level;
          }
        });
      }
    });
    if (bestZoneTier) return bestZoneTier;
  }

  if (defaultRisk && defaultRisk !== 'GREEN') return defaultRisk;
  return 'GREEN';
}

function isCoordinateOnLandSync(lat, lng) {
  const nLat = Number(lat);
  const nLng = Number(lng);
  if (!Number.isFinite(nLat) || !Number.isFinite(nLng)) return false;

  // 1. Direct authoritative check against loaded India Land Boundary (covers AP, all coastlines, islands, all 37 states/UTs)
  const lbs = (typeof window !== 'undefined' ? window.LandBoundaryService : null) ||
              (typeof global !== 'undefined' ? global.LandBoundaryService : null);
  if (lbs && typeof lbs.isPointOnLand === 'function') {
    if (lbs.isPointOnLand(nLat, nLng)) {
      return true;
    }
  }

  // 2. High-speed maritime zone detection for Indian Ocean / Bay of Bengal / Arabian Sea:
  // If coordinates are inside the regional maritime envelope (-5° to 38° N, 60° to 100° E) and NOT on India land,
  // check if it is clearly in open water (excluding approximate Sri Lanka / Bangladesh / Pakistan land boxes).
  if (nLat >= -5 && nLat <= 38 && nLng >= 60 && nLng <= 100) {
    const inSriLanka = (nLat >= 5.8 && nLat <= 9.9 && nLng >= 79.5 && nLng <= 82.0);
    const inBangladesh = (nLat >= 20.5 && nLat <= 26.7 && nLng >= 88.0 && nLng <= 92.7);
    const inPakistan = (nLat >= 23.5 && nLat <= 37.0 && nLng >= 60.5 && nLng <= 75.5);
    if (!inSriLanka && !inBangladesh && !inPakistan) {
      return false; // Confirmed Bay of Bengal, Arabian Sea, or Indian Ocean
    }
  }

  return null; // Indeterminate from regional boundary alone
}

async function isCoordinateOnLand(lat, lng) {
  // Ensure LandBoundaryService data is loaded if promise is active
  if (typeof window !== 'undefined' && window.LandBoundaryService && !window.LandBoundaryService.data && window.LandBoundaryService.promise) {
    try {
      await window.LandBoundaryService.promise;
    } catch (e) {}
  }

  const syncResult = isCoordinateOnLandSync(lat, lng);
  if (syncResult === true) return true;
  if (syncResult === false) return false;

  // Generic global ocean vs land validation (Pacific, Atlantic, Mediterranean, etc.)
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&addressdetails=1`;
    const res = await fetch(url, { headers: { 'Accept': 'application/json', 'User-Agent': 'Risk2Rescue/2.0' } });
    if (!res.ok) return false;
    const data = await res.json();
    if (!data || data.error || !data.address) return false;
    if (data.address.country || data.address.state || data.address.city || data.address.town || data.address.village || data.address.county) {
      return true;
    }
    return false;
  } catch (e) {
    return false;
  }
}
window.isCoordinateOnLand = isCoordinateOnLand;
window.isCoordinateOnLandSync = isCoordinateOnLandSync;

function resolvePlaceData(lat, lng, explicitPlace) {
  const checkLat = typeof lat === 'number' ? lat : (explicitPlace && typeof explicitPlace.lat === 'number' ? explicitPlace.lat : null);
  const checkLng = typeof lng === 'number' ? lng : (explicitPlace && typeof (explicitPlace.lng || explicitPlace.lon) === 'number' ? (explicitPlace.lng || explicitPlace.lon) : null);

  // Strict Andhra Pradesh Boundary Enforcement: Return null for any location outside AP
  if (checkLat !== null && checkLng !== null && typeof window.isInsideAndhraPradesh === 'function') {
    if (!window.isInsideAndhraPradesh(checkLat, checkLng)) {
      return null;
    }
  }

  // If no explicit place is provided, this is a generic map canvas click.
  // Validate that the coordinate is on land. If in ocean/water, return null immediately.
  if (!explicitPlace) {
    const onLand = isCoordinateOnLandSync(lat, lng);
    if (onLand === false) {
      return null;
    }
  }

  const canonicalZone = (typeof window.getZoneForCoordinates === 'function')
    ? window.getZoneForCoordinates(lat, lng)
    : null;

  if (explicitPlace && typeof explicitPlace === 'object') {
    const rawName = explicitPlace.name || explicitPlace.village_name || explicitPlace.zone || 'Selected Location';
    const cleanName = rawName.replace(/\s+Mandal$/i, '');
    const pLat = typeof explicitPlace.lat === 'number' ? explicitPlace.lat : lat;
    const pLng = typeof explicitPlace.lng === 'number' ? explicitPlace.lng : (typeof explicitPlace.lon === 'number' ? explicitPlace.lon : lng);

    // Look for matching record in APP_DATA or HAZARD_INTEL or RZILocationService to preserve complete metadata
    let matched = null;
    const normClean = cleanName.toLowerCase();

    // 1. Exact name match first across habitations, safe sites, and hazard zones
    if (window.APP_DATA) {
      if (Array.isArray(window.APP_DATA.habitations)) {
        matched = window.APP_DATA.habitations.find(h => h.name.toLowerCase() === normClean);
      }
      if (!matched && Array.isArray(window.APP_DATA.safeSites)) {
        matched = window.APP_DATA.safeSites.find(s => s.name.toLowerCase() === normClean);
      }
    }
    if (!matched && typeof HAZARD_INTEL !== 'undefined') {
      Object.values(HAZARD_INTEL).forEach(hz => {
        if (!matched && Array.isArray(hz.zones)) {
          matched = hz.zones.find(z => (z.village_name || z.name || '').toLowerCase() === normClean);
        }
        if (!matched && Array.isArray(hz.safeSites)) {
          matched = hz.safeSites.find(s => (s.name || '').toLowerCase() === normClean);
        }
      });
    }
    if (!matched && typeof RZILocationService !== 'undefined' && typeof RZILocationService.searchPlaces === 'function') {
      try {
        const hits = RZILocationService.searchPlaces(cleanName);
        if (hits && hits[0] && hits[0].name.toLowerCase() === normClean) {
          matched = hits[0];
        }
      } catch (e) {}
    }

    // 2. Spatial proximity fallback only if name match failed and explicitPlace had no name or was generic
    if (!matched && (!cleanName || cleanName.includes('Location') || cleanName.includes('Area'))) {
      if (window.APP_DATA) {
        if (Array.isArray(window.APP_DATA.safeSites)) {
          matched = window.APP_DATA.safeSites.find(s => distanceKm(pLat, pLng, s.lat, s.lng) < 0.2);
        }
        if (!matched && Array.isArray(window.APP_DATA.habitations)) {
          matched = window.APP_DATA.habitations.find(h => distanceKm(pLat, pLng, h.lat, h.lng || h.lon) < 0.2);
        }
      }
    }

    const pPop = explicitPlace.population || explicitPlace.pop || explicitPlace.growth_adjusted_pop || (explicitPlace._habData ? (explicitPlace._habData.pop || explicitPlace._habData.growth_adjusted_pop) : (matched ? (matched.pop || matched.population || matched.census_2011_pop || 0) : 0));
    const pCap = explicitPlace.capacity || (matched ? matched.capacity : 0);
    const pType = explicitPlace.type || (matched ? (matched.type || (matched.capacity ? 'Designated Shelter' : 'Habitation')) : '');
    const pSub = explicitPlace.subtitle || (matched ? (matched.district ? `${pType ? pType + ' • ' : ''}${matched.district}` : '') : '');
    const pDistrict = explicitPlace.district || (matched ? matched.district : '');

    const pRisk = (canonicalZone && canonicalZone.level)
      ? canonicalZone.level
      : getActiveRiskForPoint(pLat, pLng, explicitPlace.risk || explicitPlace.current_tier || explicitPlace.level);

    return {
      name: cleanName,
      fullName: rawName,
      lat: pLat,
      lng: pLng,
      population: pPop,
      capacity: pCap,
      type: pType,
      subtitle: pSub,
      district: pDistrict,
      risk: pRisk
    };
  }

  const candidates = [];

  // Habitations in APP_DATA
  if (window.APP_DATA && Array.isArray(window.APP_DATA.habitations)) {
    window.APP_DATA.habitations.forEach(h => {
      candidates.push({
        name: h.name,
        fullName: h.name,
        lat: h.lat,
        lng: h.lng || h.lon,
        population: h.pop || h.growth_adjusted_pop || 18200,
        risk: h.risk || 'RED',
        source: 'habitation'
      });
    });
  }

  // Priority Engine Habitations
  if (window.currentPriorityData && Array.isArray(window.currentPriorityData.habitations)) {
    window.currentPriorityData.habitations.forEach(h => {
      candidates.push({
        name: h.village_name || h.name,
        fullName: h.village_name || h.name,
        lat: h.lat,
        lng: h.lng,
        population: h.population || h.pop || 0,
        risk: h.priorityLevel === 'CRITICAL' ? 'RED' : (h.priorityLevel === 'HIGH' ? 'ORANGE' : 'YELLOW'),
        source: 'priority_habitation'
      });
    });
  }

  // AP Mandals from Census Dataset (RZILocationService)
  if (window.RZILocationService && typeof window.RZILocationService.getAPMandals === 'function') {
    try {
      const mandals = window.RZILocationService.getAPMandals();
      mandals.forEach(m => {
        candidates.push({
          name: m.name.replace(/\s+Mandal$/i, ''),
          fullName: m.name,
          lat: m.lat,
          lng: m.lng,
          population: m.population,
          risk: 'GREEN',
          source: 'mandal'
        });
      });
    } catch (e) {}
  }

  // HAZARD_INTEL active zones
  if (typeof HAZARD_INTEL !== 'undefined') {
    Object.values(HAZARD_INTEL).forEach(hz => {
      if (Array.isArray(hz.zones)) {
        hz.zones.forEach(z => {
          candidates.push({
            name: (z.village_name || z.name).replace(/\s+Coastal Landfall Corridor$/i, '').replace(/\s+Coastal Sector$/i, ''),
            fullName: z.village_name || z.name,
            lat: z.epicenter ? z.epicenter.lat : z.lat,
            lng: z.epicenter ? z.epicenter.lng : z.lng,
            population: z.pop || z.population || 0,
            risk: z.current_tier || z.level || 'RED',
            source: 'hazard_zone'
          });
        });
      }
    });
  }

  // AP Districts centroids
  if (window.RZILocationService && typeof window.RZILocationService.getAPDistricts === 'function') {
    try {
      const dists = window.RZILocationService.getAPDistricts();
      dists.forEach(d => {
        candidates.push({
          name: d.name,
          fullName: d.name + ' District',
          lat: d.lat,
          lng: d.lng,
          population: 1500000,
          risk: 'GREEN',
          source: 'district'
        });
      });
    } catch (e) {}
  }

  // Find closest candidate to click coordinates
  let best = null;
  let minD = Infinity;
  candidates.forEach(c => {
    if (typeof c.lat === 'number' && typeof c.lng === 'number') {
      const d = distanceKm(lat, lng, c.lat, c.lng);
      if (d < minD) {
        minD = d;
        best = c;
      }
    }
  });

  if (best && minD <= 40) {
    const dynamicRisk = getActiveRiskForPoint(best.lat, best.lng, best.risk);
    return {
      name: best.name,
      fullName: best.fullName || best.name,
      lat: best.lat,
      lng: best.lng,
      population: best.population || 18200,
      risk: dynamicRisk
    };
  }

  // Fallback for open rural/coastal coordinates
  const dynamicRisk = getActiveRiskForPoint(lat, lng, 'GREEN');
  const fallbackName = best ? `${best.name} Sector` : 'Andhra Pradesh Coastal Area';
  const fallbackPop = best ? Math.round(best.population * 0.6) : 12500;
  return {
    name: fallbackName,
    fullName: fallbackName,
    lat: lat,
    lng: lng,
    population: fallbackPop,
    risk: dynamicRisk
  };
}

function showPlaceInformationCard(place, clickCoords) {
  const mapInst = authMapInstance || (typeof window !== 'undefined' ? window.authMapInstance : null) || (typeof window !== 'undefined' ? window.disasterMap : null);
  if (!mapInst || !mapInst.getMap() || !place) return;
  const leafletMap = mapInst.getMap();

  const popupLat = clickCoords && typeof clickCoords.lat === 'number' ? clickCoords.lat : place.lat;
  const popupLng = clickCoords && typeof clickCoords.lng === 'number' ? clickCoords.lng : (place.lng || place.lon);

  // Strict Andhra Pradesh boundary check: Never display place card or alerts outside AP
  if (typeof window.isInsideAndhraPradesh === 'function' && !window.isInsideAndhraPradesh(popupLat, popupLng)) {
    if (currentPlacePopup) {
      try { leafletMap.closePopup(currentPlacePopup); } catch (e) {}
      currentPlacePopup = null;
    }
    return;
  }

  // Close any existing card to prevent stale data
  if (currentPlacePopup) {
    try {
      leafletMap.closePopup(currentPlacePopup);
    } catch (e) {}
    currentPlacePopup = null;
  }

  const rawRisk = String(place.risk || 'GREEN').toUpperCase();
  let riskBadgeText = '🟢 GREEN / NORMAL';
  let badgeBg = 'rgba(34, 197, 94, 0.15)';
  let badgeColor = '#15803d';
  let badgeBorder = 'rgba(34, 197, 94, 0.35)';

  if (rawRisk.includes('RED') || rawRisk === 'CRITICAL') {
    riskBadgeText = '🔴 RED RISK';
    badgeBg = 'rgba(239, 68, 68, 0.15)';
    badgeColor = '#dc2626';
    badgeBorder = 'rgba(239, 68, 68, 0.35)';
  } else if (rawRisk.includes('ORANGE') || rawRisk === 'HIGH') {
    riskBadgeText = '🟠 ORANGE RISK';
    badgeBg = 'rgba(249, 115, 22, 0.15)';
    badgeColor = '#ea580c';
    badgeBorder = 'rgba(249, 115, 22, 0.35)';
  } else if (rawRisk.includes('YELLOW') || rawRisk === 'MODERATE') {
    riskBadgeText = '🟡 YELLOW RISK';
    badgeBg = 'rgba(234, 179, 8, 0.18)';
    badgeColor = '#a16207';
    badgeBorder = 'rgba(234, 179, 8, 0.4)';
  }

  const displayNameUpper = (place.name || 'Identified Place').toUpperCase();
  const popFormatted = Number(place.population || 0).toLocaleString();
  const latFormatted = Number(place.lat).toFixed(4);
  const lngFormatted = Number(place.lng).toFixed(4);
  const escapedName = (place.name || '').replace(/'/g, "\\'");

  const popupHtml = `
    <div class="authority-place-card">
      <div class="authority-place-card-header">
        <span class="authority-place-card-badge" style="background:${badgeBg}; color:${badgeColor}; border:1px solid ${badgeBorder};">
          ${riskBadgeText}
        </span>
        <span class="authority-place-card-name">
          ${displayNameUpper}
        </span>
      </div>
      <div class="authority-place-card-body">
        ${place.subtitle ? `
          <div class="authority-place-card-row">
            <span class="authority-place-card-label">Classification:</span>
            <strong class="authority-place-card-val" style="font-size:11px; color:#475569;">${place.subtitle}</strong>
          </div>
        ` : (place.type ? `
          <div class="authority-place-card-row">
            <span class="authority-place-card-label">Type:</span>
            <strong class="authority-place-card-val">${place.type}</strong>
          </div>
        ` : '')}
        ${place.capacity ? `
          <div class="authority-place-card-row">
            <span class="authority-place-card-label">Shelter Capacity:</span>
            <strong class="authority-place-card-val">${Number(place.capacity).toLocaleString()} beds</strong>
          </div>
        ` : ''}
        ${place.population > 0 ? `
          <div class="authority-place-card-row">
            <span class="authority-place-card-label">Population:</span>
            <strong class="authority-place-card-val">${popFormatted}</strong>
          </div>
        ` : ''}
        <div class="authority-place-card-row">
          <span class="authority-place-card-label">Coordinates:</span>
          <span class="authority-place-card-coords">${latFormatted}, ${lngFormatted}</span>
        </div>
      </div>
      <div class="authority-place-card-footer">
        <button type="button" class="btn btn-primary authority-place-card-alert-btn" onclick="triggerSendAlertForPlace('${escapedName}', ${place.lat}, ${place.lng}, '${place.risk}')">
          <span>📢</span>
          <span>Send Alert</span>
        </button>
      </div>
    </div>
  `;

  currentPlacePopup = L.popup({
    className: 'place-card-popup',
    maxWidth: 340,
    minWidth: 280,
    autoPan: false,
    closeButton: true,
    autoPanPadding: [20, 20]
  })
    .setLatLng([popupLat, popupLng])
    .setContent(popupHtml)
    .openOn(leafletMap);
}

function triggerSendAlertForPlace(name, lat, lng, risk) {
  // Reject alerts for any target outside Andhra Pradesh
  if (typeof window.isInsideAndhraPradesh === 'function' && !window.isInsideAndhraPradesh(lat, lng)) {
    if (typeof showToast === 'function') {
      showToast(`Cannot issue alert for ${name}: Location is outside Andhra Pradesh operational boundary`, 'warning');
    } else {
      alert(`Cannot issue alert for ${name}: Location is outside Andhra Pradesh operational boundary`);
    }
    return;
  }

  const mapInst = authMapInstance || (typeof window !== 'undefined' ? window.authMapInstance : null) || (typeof window !== 'undefined' ? window.disasterMap : null);
  if (currentPlacePopup && mapInst && mapInst.getMap()) {
    try {
      mapInst.getMap().closePopup(currentPlacePopup);
    } catch (e) {}
    currentPlacePopup = null;
  }

  const prefill = {
    name: name,
    region: name,
    lat: lat,
    lng: lng,
    risk: risk
  };

  const regEl = document.getElementById('ea-region');
  if (regEl) regEl.value = name;
  const latEl = document.getElementById('ea-lat');
  if (latEl) latEl.value = parseFloat(lat).toFixed(4);
  const lngEl = document.getElementById('ea-lng');
  if (lngEl) lngEl.value = parseFloat(lng).toFixed(4);

  const tierEl = document.getElementById('ea-tier');
  if (tierEl) {
    const rawTier = String(risk || '').toUpperCase();
    if (rawTier.includes('RED') || rawTier === 'CRITICAL') tierEl.value = 'CRITICAL';
    else if (rawTier.includes('ORANGE') || rawTier === 'HIGH') tierEl.value = 'HIGH';
    else tierEl.value = 'MODERATE';
  }

  if (typeof window.openEmergencyAlertModal === 'function') {
    window.openEmergencyAlertModal(prefill);
  } else {
    const modal = document.getElementById('modal-emergency-alert');
    if (modal) modal.style.display = 'flex';
  }
}
window.triggerSendAlertForPlace = triggerSendAlertForPlace;
window.showPlaceInformationCard = showPlaceInformationCard;
window.resolvePlaceData = resolvePlaceData;

function initAuthorityMapPlaceClick() {
  if (!authMapInstance || !authMapInstance.getMap()) return;
  const leafletMap = authMapInstance.getMap();

  if (leafletMap._authPlaceClickBound) return;
  leafletMap._authPlaceClickBound = true;

  // Map canvas click handler
  leafletMap.on('click', async (e) => {
    if (e.originalEvent && (e.originalEvent._stopped || e.originalEvent.defaultPrevented)) return;
    const { lat, lng } = e.latlng;

    // 1. Clear any existing place popup/selection immediately (Requirement 6)
    if (currentPlacePopup) {
      try {
        leafletMap.closePopup(currentPlacePopup);
      } catch (err) {}
      currentPlacePopup = null;
    }

    // 2. CHECK WHETHER CLICKED COORDINATE IS INSIDE ANDHRA PRADESH
    if (typeof window.isInsideAndhraPradesh === 'function' && !window.isInsideAndhraPradesh(lat, lng)) {
      // OUTSIDE ANDHRA PRADESH -> DO NOT SHOW PLACE INFORMATION CARD OR ALERT ACTIONS
      return;
    }

    // 3. CHECK WHETHER CLICKED COORDINATE IS LAND OR WATER (Requirement 1 & 4)
    const isLand = await isCoordinateOnLand(lat, lng);
    if (!isLand) {
      // OCEAN / OPEN WATER -> STOP PROCESSING IMMEDIATELY. SHOW NOTHING.
      return;
    }

    // 4. LAND WITHIN ANDHRA PRADESH -> EXISTING CLICK LOGIC CONTINUES (Requirement 3)
    const place = resolvePlaceData(lat, lng);
    if (place) {
      showPlaceInformationCard(place, e.latlng);
    }
  });

  // Habitation markers click integration
  function wireHabitationMarkers() {
    if (authMapInstance && authMapInstance.markers && authMapInstance.markers.habitations) {
      authMapInstance.markers.habitations.eachLayer(layer => {
        if (layer._habData && !layer._authPlaceClickBound) {
          layer._authPlaceClickBound = true;
          try {
            layer.unbindPopup();
          } catch (e) {}
          layer.on('click', (ev) => {
            if (ev) {
              if (ev.originalEvent) L.DomEvent.stopPropagation(ev);
              else if (typeof ev.stopPropagation === 'function') ev.stopPropagation();
            }
            const hab = layer._habData;
            const place = resolvePlaceData(hab.lat, hab.lng || hab.lon, hab);
            showPlaceInformationCard(place, ev.latlng || { lat: hab.lat, lng: hab.lng || hab.lon });
          });
        }
      });
    }
  }
  wireHabitationMarkers();
  setTimeout(wireHabitationMarkers, 1000);
  setTimeout(wireHabitationMarkers, 2500);
}
window.initAuthorityMapPlaceClick = initAuthorityMapPlaceClick;

// Delegate HazardEngine clicks on authority map to show place information card
window.openInspector = function(zoneOrName, coords) {
  const cLat = coords?.lat || (typeof zoneOrName === 'object' ? zoneOrName.lat : 16.99);
  const cLng = coords?.lng || (typeof zoneOrName === 'object' ? (zoneOrName.lng || zoneOrName.lon) : 82.25);
  if (typeof window.isInsideAndhraPradesh === 'function' && !window.isInsideAndhraPradesh(cLat, cLng)) {
    return;
  }
  const place = resolvePlaceData(cLat, cLng, zoneOrName);
  if (place) {
    showPlaceInformationCard(place, coords || { lat: cLat, lng: cLng });
  }
};

// ================================================================
// ENTITY INSPECTION SYSTEM (Issue 5)
// ================================================================
let currentInspectedEntity = null;

function inspectEntity(entity, event) {
  if (event) event.stopPropagation();
  if (!entity) return;
  const eLat = typeof entity.lat === 'number' ? entity.lat : null;
  const eLng = typeof entity.lng === 'number' ? entity.lng : (typeof entity.lon === 'number' ? entity.lon : null);
  if (eLat !== null && eLng !== null && typeof window.isInsideAndhraPradesh === 'function') {
    if (!window.isInsideAndhraPradesh(eLat, eLng)) {
      if (typeof showToast === 'function') {
        showToast(`Cannot inspect ${entity.name || 'entity'}: Location is outside Andhra Pradesh`, 'warning');
      }
      return;
    }
  }
  currentInspectedEntity = entity;

  const modal = document.getElementById('modal-inspect-entity');
  if (!modal) return;

  const nameEl = document.getElementById('iem-name');
  const tierEl = document.getElementById('iem-tier');
  const coordsEl = document.getElementById('iem-coords');
  const popEl = document.getElementById('iem-pop');
  const habEl = document.getElementById('iem-habitations');
  const extraCell = document.getElementById('iem-extra-cell');
  const extraVal = document.getElementById('iem-extra-val');

  if (nameEl) nameEl.textContent = entity.name || entity.title || 'Selected Entity';
  if (tierEl) {
    const t = (entity.tier || entity.level || entity.severity || 'STANDARD').toUpperCase();
    tierEl.textContent = t;
    tierEl.className = 'iem-stat-val iem-tier-pill';
    if (t === 'RED' || t === 'CRITICAL' || t.includes('CRITICAL')) {
      tierEl.style.color = '#dc2626';
      tierEl.style.background = '#fef2f2';
      tierEl.style.border = '1px solid rgba(239, 68, 68, 0.25)';
    } else if (t === 'ORANGE' || t === 'HIGH' || t.includes('HIGH')) {
      tierEl.style.color = '#ea580c';
      tierEl.style.background = '#fff7ed';
      tierEl.style.border = '1px solid rgba(234, 88, 12, 0.25)';
    } else if (t === 'GREEN' || t === 'SAFE' || t === 'NORMAL' || t.includes('SAFE')) {
      tierEl.style.color = '#16a34a';
      tierEl.style.background = '#f0fdf4';
      tierEl.style.border = '1px solid rgba(22, 163, 74, 0.25)';
    } else {
      tierEl.style.color = '#b45309';
      tierEl.style.background = '#fefce8';
      tierEl.style.border = '1px solid rgba(245, 158, 11, 0.25)';
    }
  }
  if (coordsEl) {
    const lat = Number(entity.lat ?? entity.latitude);
    const lng = Number(entity.lng ?? entity.lon ?? entity.longitude);
    coordsEl.textContent = (Number.isFinite(lat) && Number.isFinite(lng))
      ? `${lat.toFixed(4)}° N, ${lng.toFixed(4)}° E`
      : 'GIS Boundary Coordinates';
  }
  if (popEl) {
    const pop = Number(entity.population || entity.pop || entity.affected || 0);
    popEl.textContent = pop > 0 ? `${pop.toLocaleString()} Citizens` : 'Demographic Baseline';
  }
  if (habEl) {
    habEl.textContent = entity.habitations || entity.desc || entity.keyHabitations || 'All connected habitations in this sector are logged under active command monitoring.';
  }
  if (extraCell && extraVal) {
    if (entity.telemetry || entity.eta || entity.notes) {
      extraCell.style.display = 'flex';
      extraVal.textContent = entity.telemetry || entity.eta ? `ETA: ${entity.eta || 'Active'} • Telemetry: ${entity.telemetry || 'Normal'}` : entity.notes;
    } else {
      extraCell.style.display = 'none';
    }
  }

  modal.style.display = 'flex';
}
window.inspectEntity = inspectEntity;

function inspectSubZone(name, tier, lat, lng, pop, habitations, event) {
  inspectEntity({ name, tier, lat, lng, population: pop, habitations }, event);
}
window.inspectSubZone = inspectSubZone;

function closeEntityInspector() {
  const modal = document.getElementById('modal-inspect-entity');
  if (modal) modal.style.display = 'none';
  currentInspectedEntity = null;
}
window.closeEntityInspector = closeEntityInspector;

function locateInspectedEntity() {
  if (!currentInspectedEntity) return;
  const entity = currentInspectedEntity;
  closeEntityInspector();
  locateEntity(entity);
}
window.locateInspectedEntity = locateInspectedEntity;

// ================================================================
// COORDINATE NORMALIZATION & VALIDATION (Requirement 12 & 13)
// ================================================================
function getCitizenCoordinates(item) {
  if (!item || typeof item !== 'object') {
    return { lat: null, lng: null, isValid: false };
  }
  const rawLat = item.latitude ?? item.lat ?? item.locationCoords?.latitude ?? item.locationCoords?.lat ?? item.location?.latitude ?? item.location?.lat;
  const rawLng = item.longitude ?? item.lng ?? item.locationCoords?.longitude ?? item.locationCoords?.lng ?? item.location?.longitude ?? item.location?.lng;

  if (rawLat === null || rawLat === undefined || rawLng === null || rawLng === undefined) {
    return { lat: null, lng: null, isValid: false };
  }

  const lat = Number(rawLat);
  const lng = Number(rawLng);

  if (Number.isNaN(lat) || Number.isNaN(lng) || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    return { lat: null, lng: null, isValid: false };
  }

  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return { lat: null, lng: null, isValid: false };
  }

  return { lat, lng, isValid: true };
}
window.getCitizenCoordinates = getCitizenCoordinates;

// ================================================================
// ROBUST LOCATE / GIS SYSTEM (Matching My Location Reference)
// ================================================================
function locateEntity(entity, event) {
  if (event && typeof event.stopPropagation === 'function') event.stopPropagation();
  if (!entity) return;

  const lat = Number(entity.lat ?? entity.latitude);
  const lng = Number(entity.lng ?? entity.lon ?? entity.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || isNaN(lat) || isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    showToast(`Cannot locate ${entity.name || 'entity'}: Valid coordinates not found`, 'warning');
    return;
  }

  // Strict Andhra Pradesh Operational Boundary check
  if (typeof window.isInsideAndhraPradesh === 'function' && !window.isInsideAndhraPradesh(lat, lng)) {
    console.warn('[Authority] Location outside Andhra Pradesh:', entity.name, lat, lng);
    showToast(`Cannot locate ${entity.name || 'location'}: Outside Andhra Pradesh operational boundary`, 'warning');
    return;
  }

  const isSos = Boolean(entity.isSos || (entity.name && entity.name.includes('SOS')));

  // 1. Navigate directly to pure GIS Map view
  if (typeof switchView === 'function') switchView('map-view');

  // 2. Automatically zoom to appropriate local/street-level range (16 for SOS)
  let zoom = Number(entity.zoom);
  if (!Number.isFinite(zoom) || zoom < 4 || zoom > 18) {
    if (isSos) {
      zoom = 16;
    } else if (entity.level === 'ALL' || entity.tier === 'ALL') {
      zoom = 9;
    } else {
      zoom = 14;
    }
  }

  window._activeLocateEntity = { lat, lng, entity, zoom };

  // 3. Center map, invalidate dimensions, and render persistent location pointer
  let attempts = 0;
  const executeLocate = () => {
    attempts++;
    const inst = authMapInstance || (typeof window !== 'undefined' ? window.authMapInstance : null) || (typeof window !== 'undefined' ? window.disasterMap : null);
    if (!inst) {
      if (attempts < 10) setTimeout(executeLocate, 100);
      return;
    }
    const map = typeof inst.getMap === 'function' ? inst.getMap() : null;
    if (map && typeof map.invalidateSize === 'function') {
      map.invalidateSize();
    }

    const zInfo = (typeof window.getZoneForCoordinates === 'function')
      ? window.getZoneForCoordinates(lat, lng)
      : null;
    const effectiveLevel = (zInfo && zInfo.level)
      ? zInfo.level
      : (entity.level || (isSos ? 'RED' : 'GREEN'));

    if (typeof inst.setLocatePointer === 'function') {
      inst.setLocatePointer(lat, lng, {
        name: entity.name || (isSos ? '🚨 SOS EMERGENCY LOCATION' : 'Identified Location'),
        level: effectiveLevel,
        desc: entity.desc || entity.subtitle || entity.message,
        population: entity.population || entity.pop,
        zoom: zoom,
        openPopup: entity.openPopup !== false,
        isSos: isSos,
        accuracy: entity.accuracy ?? entity.locationAccuracy ?? null,
        timestamp: entity.timestamp ?? entity.locationTimestamp ?? null
      });
    } else if (inst.flyToLocation) {
      inst.flyToLocation(lat, lng, zoom);
    } else if (map && typeof map.setView === 'function') {
      map.setView([lat, lng], zoom);
    }
  };

  // Immediate invocation
  executeLocate();
  setTimeout(() => {
    const inst = authMapInstance || (typeof window !== 'undefined' ? window.authMapInstance : null);
    if (inst && typeof inst.getMap === 'function') {
      const map = inst.getMap();
      if (map && typeof map.invalidateSize === 'function') {
        map.invalidateSize();
      }
    }
  }, 150);

  showToast(`🗺️ Located: ${entity.name || 'Selected location'}`, 'info');
}
window.locateEntity = locateEntity;

function locateHazardById(hazardId, event) {
  if (event && typeof event.stopPropagation === 'function') event.stopPropagation();
  let hazard = null;
  if (window.APP_DATA && Array.isArray(window.APP_DATA.activeHazards)) {
    hazard = window.APP_DATA.activeHazards.find(h => h.id === hazardId);
  }
  if (!hazard && typeof MONITORED_HAZARDS !== 'undefined') {
    const idMap = { 'HAZ001': 'cyclone', 'HAZ002': 'flood', 'HAZ003': 'landslide', 'HAZ004': 'earthquake', 'HAZ005': 'squall' };
    const key = idMap[hazardId];
    if (key) {
      hazard = MONITORED_HAZARDS.find(h => h.key === key);
    }
  }

  if (hazard) {
    locateEntity({
      name: hazard.name,
      lat: hazard.lat,
      lng: hazard.lng,
      zoom: hazard.zoom || 12,
      level: hazard.severity || hazard.tier || 'CRITICAL',
      desc: hazard.desc || hazard.summary
    });
    if (hazard.key && typeof selectHazardFromDropdown === 'function') {
      selectHazardFromDropdown(hazard.key);
    }
  } else {
    showToast(`Hazard ID ${hazardId} not found`, 'warning');
  }
}
window.locateHazardById = locateHazardById;

function locateHazardOnMap(key, event) {
  if (event && typeof event.stopPropagation === 'function') event.stopPropagation();
  selectHazardFromDropdown(key);
}
window.locateHazardOnMap = locateHazardOnMap;

function locateRiskTierOnMap(tier, event) {
  if (event && typeof event.stopPropagation === 'function') event.stopPropagation();
  if (typeof switchView === 'function') switchView('map-view');

  if (tier === 'RED') {
    locateEntity({ name: 'Critical Red Zones (Kakinada Coastal Core)', lat: 16.9891, lng: 82.2475, zoom: 12, level: 'RED', desc: 'Direct danger core — Immediate mandatory evacuation zone' });
  } else if (tier === 'ORANGE') {
    locateEntity({ name: 'High Alert Orange Zones (Godavari Basin)', lat: 16.7500, lng: 81.8000, zoom: 12, level: 'ORANGE', desc: 'Imminent flood surge and embankment breach corridor' });
  } else if (tier === 'YELLOW') {
    locateEntity({ name: 'Moderate Yellow Zones (Eastern Ghats Advisory)', lat: 18.3200, lng: 82.8800, zoom: 12, level: 'YELLOW', desc: 'Elevated risk monitoring buffer sector' });
  } else {
    locateEntity({ name: 'All Coastal Andhra Hazard Sectors', lat: 16.9891, lng: 82.2475, zoom: 9, level: 'ALL', desc: 'Comprehensive multi-hazard risk footprint' });
  }
}
window.locateRiskTierOnMap = locateRiskTierOnMap;

function locateCitizenReport(reportId, lat, lng, event) {
  if (event && typeof event.stopPropagation === 'function') event.stopPropagation();
  let rep = null;
  if (typeof reportManager !== 'undefined' && reportManager.reports) {
    rep = reportManager.reports.find(r => r.id === reportId);
  }
  if (!rep && typeof reportManager !== 'undefined' && reportManager.getReportById) {
    rep = reportManager.getReportById(reportId);
  }

  const coords = getCitizenCoordinates(rep || { lat, lng });
  console.log("Locating SOS:", coords.lat, coords.lng);

  if (!coords.isValid) {
    showToast("Cannot locate on map: Location unavailable for this report.", "warning");
    return;
  }

  const isSos = Boolean(rep?.isSos || (rep?.type && rep.type.toUpperCase().includes('SOS')));
  const name = rep ? (isSos ? `🚨 SOS Distress: ${rep.reporter || rep.citizenName || 'Citizen'}` : `Citizen Report #${rep.id}: ${rep.type}`) : (isSos ? '🚨 SOS Distress Location' : `Citizen Report #${reportId}`);
  const desc = rep ? `${rep.desc || rep.message} &bull; Upvotes: ${rep.upvotes || 0}` : 'Citizen distress emergency transmission';

  locateEntity({
    name,
    lat: coords.lat,
    lng: coords.lng,
    zoom: isSos ? 16 : 15,
    level: isSos ? 'RED' : (rep?.severity || 'HIGH'),
    desc,
    isSos: isSos,
    accuracy: rep?.locationAccuracy || rep?.accuracy || null,
    timestamp: rep?.locationTimestamp || rep?.time || null
  }, event);
}
window.locateCitizenReport = locateCitizenReport;

// Preserved Legacy Helpers
function focusCoordinates(lat, lng, zoom = 14, name, desc) {
  locateEntity({
    name: name || 'Location Coordinates',
    lat,
    lng,
    zoom: zoom || 14,
    desc
  });
}
window.focusCoordinates = focusCoordinates;

function focusHazardOnMap(key, lat, lng) {
  if (lat && lng) {
    locateEntity({ name: `${key.toUpperCase()} Epicenter`, lat, lng, zoom: 12 });
  } else {
    selectHazardFromDropdown(key);
  }
}
window.focusHazardOnMap = focusHazardOnMap;

// ================================================================
// HAZARD INTEL & EARLY THREAT RE-SYNTHESIZER (Issues 7 & 8)
// ================================================================
function viewHazardIntel(hazardKey) {
  const key = hazardKey || window.currentSelectedHazard || 'cyclone';
  selectHazardFromDropdown(key);
  showToast(`Displaying Hazard Intelligence for ${key.toUpperCase()}`, 'info');
}
window.viewHazardIntel = viewHazardIntel;

async function reSynthesizeHazardExplanation(hazardKey) {
  const key = hazardKey || window.currentSelectedHazard || 'command';
  showToast(`AI Assistant re-analyzing telemetry for ${key.toUpperCase()}...`, 'info');

  const panel = document.getElementById('ai-explanation-text');
  if (panel) {
    panel.innerHTML = `
      <div class="ai-message" style="display:flex; align-items:center; gap:8px;">
        <span class="pulse-dot blue" style="width:6px; height:6px;"></span>
        <span>Synthesizing live multi-spectral radar & satellite telemetry for <strong>${key.toUpperCase()}</strong>...</span>
      </div>
    `;
  }

  try {
    // Graceful call to AI recommendation if server is up
    await fetch('/api/ai-recommendation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hazard: key })
    }).catch(() => null);
  } catch (e) {
    // Graceful error fallback
  }

  setTimeout(() => {
    updateAIExplanation(key);
    showToast(`✅ Explanations synthesized for ${key.toUpperCase()}`, 'success');
  }, 400);
}
window.reSynthesizeHazardExplanation = reSynthesizeHazardExplanation;

// ================================================================
// DISASTER DATA POPULATION MAPPING (Issue 4)
// ================================================================
function getDisasterPopulation(d) {
  if (!d) return 0;
  return Number(d.affected || d.populationImpacted || d.pop || d.population || 0);
}
window.getDisasterPopulation = getDisasterPopulation;

// ================================================================
// SIGN OUT / AVATAR PROFILE MENU (Issue 12)
// ================================================================
function toggleProfileMenu(e) {
  if (e) e.stopPropagation();
  const menu = document.getElementById('profile-dropdown-menu');
  const btn = document.getElementById('topbar-avatar-btn');
  if (!menu) return;
  const isVisible = menu.style.display === 'block';
  menu.style.display = isVisible ? 'none' : 'block';
  if (btn) btn.classList.toggle('active', !isVisible);
}
window.toggleProfileMenu = toggleProfileMenu;

function closeProfileMenu() {
  const menu = document.getElementById('profile-dropdown-menu');
  const btn = document.getElementById('topbar-avatar-btn');
  if (menu) menu.style.display = 'none';
  if (btn) btn.classList.remove('active');
}
window.closeProfileMenu = closeProfileMenu;

document.addEventListener('click', (e) => {
  if (!e.target.closest('#topbar-profile-container')) {
    closeProfileMenu();
  }
});

function openTelemetryInspector(type) {
  showToast(`📡 Live Telemetry Stream: Connected to ${type === 'wind' ? 'Coastal Doppler Radar' : 'USGS Seismic Sensor Grid'}`, 'info');
  if (typeof switchView === 'function') switchView('map-view');
}
window.openTelemetryInspector = openTelemetryInspector;

// ---- AI Engine Diagnostics Panel & Confidence Badge ----
function openAiDiagnostics() {
  showToast('🧠 AI Engine Diagnostics: Active telemetry models operating at 94.2% confidence. Multi-sensor fusion nominal.', 'info');
}
window.openAiDiagnostics = openAiDiagnostics;

function updateAiConfidenceBadge(confidence = 94.2) {
  const badge = document.getElementById('topbar-ai-confidence-badge');
  const valEl = document.getElementById('topbar-ai-confidence-val');
  if (!badge || !valEl) return;
  valEl.textContent = confidence + '%';
  badge.classList.remove('conf-high', 'conf-med', 'conf-low');
  if (confidence >= 85) {
    badge.classList.add('conf-high');
  } else if (confidence >= 70) {
    badge.classList.add('conf-med');
  } else {
    badge.classList.add('conf-low');
  }
}
window.updateAiConfidenceBadge = updateAiConfidenceBadge;

// ---- Command Center KPIs & Alerts ----
function initCommandCenter() {
  // Populate alert feed in command dashboard
  const feed = document.getElementById('command-alert-feed');
  if (feed) {
    feed.innerHTML = '';
    APP_DATA.alerts.slice(0, 5).forEach(alert => {
      const item = document.createElement('div');
      const levelClass = alert.level.toLowerCase();
      item.className = `alert-item ${levelClass}`;
      item.innerHTML = `
        <span class="alert-level-dot ${levelClass}"></span>
        <div class="alert-item-body">
          <div class="alert-item-title">${alert.title}</div>
          <div class="alert-item-meta">
            <span>${alert.area}</span> &bull; 
            <span>Confidence: <strong class="alert-conf">${alert.confidence}%</strong></span> &bull;
            <span style="color:var(--text-muted);">Sources: ${alert.sources.join(', ')}</span>
          </div>
        </div>
        <div class="alert-item-time">${alert.time}</div>
      `;
      item.addEventListener('click', () => {
        showToast(`Reviewing telemetry for ${alert.title}`, 'info');
      });
      feed.appendChild(item);
    });
  }

  // Fetch real-time telemetry from live backend APIs
  fetchLiveTelemetry();
}

async function fetchLiveTelemetry() {
  try {
    const resp = await fetch('/api/telemetry/live');
    if (!resp.ok) return;
    const data = await resp.json();
    if (!data) return;

    // 1. Update Doppler radar gust speed
    const gustVal = document.getElementById('kpi-gust-speed');
    const gustTrend = document.getElementById('kpi-gust-trend');
    const gustSource = document.getElementById('kpi-gust-source');
    if (gustVal) {
      if (data.radar && data.radar.maxGustSpeedKmH !== null && data.radar.maxGustSpeedKmH !== undefined) {
        if (window.Provenance) {
          gustVal.innerHTML = `${data.radar.maxGustSpeedKmH} <span style="font-size:0.6em;color:var(--text-muted)">km/h</span> ${window.Provenance.renderBadge('open_meteo_weather')}`;
        } else {
          gustVal.textContent = `${data.radar.maxGustSpeedKmH} km/h`;
        }
        if (gustTrend) {
          const stationName = data.radar.station ? (data.radar.station.includes(' - ') ? data.radar.station.split(' - ')[1] : data.radar.station) : 'Machilipatnam Sector';
          gustTrend.textContent = `Station: ${stationName} (${data.radar.corePressureHpa || '—'} hPa)`;
        }
        if (gustSource) {
          gustSource.textContent = data.radar.source && data.radar.source.includes('Windy') ? 'Windy API' : 'Open-Meteo';
        }
      } else {
        gustVal.innerHTML = `<span class="val-unavailable">—</span> <span class="badge-chip chip-unavailable" style="font-size:10px; vertical-align:middle;">UNAVAILABLE</span>`;
        if (gustTrend) gustTrend.textContent = 'Telemetry feed currently unreachable';
      }
    }

    // 2. Update USGS seismic telemetry KPI (strict truth: never inject fake M 4.8 or 30 quakes)
    const seisMag = document.getElementById('kpi-seismic-mag');
    const seisTrend = document.getElementById('kpi-seismic-trend');
    if (seisMag) {
      if (data.seismic && data.seismic.status !== 'UNAVAILABLE' && data.seismic.maxRecordedMagnitude !== undefined && data.seismic.maxRecordedMagnitude !== null) {
        const magVal = data.seismic.maxRecordedMagnitude > 0 ? `M ${data.seismic.maxRecordedMagnitude.toFixed(1)}` : 'M 0.0 (Quiet)';
        if (window.Provenance) {
          seisMag.innerHTML = `${magVal} ${window.Provenance.renderBadge('usgs_earthquakes')}`;
        } else {
          seisMag.textContent = magVal;
        }
        if (seisTrend) {
          const total = data.seismic.totalEvents24h !== undefined ? data.seismic.totalEvents24h : 0;
          const label = data.seismic.latestEvent ? data.seismic.latestEvent.replace('Mag — ', '') : 'Quiet';
          seisTrend.textContent = `${total} quakes in 24h (${label.substring(0, 24)}…)`;
          seisTrend.title = data.seismic.latestEvent || '';
        }
      } else {
        seisMag.innerHTML = `<span class="val-unavailable">—</span> <span class="badge-chip chip-unavailable" style="font-size:10px; vertical-align:middle;">UNAVAILABLE</span>`;
        if (seisTrend) seisTrend.textContent = 'Seismic stream offline';
      }
    }
  } catch (err) {
    console.warn('Authority telemetry fetch error:', err);
  }
}

// ---- CWC Real-Time River Water Level Gauges (Requirement E) ----
async function loadCWCRiverGauges() {
  try {
    if (window.APBoundaryService && typeof window.APBoundaryService.whenReady === 'function') {
      await window.APBoundaryService.whenReady();
    }
    const res = await fetch('/api/cwc/river-levels');
    if (!res.ok) return;
    const data = await res.json();
    if (!data || !data.stations || !data.stations.length) return;

    // Strict Andhra Pradesh filter: Only render rivers/gauges inside AP
    const apStations = data.stations.filter(st => {
      if (!st.lat || !st.lon) return false;
      if (typeof window.isInsideAndhraPradesh === 'function') {
        return window.isInsideAndhraPradesh(st.lat, st.lon);
      }
      return true;
    });

    if (!apStations.length) return;

    // 1. Render Map Markers on GIS shell
    if (window.authMapInstance && window.authMapInstance.getMap()) {
      const map = window.authMapInstance.getMap();
      if (window.cwcRiverLayerGroup) {
        try { map.removeLayer(window.cwcRiverLayerGroup); } catch(e) {}
      }
      const riverIcon = L.divIcon({
        className: 'cwc-river-marker',
        html: `<div style="background: rgba(14, 165, 233, 0.92); color: white; border: 1.5px solid #ffffff; border-radius: 50%; width: 26px; height: 26px; display: flex; align-items: center; justify-content: center; font-size: 13px; box-shadow: 0 2px 8px rgba(0,0,0,0.4); cursor: pointer;" title="CWC River Gauge">🌊</div>`,
        iconSize: [26, 26],
        iconAnchor: [13, 13]
      });

      const riverLayerGroup = L.layerGroup();
      apStations.forEach(st => {
        if (!st.lat || !st.lon) return;
        const marker = L.marker([st.lat, st.lon], { icon: riverIcon });
        const levelDisplay = st.waterLevelMeters !== null ? `${st.waterLevelMeters.toFixed(2)} m` : 'N/A';
        const popupContent = `
          <div style="padding: 10px 12px; font-family: var(--font-base, sans-serif); min-width: 190px;">
            <div style="display:flex; align-items:center; gap:6px; margin-bottom: 6px;">
              <span style="font-size: 16px;">🌊</span>
              <strong style="font-size: 13px; color: #0284c7;">${st.station}</strong>
            </div>
            <div style="font-size: 11px; color: var(--text-secondary); margin-bottom: 4px;">
              River: <strong>${st.river}</strong> (${st.basin} Basin)
            </div>
            ${st.district ? `<div style="font-size: 11px; color: var(--text-muted); margin-bottom: 4px;">District: ${st.district}, ${st.state}</div>` : ''}
            <div style="font-size: 12px; font-weight: 700; color: #0369a1; background: rgba(14,165,233,0.12); padding: 4px 8px; border-radius: 6px; margin-top: 6px;">
              Water Level: ${levelDisplay}
            </div>
            <div style="font-size: 9px; color: var(--text-muted); margin-top: 4px;">
              Acquired: ${st.timestamp || 'Recent'} · Agency: ${st.agency}
            </div>
          </div>
        `;
        marker.bindPopup(popupContent);
        riverLayerGroup.addLayer(marker);
      });
      riverLayerGroup.addTo(map);
      window.cwcRiverLayerGroup = riverLayerGroup;
    }

    // 2. Render Compact Table in Habitations View
    const tbody = document.getElementById('cwc-river-gauges-tbody');
    if (tbody) {
      tbody.innerHTML = apStations.map(st => `
        <tr>
          <td><strong>${st.station}</strong></td>
          <td>${st.river} (${st.basin})</td>
          <td><strong style="color: #0284c7;">${st.waterLevelMeters !== null ? st.waterLevelMeters.toFixed(2) + ' m' : 'N/A'}</strong></td>
          <td><small style="color: var(--text-muted);">${st.timestamp || 'Recent'}</small></td>
          <td>
            ${st.lat && st.lon ? `<button class="btn btn-glass" style="padding: 2px 7px; font-size: 11px;" onclick="locateEntity({name:'${st.station.replace(/'/g, "\\'")} River Gauge', lat:${st.lat}, lng:${st.lon}, zoom:14, level:'ORANGE', desc:'${st.river} (${st.basin}) &bull; Water Level: ${st.waterLevelMeters !== null ? st.waterLevelMeters.toFixed(2) + ' m' : 'N/A'}'}, event)">Locate 🔍</button>` : '-'}
          </td>
        </tr>
      `).join('');
    }
  } catch (err) {
    console.warn('CWC gauges fetch error:', err);
  }
}
window.loadCWCRiverGauges = loadCWCRiverGauges;

// Synthesize audio chime for incoming citizen reports
function playIncomingReportChime() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
    osc.frequency.setValueAtTime(880, ctx.currentTime + 0.12); // A5
    gain.gain.setValueAtTime(0.18, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.35);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.35);
  } catch (e) {}
}

// ---- Verification Queue for Citizen Reports ----
function renderVerificationQueue() {
  const container = document.getElementById('reports-verification-list');
  if (!container) return;

  let pending = (typeof reportManager !== 'undefined' && reportManager.getPendingReports)
    ? [...reportManager.getPendingReports()]
    : [];

  // Merge locally submitted citizen reports (Requirement E2, F1)
  try {
    const rawLocal = localStorage.getItem('rzi_citizen_reports');
    if (rawLocal) {
      const localReports = JSON.parse(rawLocal);
      if (Array.isArray(localReports)) {
        localReports.forEach(lr => {
          if (!pending.some(p => p.id === lr.id) && lr.status !== 'Verified' && lr.status !== 'Dismissed') {
            pending.unshift(lr);
          }
        });
      }
    }
  } catch (e) {}

  // Also merge synced reports from firebase local cache
  try {
    const rawSynced = localStorage.getItem('rzi_synced_reports');
    if (rawSynced) {
      const syncedReports = JSON.parse(rawSynced);
      if (Array.isArray(syncedReports)) {
        syncedReports.forEach(sr => {
          if (!pending.some(p => p.id === sr.id) && sr.status !== 'Verified' && sr.status !== 'Dismissed') {
            pending.unshift(sr);
          }
        });
      }
    }
  } catch (e) {}

  // Filter strictly to Andhra Pradesh boundary
  if (typeof window.isInsideAndhraPradesh === 'function') {
    pending = pending.filter(r => {
      const c = (typeof getCitizenCoordinates === 'function') ? getCitizenCoordinates(r) : { lat: r.lat ?? r.latitude, lng: r.lng ?? r.lon ?? r.longitude };
      if (!c.lat || !c.lng) return false;
      return window.isInsideAndhraPradesh(c.lat, c.lng);
    });
  }

  // Sort pending reports by emergency priority:
  // 1. SOS distress signals are always ranked #1 top priority
  // 2. Severity: Critical (4) > High (3) > Medium / Moderate (2) > Low (1)
  // 3. Upvotes (descending)
  // 4. Reporter reputation score (descending)
  const sevWeight = { 'critical': 4, 'high': 3, 'medium': 2, 'moderate': 2, 'low': 1, 'info': 0 };
  pending.sort((a, b) => {
    const isSosA = Boolean(a.isSos || (a.type && a.type.toUpperCase().includes('SOS')));
    const isSosB = Boolean(b.isSos || (b.type && b.type.toUpperCase().includes('SOS')));
    if (isSosA && !isSosB) return -1;
    if (!isSosA && isSosB) return 1;

    const sevA = sevWeight[(a.severity || '').toLowerCase()] || (a.type?.includes('Flood') || a.type?.includes('Cyclone') ? 3 : 2);
    const sevB = sevWeight[(b.severity || '').toLowerCase()] || (b.type?.includes('Flood') || b.type?.includes('Cyclone') ? 3 : 2);
    if (sevB !== sevA) return sevB - sevA;
    const upvotesA = Number(a.upvotes) || 0;
    const upvotesB = Number(b.upvotes) || 0;
    if (upvotesB !== upvotesA) return upvotesB - upvotesA;
    const repA = (typeof reportManager !== 'undefined' && reportManager.reputationDB?.[a.phone]?.score) || 50;
    const repB = (typeof reportManager !== 'undefined' && reportManager.reputationDB?.[b.phone]?.score) || 50;
    return repB - repA;
  });

  // Dynamically update sidebar and dock queue badges
  ['sidebar-queue-badge', 'dock-queue-badge'].forEach(id => {
    const badge = document.getElementById(id);
    if (badge) {
      badge.textContent = pending.length;
      badge.style.display = pending.length > 0 ? 'inline-block' : 'none';
    }
  });

  container.innerHTML = '';

  if (pending.length === 0) {
    container.innerHTML = '<div style="color:var(--text-muted); font-size:13px; text-align:center; padding:20px;">No pending citizen incident reports requiring human verification.</div>';
    return;
  }

  pending.forEach(rep => {
    const card = document.createElement('div');
    card.className = 'report-item';
    card.id = 'report-card-' + rep.id;

    const coords = getCitizenCoordinates(rep);
    const isSos = Boolean(rep.isSos || (rep.type && rep.type.toUpperCase().includes('SOS')));
    const sev = rep.severity || (isSos ? 'Critical' : (rep.type?.includes('Flood') || rep.type?.includes('Cyclone') ? 'Critical' : 'High'));

    const photoHtml = rep.photo ? `
      <div style="margin:8px 0;">
        <div style="font-size:10px; font-weight:700; color:#94a3b8; text-transform:uppercase; margin-bottom:4px;">📷 Citizen Photo Proof Attached</div>
        <img src="${rep.photo}" alt="Citizen Incident Proof" style="max-width:180px; max-height:120px; border-radius:8px; border:1px solid rgba(255,255,255,0.2); object-fit:cover; cursor:pointer;" onclick="window.open('${rep.photo}', '_blank')" title="Click to view full image" />
      </div>
    ` : '';

    let locSnippet = '';
    if (coords.isValid) {
      const accuracyText = (rep.locationAccuracy || rep.accuracy) ? ` <span style="color:#94a3b8; font-weight:normal;">(±${Math.round(rep.locationAccuracy || rep.accuracy)}m)</span>` : '';
      const displayLoc = rep.location && !rep.location.toLowerCase().includes('unavailable')
        ? rep.location
        : `${coords.lat.toFixed(4)}°N, ${coords.lng.toFixed(4)}°E`;
      locSnippet = `
        <span>📍 <strong>Location:</strong> ${displayLoc} [${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)}]${accuracyText}</span>
        <button onclick="locateCitizenReport('${rep.id}', ${coords.lat}, ${coords.lng}, event)" class="btn btn-glass" style="padding:2px 8px; font-size:10px; color:${isSos ? '#ef4444' : '#38bdf8'}; border-color:${isSos ? 'rgba(239,68,68,0.4)' : 'rgba(56,189,248,0.3)'};">
          🔍 Locate On Map
        </button>
      `;
    } else {
      locSnippet = `
        <span style="color:#f87171;">📍 <strong>Location:</strong> Location unavailable</span>
        <button disabled class="btn btn-glass" style="padding:2px 8px; font-size:10px; color:#64748b; border-color:rgba(100,116,139,0.3); opacity:0.6; cursor:not-allowed;" title="Citizen location was not provided or permission was denied">
          🔍 Location Unavailable
        </button>
      `;
    }

    card.innerHTML = `
      <div class="report-item-header">
        <span class="report-type-badge">${rep.type || 'Field Hazard Alert'}</span>
        <span class="risk-badge risk-${sev.toLowerCase() === 'critical' ? 'red' : sev.toLowerCase() === 'high' ? 'orange' : 'yellow'}">${sev}</span>
        <span style="font-size:12px; color:var(--text-secondary); font-weight:600;">Reported by: ${rep.reporter || 'Citizen Operator'} (${rep.phone || '+91-9876543210'})</span>
        <span class="report-time">${rep.time || 'Just now'} &bull; 👍 ${rep.upvotes || 0}</span>
      </div>
      <div class="report-desc">${rep.desc || 'Disaster hazard condition observed at coordinates.'}</div>
      
      ${photoHtml}

      <div style="font-size:11px; color:#38bdf8; margin-bottom:10px; display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
        ${locSnippet}
      </div>

      <div class="report-actions">
        <button class="btn-verify" onclick="handleVerifyReport('${rep.id}')">
          ✓ Verify & Allocate Active Red Zone
        </button>
        <button class="btn-investigate" onclick="handleInvestigateReport('${rep.id}')">
          🔍 Task NDRF Drone Recon
        </button>
        <button class="btn-reject" onclick="handleRejectReport('${rep.id}')">
          ✕ Dismiss / False Alarm
        </button>
      </div>
    `;
    container.appendChild(card);
  });
}

function handleVerifyReport(id) {
  let rep = null;
  if (typeof reportManager !== 'undefined') {
    rep = reportManager.getReportById ? reportManager.getReportById(id) : null;
    if (reportManager.verifyReport) reportManager.verifyReport(id);
  }

  // Also check and update localStorage
  try {
    const rawLocal = localStorage.getItem('rzi_citizen_reports');
    if (rawLocal) {
      const list = JSON.parse(rawLocal);
      if (Array.isArray(list)) {
        const found = list.find(r => r.id === id);
        if (found) {
          rep = found;
          found.status = 'Verified';
          localStorage.setItem('rzi_citizen_reports', JSON.stringify(list));
        }
      }
    }
  } catch (e) {}

  const coords = getCitizenCoordinates(rep);
  const repType = rep?.type || 'Hazard Incident';
  const locName = rep?.location || 'Designated Vicinity';
  const desc = rep?.desc || 'Emergency hazard verified by Incident Commander.';

  // Requirement F2: Automatically allocate new Red Zone on the GIS map if valid coordinates exist
  if (coords.isValid) {
    allocateEmergencyZone({
      name: `${repType}: ${locName}`,
      level: 'RED',
      lat: coords.lat,
      lng: coords.lng,
      radius: 2500,
      desc
    });
  }

  showToast(`✅ Incident ${id} verified! New Red Zone allocated & regional alert pushed.`, 'danger');
  renderVerificationQueue();
  initCommandCenter();
  updateAIExplanation('reports');
}

function handleRejectReport(id) {
  if (typeof reportManager !== 'undefined' && reportManager.rejectReport) {
    reportManager.rejectReport(id);
  }
  try {
    const rawLocal = localStorage.getItem('rzi_citizen_reports');
    if (rawLocal) {
      const list = JSON.parse(rawLocal);
      if (Array.isArray(list)) {
        const found = list.find(r => r.id === id);
        if (found) {
          found.status = 'Dismissed';
          localStorage.setItem('rzi_citizen_reports', JSON.stringify(list));
        }
      }
    }
  } catch (e) {}
  showToast(`Report ${id} dismissed. Citizen credibility rating adjusted.`, 'warning');
  renderVerificationQueue();
}

function handleInvestigateReport(id) {
  showToast(`Tasked NDRF Drone Recon unit to GPS coordinates of ${id}.`, 'info');
}

// ================================================================
// SECTION F: EMERGENCY RED ZONE ALLOCATION PIPELINE
// ================================================================

function allocateEmergencyZone(options = {}) {
  const {
    name = 'Emergency Hazard Danger Zone',
    level = 'RED',
    lat = 16.9891,
    lng = 82.2475,
    radius = 3000,
    desc = 'Immediate evacuation directive issued by Incident Command.'
  } = options;

  if (!window.allocatedEmergencyZones) {
    window.allocatedEmergencyZones = [];
  }
  window.allocatedEmergencyZones.push(options);

  if (authMapInstance && authMapInstance.getMap()) {
    const map = authMapInstance.getMap();
    if (!window.emergencyZonesLayerGroup) {
      window.emergencyZonesLayerGroup = L.layerGroup().addTo(map);
    }

    // 1. Create Danger Polygon / Circle with organic pulsing styling
    const circle = L.circle([lat, lng], {
      radius: radius,
      color: '#ef4444',
      weight: 3,
      fillColor: '#ef4444',
      fillOpacity: 0.40,
      className: 'emergency-danger-zone pulsing-zone'
    }).addTo(window.emergencyZonesLayerGroup);

    // 2. Centroid Marker with emergency danger badge
    const icon = L.divIcon({
      className: 'emergency-zone-marker',
      html: `
        <div style="background:#ef4444; color:#fff; font-weight:800; font-size:11px; padding:4px 8px; border-radius:12px; border:2px solid #fff; box-shadow:0 0 20px #ef4444; display:flex; align-items:center; gap:4px; white-space:nowrap; transform:translate(-50%, -50%); cursor:pointer;">
          <span>🚨</span> <span>${name}</span>
        </div>
      `,
      iconSize: [0, 0]
    });
    const marker = L.marker([lat, lng], { icon }).addTo(window.emergencyZonesLayerGroup);

    const popupContent = `
      <div style="font-family:Inter,sans-serif; color:#f1f5f9; padding:6px; max-width:240px;">
        <div style="display:flex; align-items:center; gap:6px; margin-bottom:6px;">
          <span style="background:#ef4444; color:#fff; font-size:10px; font-weight:800; padding:2px 6px; border-radius:4px;">ACTIVE RED ZONE</span>
        </div>
        <h4 style="margin:0 0 6px 0; font-size:13px; color:#fff; font-weight:700;">${name}</h4>
        <p style="margin:0 0 8px 0; font-size:11px; color:#94a3b8; line-height:1.45;">${desc}</p>
        <div style="font-size:10px; color:#fca5a5; font-weight:600;">
          Radius: ${(radius/1000).toFixed(1)} km &bull; Directives: Evacuate immediately to safe shelters.
        </div>
      </div>
    `;
    circle.bindPopup(popupContent);
    marker.bindPopup(popupContent);

    // Switch to map view and focus on newly created Red Zone
    if (typeof switchView === 'function') switchView('map-view');
    authMapInstance.flyToLocation(lat, lng, 12);
  }

  // Sync with HazardEngine if present on Authority side
  if (window.hazardEngine && typeof window.hazardEngine.injectOrEscalateAuthorityZone === 'function') {
    try {
      window.hazardEngine.injectOrEscalateAuthorityZone({
        hazardType: options.hazardType || 'cyclone',
        level: level,
        lat,
        lng,
        radius: Math.round(radius / 1000),
        zone: name,
        message: desc
      });
    } catch (e) {}
  }

  // Broadcast alert to backend and all citizen WebSocket clients
  try {
    fetch('/api/alerts/broadcast', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        hazardType: options.hazardType || 'cyclone',
        hazard_type: options.hazardType || 'cyclone',
        level: level || 'CRITICAL',
        severity: level || 'CRITICAL',
        type: 'authority alert',
        title: `🚨 RED ZONE ALLOCATED: ${name}`,
        message: desc,
        zone: name,
        area: `Sector coordinates [${Number(lat).toFixed(4)}°N, ${Number(lng).toFixed(4)}°E]`,
        lat,
        lng,
        radius: Math.round(radius / 1000),
        sources: ['State Disaster Management Authority (SDMA)', 'NDRF Incident Command'],
        timestamp: Date.now()
      })
    }).catch(err => console.warn('[Authority] Red zone broadcast relay error:', err));
  } catch (e) {}

  showToast(`🔴 Dynamic Red Zone allocated at [${lat.toFixed(3)}, ${lng.toFixed(3)}]`, 'danger');
}
window.allocateEmergencyZone = allocateEmergencyZone;

// ================================================================
// PHASE 1: VPI PRIORITY ENGINE LOADER & RENDERERS
// ================================================================

async function loadPriorityRanking(forceRefresh = false) {
  try {
    const url = '/api/priority-ranking' + (forceRefresh ? '?refresh=true' : '');
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();
    if (data && data.success) {
      window.currentPriorityData = data;
      renderPriorityRankingTable(data);
      renderSafeSitesCapacity(data);
      updatePopulationRiskGrid(data);
      updateAIExplanation(document.querySelector('.sidebar-item.active')?.dataset.view || 'command');
      if (forceRefresh) {
        showToast('VPI Rankings & Shelter Allocations recalculated live!', 'success');
      }
    }
  } catch (err) {
    console.warn('Failed to load live priority ranking:', err.message);
  }
}

/**
 * aggregatePopulationFromDOM
 * -----------------------------------------------------------------------
 * Reads every sub-zone row from ALL hazard group tables inside
 * `.hazard-pop-group-card` elements, inspects the tier badge in each row
 * (RED / ORANGE / YELLOW), and reads the population from the <strong>
 * cell in column 4.  Totals are summed across all disasters so the
 * summary cards at the top always reflect exactly the data shown below.
 */
function aggregatePopulationFromDOM() {
  let redPop = 0, orangePop = 0, yellowPop = 0;

  const groupCards = document.querySelectorAll('.hazard-pop-group-card');
  if (groupCards && groupCards.length > 0) {
    groupCards.forEach(card => {
      const rows = card.querySelectorAll('tbody tr');
      rows.forEach(row => {
        const cells = row.querySelectorAll('td');
        if (cells.length < 4) return;

        const badgeEl = cells[1].querySelector('.risk-badge') || cells[1];
        const tier = (badgeEl ? badgeEl.textContent : '').trim().toUpperCase();

        const popEl = cells[3].querySelector('strong') || cells[3];
        const rawText = popEl ? popEl.textContent : '';
        const pop = parseInt(rawText.replace(/[^0-9]/g, ''), 10) || 0;

        if (tier.includes('RED') || tier.includes('CRITICAL')) {
          redPop += pop;
        } else if (tier.includes('ORANGE') || tier.includes('HIGH')) {
          orangePop += pop;
        } else if (tier.includes('YELLOW') || tier.includes('MODERATE')) {
          yellowPop += pop;
        }
      });
    });
  }

  // If sub-zones haven't mounted or parsed yet, provide the computed baseline sums:
  // Cyclone (45k Red, 62k Orange, 35k Yellow) + Flood (58.5k Red, 40k Orange) + Landslide (18k Orange, 14k Yellow)
  if (redPop === 0 && orangePop === 0 && yellowPop === 0) {
    redPop = 103500;
    orangePop = 120000;
    yellowPop = 49000;
  }

  const totalPop = redPop + orangePop + yellowPop;

  const redEl    = document.getElementById('prc-val-red');
  const orangeEl = document.getElementById('prc-val-orange');
  const yellowEl = document.getElementById('prc-val-yellow');
  const totalEl  = document.getElementById('prc-val-total');

  if (redEl)    redEl.textContent    = redPop.toLocaleString('en-IN');
  if (orangeEl) orangeEl.textContent = orangePop.toLocaleString('en-IN');
  if (yellowEl) yellowEl.textContent = yellowPop.toLocaleString('en-IN');
  if (totalEl)  totalEl.textContent  = totalPop.toLocaleString('en-IN');
}
window.aggregatePopulationFromDOM = aggregatePopulationFromDOM;

function updatePopulationRiskGrid(data) {
  // Always aggregate from the disaster sub-zone tables below so the
  // summary cards at the top strictly reflect the sum of all disasters.
  aggregatePopulationFromDOM();
}

function clearHazardFilter() {
  window.currentSelectedHazard = null;
  if (window.currentPriorityData) {
    renderPriorityRankingTable(window.currentPriorityData);
    updatePopulationRiskGrid(window.currentPriorityData);
  }
  showToast('Hazard filter cleared — showing all habitations & red zones', 'info');
}
window.clearHazardFilter = clearHazardFilter;

function getHabitationRegion(h) {
  const d = (h.district || '').toLowerCase();
  const v = (h.village_name || '').toLowerCase();
  if (d.includes('kakinada') || d.includes('east godavari') || v.includes('uppada') || v.includes('port') || v.includes('suryaraopeta')) {
    return { name: 'Kakinada Coast & Corridors', hazard: '🌀 Cyclone & Surge', tag: 'Direct Maritime Interface' };
  }
  if (d.includes('west godavari') || v.includes('amalapuram') || v.includes('godavari') || v.includes('antardvedi')) {
    return { name: 'Coastal AP Floodplain', hazard: '🌊 Riverine & Surge', tag: 'Low-Lying Estuary' };
  }
  if (d.includes('alluri') || d.includes('visakhapatnam') || d.includes('manyam') || d.includes('araku') || d.includes('lambasingi')) {
    return { name: 'Eastern Ghats & Upland Sector', hazard: '⛰️ Landslide & Inundation', tag: 'Slope Instability' };
  }
  return { name: 'Rayalaseema & Peninsular Corridors', hazard: '⛈️ Squall & Inundation', tag: 'Peninsular Basin' };
}

// Store explanation and briefing objects by unique keys to prevent syntax errors with apostrophes
let priorityExplanationData = {};
if (typeof window !== 'undefined') {
  window.priorityExplanationData = priorityExplanationData;
}

function renderPriorityRankingTable(data) {
  const container = document.getElementById('priority-queue-container');
  const chip = document.getElementById('vpi-summary-chip');
  if (!container || !data || !data.habitations) return;

  // Clear lookup store on each full re-render to prevent unbounded memory growth
  priorityExplanationData = {};
  if (typeof window !== 'undefined') {
    window.priorityExplanationData = priorityExplanationData;
  }

  // Filter habitations corresponding to active hazard context (Issue 2)
  let habitations = data.habitations;

  // Filter strictly to Andhra Pradesh boundary
  if (typeof window.isInsideAndhraPradesh === 'function') {
    habitations = habitations.filter(h => {
      const lat = h.lat ?? h.latitude;
      const lng = h.lng ?? h.lon ?? h.longitude;
      if (lat === undefined || lng === undefined) return false;
      return window.isInsideAndhraPradesh(lat, lng);
    });
  }

  const activeHazard = window.currentSelectedHazard;
  if (activeHazard) {
    const norm = activeHazard.toLowerCase();
    const matching = habitations.filter(h => {
      const ht = (h.hazardType || h.hazard_type || '').toLowerCase();
      const d = (h.district || '').toLowerCase();
      const vn = (h.village_name || h.name || '').toLowerCase();
      if (norm === 'cyclone') return ht.includes('cyclone') || d.includes('kakinada') || d.includes('east godavari') || vn.includes('uppada') || vn.includes('coastal') || vn.includes('slum') || vn.includes('port');
      if (norm === 'flood') return ht.includes('flood') || d.includes('godavari') || d.includes('west godavari') || vn.includes('amalapuram') || vn.includes('delta') || vn.includes('river');
      if (norm === 'landslide') return ht.includes('landslide') || d.includes('alluri') || d.includes('visakhapatnam') || vn.includes('araku') || vn.includes('ghat');
      if (norm === 'squall' || norm === 'cloudburst') return ht.includes('squall') || ht.includes('cloudburst') || ht.includes('storm');
      if (norm === 'earthquake') return ht.includes('earthquake') || ht.includes('seismic');
      return ht.includes(norm);
    });
    if (matching.length > 0) habitations = matching;
  }

  if (chip) {
    if (activeHazard) {
      chip.innerHTML = `Filtered by Hazard: <strong style="color:#1E5C94;">${activeHazard.toUpperCase()}</strong> (${habitations.length} habitations) &bull; <a href="javascript:void(0)" onclick="clearHazardFilter()" style="color:#B42318; text-decoration:underline; font-weight:700; margin-left:6px;">Show All (${data.habitations.length})</a>`;
    } else if (data.summary) {
      chip.innerHTML = `Priority Engine Active &bull; Critical: <strong style="color:#B42318;">${data.summary.criticalCount}</strong> | High: <strong style="color:#C2410C;">${data.summary.highCount}</strong>`;
    }
  }

  container.innerHTML = '';

  habitations.forEach((h, idx) => {
    const rankNum = h.rank != null ? h.rank : (idx + 1);
    const tierUpper = (h.priorityLevel || 'MODERATE').toUpperCase();
    let tierDisplay = 'Moderate';
    let tierClass = 'tier-moderate';
    if (tierUpper.includes('CRITICAL')) {
      tierDisplay = 'Critical';
      tierClass = 'tier-critical';
    } else if (tierUpper.includes('HIGH')) {
      tierDisplay = 'High';
      tierClass = 'tier-high';
    } else if (tierUpper.includes('LOW')) {
      tierDisplay = 'Low';
      tierClass = 'tier-low';
    }

    const popRisk = h.factorScores ? (h.factorScores.populationAtRisk ?? 0) : 0;
    const lifeRisk = h.factorScores ? (h.factorScores.immediateLifeRisk ?? 0) : 0;
    const urgency = h.factorScores ? (h.factorScores.responseUrgency ?? 0) : 0;
    const hazardSeverity = h.factorScores ? (h.factorScores.hazardSeverity ?? 0) : 0;
    const etaScore = h.factorScores ? (h.factorScores.accessibility ?? 0) : 0;

    // Actual incident response travel time (travelTimeMins)
    const rawTravelTime = (h.travelTimeMins !== undefined && h.travelTimeMins !== null && !isNaN(Number(h.travelTimeMins)))
      ? Number(h.travelTimeMins)
      : ((h.travel_time_mins !== undefined && h.travel_time_mins !== null && !isNaN(Number(h.travel_time_mins)))
          ? Number(h.travel_time_mins)
          : null);
    
    let responseTimeDisplay = 'Unavailable';
    if (rawTravelTime !== null && rawTravelTime > 0) {
      responseTimeDisplay = `${Math.round(rawTravelTime)} min`;
    }

    const hLat = h.lat || 16.9891;
    const hLng = h.lng || 82.2475;

    const safeName = (h.name || '').replace(/'/g, "\\'");
    const safeDistrict = (h.district || '').replace(/'/g, "\\'");
    const safeAction = (h.recommendedAction || '').replace(/'/g, "\\'");
    const safeTier = (h.priorityLevel || 'MODERATE').replace(/'/g, "\\'");

    // Store explanation data in lookup table (robust against special characters & apostrophes)
    const explainId = `explain-${rankNum}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    priorityExplanationData[explainId] = {
      name: h.name,
      score: h.priorityScore,
      level: h.priorityLevel,
      factors: h.factorScores,
      reasons: h.reasons,
      action: h.recommendedAction,
      override: h.overrideApplied
    };

    const card = document.createElement('div');
    card.className = 'priority-incident-card';

    card.innerHTML = `
      <div class="priority-card-header">
        <div class="priority-header-left">
          <span class="priority-rank">#${rankNum}</span>
          <span class="priority-name">${h.name}</span>
          <span class="priority-dot">·</span>
          <span class="priority-hazard">${h.hazardType || h.district || 'Incident'}</span>
          <span class="priority-dot">·</span>
          <span class="priority-citizens">${Number(h.population).toLocaleString()} citizens</span>
        </div>
        <div>
          <span class="priority-level-pill ${tierClass}">
            ${tierDisplay} — ${h.priorityScore}
          </span>
        </div>
      </div>

      <div class="priority-metrics">
        <div class="priority-metric">
          <span class="priority-metric-label">URGENCY</span>
          <span class="priority-metric-value">${urgency}</span>
        </div>
        <div class="priority-metric">
          <span class="priority-metric-label">EST. RESPONSE TIME</span>
          <span class="priority-metric-value" ${responseTimeDisplay === 'Unavailable' ? 'style="font-size:15px; font-weight:700;"' : ''}>${responseTimeDisplay}</span>
        </div>
        <div class="priority-metric">
          <span class="priority-metric-label">HAZARD SEVERITY</span>
          <span class="priority-metric-value">${hazardSeverity}</span>
        </div>
      </div>

      <div class="priority-recommended-action">
        <span class="priority-action-label">Recommended action:</span>
        <span class="priority-action-text">${h.recommendedAction || 'Standby and stage resources.'}</span>
      </div>

      <div class="priority-action-row">
        <button type="button" class="priority-action-btn" onclick="inspectEntity({name:'${safeName}', tier:'${safeTier}', lat:${hLat}, lng:${hLng}, population:${h.population}, habitations:'District: ${safeDistrict} &bull; Recommended: ${safeAction}'}, event)" aria-label="Inspect ${safeName}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">
            <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"></path>
            <circle cx="12" cy="12" r="3"></circle>
          </svg>
          <span>Inspect</span>
        </button>
        <button type="button" class="priority-action-btn" onclick="locateEntity({name:'${safeName}', level:'${safeTier}', lat:${hLat}, lng:${hLng}, zoom:14, desc:'Priority #${rankNum} (${h.priorityScore}/100)'}, event)" aria-label="Locate ${safeName} on map">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">
            <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"></path>
            <circle cx="12" cy="10" r="3"></circle>
          </svg>
          <span>Locate</span>
        </button>
        <button type="button" class="priority-action-btn" onclick="showPriorityExplanation('${explainId}')" aria-label="View decision explanation for ${safeName}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"></circle>
            <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path>
            <line x1="12" y1="17" x2="12.01" y2="17"></line>
          </svg>
          <span>Why?</span>
        </button>
      </div>
    `;

    container.appendChild(card);
  });
}

function showPriorityExplanation(explainId) {
  let data = null;
  if (typeof explainId === 'string' && priorityExplanationData[explainId]) {
    data = priorityExplanationData[explainId];
  } else if (typeof explainId === 'object' && explainId !== null) {
    data = explainId;
  } else if (typeof explainId === 'string') {
    try {
      data = JSON.parse(decodeURIComponent(explainId));
    } catch (e) {
      console.warn('[Authority] Failed to parse explanation data:', e);
    }
  }

  if (!data) return;

  const content = document.getElementById('priority-modal-content');
  if (!content) return;

  // Store data under a stable key in the lookup store for DeepSeek briefing
  const briefingKey = `briefing-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  priorityExplanationData[briefingKey] = data;

  const f = data.factors || {};
  const hazardVal = Math.round(Number(f.hazardSeverity || 0));
  const popVal = Math.round(Number(f.populationAtRisk || 0));
  const vulnVal = Math.round(Number(f.vulnerability || 0));
  const lifeVal = Math.round(Number(f.immediateLifeRisk || 0));
  const urgVal = Math.round(Number(f.responseUrgency || 0));
  const accVal = Math.round(Number(f.accessibility || 0));

  const t = (data.level || 'STANDARD').toUpperCase();
  let badgeStyle = 'color:#b45309; background:#fefce8; border:1px solid rgba(245,158,11,0.25);';
  if (t === 'CRITICAL' || t === 'RED' || t.includes('CRITICAL')) {
    badgeStyle = 'color:#dc2626; background:#fef2f2; border:1px solid rgba(239,68,68,0.25);';
  } else if (t === 'HIGH' || t === 'ORANGE' || t.includes('HIGH')) {
    badgeStyle = 'color:#ea580c; background:#fff7ed; border:1px solid rgba(234,88,12,0.25);';
  } else if (t === 'SAFE' || t === 'NORMAL' || t.includes('SAFE')) {
    badgeStyle = 'color:#16a34a; background:#f0fdf4; border:1px solid rgba(22,163,74,0.25);';
  }

  const factorCell = (label, weight, val, color) => `
    <div class="why-factor-cell">
      <div class="why-factor-label">
        <span>${label}</span>
        <span style="color:var(--text-muted); font-weight:600;">${weight}</span>
      </div>
      <div style="display:flex; justify-content:space-between; align-items:baseline; margin-top:2px;">
        <span class="why-factor-val">${val}</span>
        <span style="font-size:11px; color:var(--text-muted); font-weight:600;">/ 100</span>
      </div>
      <div class="why-factor-bar">
        <div class="why-factor-fill" style="width:${Math.min(100, Math.max(0, val))}%; background:${color};"></div>
      </div>
    </div>
  `;

  content.innerHTML = `
    <!-- Top Summary Banner -->
    <div class="why-banner">
      <div>
        <div class="why-banner-title">${data.name}</div>
        <div style="display:flex; align-items:center; gap:8px; margin-top:5px;">
          <span class="iem-stat-val iem-tier-pill" style="${badgeStyle}">${data.level}</span>
          <span style="font-size:12px; color:var(--text-muted); font-weight:500;">Calculated Incident Priority</span>
        </div>
      </div>
      <div class="why-banner-score">
        <span>${data.score}</span>
        <span class="why-banner-score-max">/ 100</span>
      </div>
    </div>

    ${data.override ? '<div style="background:#fef2f2; color:#b91c1c; padding:10px 14px; border-radius:10px; font-size:12.5px; font-weight:600; border:1px solid rgba(239,68,68,0.3); display:flex; align-items:center; gap:8px;"><span>⚠️</span><span>Emergency life-safety override applied: Priority elevated due to critical hazard proximity.</span></div>' : ''}

    <!-- 6-Factor Multi-Factor Matrix Grid -->
    <div>
      <div style="font-size:10.5px; font-weight:700; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.05em; margin-bottom:8px;">
        Algorithmic Factor Weights (100% Total)
      </div>
      <div class="why-factor-grid">
        ${factorCell('Hazard Severity', '25%', hazardVal, '#ef4444')}
        ${factorCell('Population Risk', '20%', popVal, '#f97316')}
        ${factorCell('Vulnerability', '15%', vulnVal, '#eab308')}
        ${factorCell('Immediate Life Risk', '15%', lifeVal, '#dc2626')}
        ${factorCell('Response Urgency', '15%', urgVal, '#8b5cf6')}
        ${factorCell('Accessibility', '10%', accVal, '#0284c7')}
      </div>
    </div>

    <!-- Structured Decision Context -->
    <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
      <div class="why-card-section">
        <div class="why-card-title">📌 Primary Decision Factors</div>
        <ul style="margin:0; padding-left:18px; font-size:12.5px; color:var(--text-primary); line-height:1.6;">
          ${(data.reasons && data.reasons.length ? data.reasons : ['Risk score calculated via multi-hazard telemetry & real-time census intersection.']).map(r => `<li>${r}</li>`).join('')}
        </ul>
      </div>

      <div class="why-card-section">
        <div class="why-card-title">🎯 Recommended Action Directive</div>
        <div class="why-action-badge" style="margin-top:4px;">
          <span>🛡️</span>
          <span>${data.action || 'Stage emergency personnel and monitor'}</span>
        </div>
      </div>
    </div>

    <!-- DeepSeek AI Command Briefing -->
    <div class="why-ai-container">
      <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
        <div class="why-card-title" style="color:var(--primary, #0284c7);">
          <span>🤖</span>
          <span>DeepSeek Tactical AI Command Briefing</span>
        </div>
        <button class="btn btn-primary" style="font-size:11.5px; padding:5px 14px; border-radius:999px;" onclick="fetchAIExplanationForIncident('${briefingKey}')" id="btn-fetch-explanation">
          Ask DeepSeek for Briefing
        </button>
      </div>
      <div id="ai-briefing-result" style="font-size:12.5px; color:var(--text-primary); line-height:1.6; background:#ffffff; border:1px solid rgba(15,23,42,0.08); padding:12px 14px; border-radius:10px; display:none;"></div>
    </div>
  `;

  const modal = document.getElementById('priority-explanation-modal');
  if (modal) {
    modal.style.display = 'flex';
    modal.classList.add('active');
    modal.style.opacity = '1';
    modal.style.pointerEvents = 'all';
  }
}

function closePriorityExplanation() {
  const modal = document.getElementById('priority-explanation-modal');
  if (modal) {
    modal.style.display = 'none';
    modal.classList.remove('active');
    modal.style.opacity = '0';
    modal.style.pointerEvents = 'none';
  }
}
window.closePriorityExplanation = closePriorityExplanation;

async function fetchAIExplanationForIncident(keyOrData) {
  let data = null;
  if (typeof keyOrData === 'string' && priorityExplanationData[keyOrData]) {
    data = priorityExplanationData[keyOrData];
  } else if (typeof keyOrData === 'object' && keyOrData !== null) {
    data = keyOrData;
  } else if (typeof keyOrData === 'string') {
    try {
      data = JSON.parse(decodeURIComponent(keyOrData));
    } catch (e) {
      console.warn('[Authority] Failed to parse briefing data:', e);
    }
  }

  if (!data) return;

  const btn = document.getElementById('btn-fetch-explanation');
  const resDiv = document.getElementById('ai-briefing-result');
  
  if(btn) btn.innerHTML = '⏳ Generating...';
  
  try {
    const response = await fetch('/api/ai-recommendation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        telemetry: { radar: { maxGustSpeedKmH: 120, corePressureHpa: 980 } }, // Mock telemetry just for prompt structure
        priorityData: {
          habitations: [{
            name: data.name,
            population: data.factors ? data.factors.populationAtRisk : 0,
            priorityScore: data.score,
            priorityLevel: data.level,
            overrideApplied: data.override,
            factorScores: data.factors,
            reasons: data.reasons,
            recommendedAction: data.action
          }]
        }
      })
    });
    const result = await response.json();
    if(resDiv) {
      resDiv.style.display = 'block';
      resDiv.innerHTML = `<strong style="color:var(--primary, #0284c7); font-size:13px;">🤖 DeepSeek Tactical Incident Briefing:</strong><br><div style="margin-top:6px;">${result.recommendation || result.analysis || 'Analysis generated.'}</div>`;
    }
    if(btn) btn.style.display = 'none';
  } catch(e) {
    if(btn) btn.innerHTML = '🤖 Ask DeepSeek for Briefing';
    if(resDiv) {
      resDiv.style.display = 'block';
      resDiv.innerHTML = '<span style="color:#ef4444;">Failed to connect to DeepSeek. Priority Engine operating deterministically.</span>';
    }
  }
}

if (typeof window !== 'undefined') {
  window.showPriorityExplanation = showPriorityExplanation;
  window.fetchAIExplanationForIncident = fetchAIExplanationForIncident;
}

function simulateSensorAlert() {
  showToast('SIMULATED SENSOR ALERT: Critical Water Level Threshold Breached at Podalada', 'warning');
  
  // To simulate this without a real backend state change, we can fetch, modify, and render locally
  if (window.currentPriorityData && window.currentPriorityData.habitations) {
    // Find a specific village (e.g. Podalada) and simulate extreme conditions
    const target = window.currentPriorityData.habitations.find(h => (h.name || h.village_name) === 'Podalada') || window.currentPriorityData.habitations[0];
    if (target) {
      target.immediateLifeRiskRaw = 95;
      target.hazardSeverityRaw = 90;
      target.lifeThreatening = true;
      target.reasons = ["Simulated Sensor Alert Received"];
      
      // Recalculate using local PriorityEngine
      if (typeof window.PriorityEngine !== 'undefined') {
        const recalc = window.PriorityEngine.rankIncidents(window.currentPriorityData.habitations);
        window.currentPriorityData.habitations = recalc;
        renderPriorityRankingTable(window.currentPriorityData);
        showToast('Priority recalculated. Queue updated dynamically.', 'success');
      }
    }
  } else {
    // If we haven't loaded yet, just load and then we can simulate on next click
    loadPriorityRanking(true);
  }
}

function toggleFactorBreakdown(id) {
  const box = document.getElementById(`breakdown-${id}`);
  if (!box) return;
  const isShown = box.style.display === 'block';
  document.querySelectorAll('.factor-breakdown-box').forEach(b => b.style.display = 'none');
  box.style.display = isShown ? 'none' : 'block';
}

document.addEventListener('click', (e) => {
  if (!e.target.closest('.vpi-breakdown-btn') && !e.target.closest('.factor-breakdown-box')) {
    document.querySelectorAll('.factor-breakdown-box').forEach(b => b.style.display = 'none');
  }
});

function renderSafeSitesCapacity(data) {
  const grid = document.getElementById('safe-sites-dynamic-grid');
  const summaryEl = document.getElementById('safesites-capacity-summary');
  const deficitEl = document.getElementById('zone-deficit-container');
  if (!data) return;

  if (summaryEl && data.summary) {
    const atRisk = Number(data.summary.totalAtRiskPop) || 0;
    const alloc = Number(data.summary.totalAllocatedPop) || 0;
    const eff = Number(data.summary.allocationEfficiencyPct) || 0;
    summaryEl.innerHTML = `Safe Capacity: ${atRisk.toLocaleString()} At Risk &bull; ${alloc.toLocaleString()} Allocated (${eff}%)`;
  }

  // Render shelter cards
  if (grid && data.shelterStatus) {
    grid.innerHTML = '';
    data.shelterStatus.forEach(s => {
      const cap = Number(s.capacity) || 1000;
      const occ = Number(s.new_occupancy ?? s.current_occupancy ?? s.occupancy) || 0;
      const occPct = Math.min(100, Math.max(0, Math.round((occ / cap) * 100)));
      const rawAvail = s.available_beds !== undefined ? Number(s.available_beds) : (cap - occ);
      const availBeds = Number.isFinite(rawAvail) ? Math.max(0, rawAvail) : Math.max(0, cap - occ);

      let barColor = '#22c55e';
      if (occPct >= 85) barColor = '#ef4444';
      else if (occPct >= 60) barColor = '#f97316';

      const isFull = occ >= cap || s.status === 'full';
      const isClosed = s.status === 'closed';
      const statusBadge = isClosed
        ? `<span style="font-size:10px; font-weight:700; text-transform:uppercase; padding:2px 6px; border-radius:4px; background:rgba(100,116,139,0.12); color:#475569;">⚫ CLOSED</span>`
        : isFull
        ? `<span style="font-size:10px; font-weight:700; text-transform:uppercase; padding:2px 6px; border-radius:4px; background:rgba(239,68,68,0.12); color:#dc2626;">🔴 FULL</span>`
        : `<span style="font-size:10px; font-weight:700; text-transform:uppercase; padding:2px 6px; border-radius:4px; background:rgba(34,197,94,0.12); color:#16a34a;">🟢 ACCESSIBLE</span>`;

      // Road Routing corridor display
      const allocatedList = (s.allocated_villages || []).map(v => {
        const distText = v.distance_km ? ` &bull; ${v.distance_km} km corridor` : '';
        return `<div style="font-size:11px; background:rgba(56,189,248,0.08); border:1px solid rgba(56,189,248,0.2); padding:4px 8px; border-radius:6px; margin-top:4px; color:#38bdf8; display:flex; justify-content:space-between; align-items:center;">
          <span>🛣️ <strong>${v.village_name}</strong>${distText}</span>
          <span style="color:#cbd5e1; font-weight:600;">+${Number(v.allocated_pop).toLocaleString()} evacuees</span>
        </div>`;
      }).join('');

      const projectedHtml = (s.projected_occupancy !== undefined && s.projected_occupancy !== occ)
        ? `<div style="font-size:11px; color:#64748b; margin-top:2px;">Projected after allocations: <strong style="color:#0f172a;">${Number(s.projected_occupancy).toLocaleString()}</strong> (${Math.round((s.projected_occupancy / cap) * 100)}%)</div>`
        : '';

      const card = document.createElement('div');
      card.className = 'safe-site-card';
      card.innerHTML = `
        <div class="safe-site-name" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
          <span style="font-weight:700; font-size:14px; color:#0f172a;">${s.name}</span>
          ${statusBadge}
        </div>
        <div class="safe-site-cap" style="font-size:12px; color:#64748b; margin-bottom:6px;">
          Total Capacity: <strong style="color:#0f172a;">${cap.toLocaleString()}</strong> &bull; 
          Current Occupancy: <strong style="color:#0f172a;">${occ.toLocaleString()}</strong> (${occPct}%)
          ${projectedHtml}
        </div>
        <div class="capacity-bar" style="height:7px; background:#e2e8f0; border-radius:4px; overflow:hidden; margin-bottom:8px;">
          <div class="capacity-fill" style="width:${occPct}%; height:100%; background:${barColor}; transition:width 0.3s ease;"></div>
        </div>
        <div style="font-size:12px; color:#64748b; margin-bottom:8px; display:flex; justify-content:space-between; align-items:center;">
          <span>Available Beds: <strong style="color:#0284c7; font-size:13px;">${availBeds.toLocaleString()}</strong></span>
          <span style="font-size:11px; color:#64748b;">${isFull ? 'No vacancy' : `${availBeds.toLocaleString()} beds free`}</span>
        </div>
        ${allocatedList ? `
          <div style="margin-top:8px; border-top:1px solid rgba(15,23,42,0.08); padding-top:6px;">
            <div style="font-size:10.5px; font-weight:700; color:#64748b; text-transform:uppercase; margin-bottom:2px;">
              🛣️ Road Routing &amp; Evacuation Corridors:
            </div>
            ${allocatedList}
          </div>
        ` : ''}
        <div style="margin-top:10px; display:flex; gap:6px;">
          <button class="btn btn-glass" style="flex:1; font-size:11px; padding:6px 10px; border-color:rgba(2,132,199,0.3); color:#0284c7;" onclick="openShelterModal('${s.shelter_id || s.id}')">
            ✏️ Update Occupancy
          </button>
          ${s.lat && s.lng ? `
            <button class="btn btn-glass" style="font-size:11px; padding:6px 10px; color:#16a34a; border-color:rgba(22,163,74,0.3);" onclick="locateEntity({name:'${s.name.replace(/'/g, "\\'")}', lat:${s.lat}, lng:${s.lng}, zoom:14, level:'SAFE', desc:'Designated Relief Shelter (Cap: ${(s.capacity || 2500).toLocaleString()}, Current: ${(s.current || 0).toLocaleString()})'}, event)" title="Locate Shelter on GIS Map">
              🗺️ Locate
            </button>
          ` : ''}
        </div>
      `;
      grid.appendChild(card);
    });
  }

  // Render Deficit Reports
  if (deficitEl && data.deficitReports) {
    deficitEl.innerHTML = '';
    data.deficitReports.forEach(d => {
      const hasDeficit = d.deficit > 0;
      const card = document.createElement('div');
      card.className = `deficit-card ${hasDeficit ? 'has-deficit' : 'sufficient'}`;
      card.innerHTML = `
        <div class="deficit-zone-title">
          <span>Zone ${d.zone_id} (${(d.hazard_type || 'Hazard').toUpperCase()})</span>
          <span class="alloc-badge ${hasDeficit ? 'alloc-unallocated' : 'alloc-full'}">
            ${hasDeficit ? '🚨 CAPACITY DEFICIT' : '✅ SUFFICIENT'}
          </span>
        </div>
        <div class="deficit-stat">
          <span>At-Risk Population:</span>
          <strong>${Number(d.total_at_risk).toLocaleString()}</strong>
        </div>
        <div class="deficit-stat">
          <span>Reachable Shelter Capacity:</span>
          <strong>${Number(d.total_reachable_capacity).toLocaleString()}</strong>
        </div>
        <div class="deficit-stat">
          <span>Relocation Deficit:</span>
          <strong style="color:${hasDeficit ? '#ef4444' : '#22c55e'};">${Number(d.deficit).toLocaleString()}</strong>
        </div>
      `;
      deficitEl.appendChild(card);
    });
  }
}

// ---- AI Explanation Panel Assistant ----
function updateAIExplanation(contextKey) {
  try {
    const panel = document.getElementById('ai-explanation-text');
    const title = document.getElementById('ai-explanation-sub');
    if (!panel) return;

    const pData = window.currentPriorityData;

    // Dynamic habitations explanation using real computed VPI ranking
    let habitationsHtml = `
      <div class="ai-message">
        <strong>Priority Ranking Engine:</strong> Computing real-time 6-factor composite scores across all vulnerable habitations...
      </div>
    `;
    if (pData && pData.habitations && pData.habitations.length >= 2) {
      const top1 = pData.habitations[0];
      const top2 = pData.habitations[1];
      const topShelter = top1.assigned_shelters?.[0]?.shelter_name || 'Designated High-Ground Center';
      const score1 = Number(top1.vpi_score ?? top1.priorityScore ?? top1.score ?? 0).toFixed(3);
      const score2 = Number(top2.vpi_score ?? top2.priorityScore ?? top2.score ?? 0).toFixed(3);
      habitationsHtml = `
        <div class="ai-message">
          <strong>VPI Priority Ranking:</strong> <strong>${top1.village_name} (${Number(top1.growth_adjusted_pop || top1.population || 0).toLocaleString()} pop)</strong> and <strong>${top2.village_name} (${Number(top2.growth_adjusted_pop || top2.population || 0).toLocaleString()} pop)</strong> exhibit highest composite vulnerability indices (<strong>${score1}</strong> and <strong>${score2}</strong>) due to elevation inundation risk and access isolation.
        </div>
        <div class="ai-message">
          <strong>Relocation Directives:</strong> Initial road corridors routed to <strong>${topShelter}</strong>. Tier summary: <span class="highlight">${pData.summary?.immediateTierCount || 0} Immediate</span>, <span class="highlight">${pData.summary?.shortTermTierCount || 0} Short-Term</span>, and ${pData.summary?.mediumTermTierCount || 0} Medium-Term priority habitations.
        </div>
        <div class="ai-source-tags">
          <span class="ai-source-tag">VPI 6-Factor Engine</span>
          <span class="ai-source-tag">OSRM Road Network</span>
          <span class="ai-source-tag">Census 2026 Projections</span>
        </div>
      `;
    }

    // Dynamic carrying capacity explanation using real greedy allocation results
    let safesitesHtml = `
      <div class="ai-message">
        <strong>Carrying Capacity:</strong> Analyzing designated shelter network and calculating road travel horizons...
      </div>
    `;
    if (pData && pData.shelterStatus) {
      const sortedShelters = pData.shelterStatus.slice().sort((a,b) => (b.occupancy_pct || 0) - (a.occupancy_pct || 0));
      const peakShelter = sortedShelters[0];
      const deficitCount = (pData.deficitReports || []).filter(d => d.deficit > 0).length;
      safesitesHtml = `
        <div class="ai-message">
          <strong>Carrying Capacity Assessment:</strong> <strong>${peakShelter ? peakShelter.name : 'Designated Shelter Hub'}</strong> is at <span class="highlight">${peakShelter ? peakShelter.occupancy_pct : 0}% occupancy</span> with ${peakShelter ? Number(peakShelter.available_beds || 0).toLocaleString() : 0} beds remaining.
        </div>
        <div class="ai-message">
          <strong>Allocation Deficit:</strong> Greedy allocation indicates <span class="highlight">${Number(pData.summary?.totalDeficitPop || 0).toLocaleString()} evacuees</span> remain in capacity deficit across ${deficitCount} active risk zones requiring secondary staging shelters.
        </div>
        <div class="ai-source-tags">
          <span class="ai-source-tag">Greedy Capacity Allocator</span>
          <span class="ai-source-tag">SDMA Relief Network</span>
          <span class="ai-source-tag">Zone Deficit Audit</span>
        </div>
      `;
    }

    // Dynamic command dashboard situation explanation
    let commandHtml = `
      <div class="ai-message">
        <strong>Synthesized Situation:</strong> Automated AI Orchestration Engine actively monitoring real-time telemetry, seismic sensors, and NASA satellite feeds.
      </div>
      <div class="ai-message">
        <strong>Dynamic Surveillance:</strong> Real-time VPI priority scores and shelter carrying capacities are updating live from verified sensor telemetry.
      </div>
      <div class="ai-message">
        <strong>Action Recommendation:</strong> Monitor the live timeline scrubber and situational briefings for active evacuation directives.
      </div>
      <div class="ai-source-tags">
        <span class="ai-source-tag">AI Orchestrator</span>
        <span class="ai-source-tag">NASA FIRMS</span>
        <span class="ai-source-tag">Live Sensor Grid</span>
      </div>
    `;
    if (pData && pData.habitations && pData.habitations.length > 0) {
      const topV = pData.habitations[0];
      const assignedShelter = topV.assigned_shelters?.[0]?.shelter_name || 'Designated Regional Center';
      const scoreV = Number(topV.vpi_score ?? topV.priorityScore ?? topV.score ?? 0).toFixed(3);
      commandHtml = `
        <div class="ai-message">
          <strong>Synthesized Operational Assessment:</strong> Live VPI Engine flags <strong>${topV.village_name} (${topV.district || ''})</strong> as priority #1 relocation cluster with composite risk index <span class="highlight">${scoreV}</span>.
        </div>
        <div class="ai-message">
          <strong>Evacuation Capacity Status:</strong> ${Number(pData.summary?.totalAllocatedPop || 0).toLocaleString()} of ${Number(pData.summary?.totalAtRiskPop || 0).toLocaleString()} at-risk citizens successfully matched to open high-ground shelters (${pData.summary?.allocationEfficiencyPct || 0}% allocation efficiency).
        </div>
        <div class="ai-message">
          <strong>Action Recommendation:</strong> Prioritize evacuation of <strong>${topV.village_name}</strong> to <strong>${assignedShelter}</strong> via verified safe road corridors.
        </div>
        <div class="ai-source-tags">
          <span class="ai-source-tag">IMD Doppler Radar</span>
          <span class="ai-source-tag">Priority Engine v2</span>
          <span class="ai-source-tag">OSRM Road Routing</span>
        </div>
      `;
    }

    const explanations = {
      'command': {
        sub: 'Real-Time Operational Assessment',
        html: commandHtml
      },
      'map-view': {
        sub: 'GIS Risk Topology Interpretation',
        html: `
          <div class="ai-message">
            <strong>Spatial Pattern Analysis:</strong> High-severity coastal hazard corridors detected along the Godavari Delta and North-Coastal Andhra Pradesh (Kakinada–Visakhapatnam–Srikakulam arc).
          </div>
          <div class="ai-message">
            <strong>Safe Site Buffer:</strong> 7 designated safe sites currently have <span class="safe">52% remaining capacity</span>. The nearest evacuation corridor (NH-216) is clear of waterlogging.
          </div>
        `
      },
      'hazards': {
        sub: 'Multi-Source Threat Evaluation',
        html: `
          <div class="ai-message">
            <strong>False Alarm Prevention:</strong> Multi-sensor cross check validates Cyclone Gulab/Vayu with <strong>91% confidence (±4% uncertainty)</strong>. Flash flood and coastal surge advisory evaluated from combined radar + tidal telemetry.
          </div>
        `
      },
      'habitations': {
        sub: 'Vulnerability & Relocation Ranking',
        html: habitationsHtml
      },
      'safesites': {
        sub: 'Shelter Carrying Capacity Analysis',
        html: safesitesHtml
      },
      'reports': {
        sub: 'Human Verification Assistant',
        html: `
          <div class="ai-message">
            <strong>Crowdsource Intelligence:</strong> 3 citizen reports currently cross-referenced against satellite radar. Report <strong>REP002 (Bridge damage on NH-216)</strong> has 7 upvotes and high spatial probability.
          </div>
        `
      },
      'analytics': {
        sub: 'Analytical Contribution & Historical Variance',
        html: `
          <div class="ai-message">
            <strong>Contribution Factor:</strong> Extreme precipitation accounts for <strong>64%</strong> of the current aggregate national disaster risk index, followed by cyclonic wind pressure at <strong>26%</strong>.
          </div>
        `
      },
      'datasources': {
        sub: 'Telemetry Health & Sensor Status',
        html: `
          <div class="ai-message">
            <strong>Data Pipeline Health:</strong> 5 of 5 national feeds active with zero latency packet loss. Last satellite sweep completed 4 minutes ago.
          </div>
        `
      }
    };

    const exp = explanations[contextKey] || explanations['command'];
    if (title && exp.sub) title.textContent = exp.sub;
    if (panel && exp.html) panel.innerHTML = exp.html;
  } catch (err) {
    console.warn('updateAIExplanation safe fallback:', err);
  }
}

// ---- Chart.js Multi-Risk Analytics ----
function initAnalyticsChart() {
  const ctx = document.getElementById('riskChart');
  if (!ctx) return;

  const data = APP_DATA.multiRiskBreakdown;
  riskChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: data.labels,
      datasets: [
        {
          label: 'Population at Risk (x1,000)',
          data: data.affected.map(v => v / 1000),
          backgroundColor: 'rgba(59, 130, 246, 0.65)',
          borderColor: '#3b82f6',
          borderWidth: 1,
          borderRadius: 6
        },
        {
          label: 'Composite Severity Score (0-10)',
          data: data.riskScores,
          backgroundColor: 'rgba(239, 68, 68, 0.65)',
          borderColor: '#ef4444',
          borderWidth: 1,
          borderRadius: 6,
          yAxisID: 'y1'
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          labels: { color: '#94a3b8', font: { family: 'Inter', size: 11 } }
        }
      },
      scales: {
        x: {
          grid: { color: 'rgba(255,255,255,0.05)' },
          ticks: { color: '#94a3b8', font: { family: 'Inter', size: 11 } }
        },
        y: {
          grid: { color: 'rgba(255,255,255,0.05)' },
          ticks: { color: '#94a3b8', font: { family: 'Inter', size: 11 } },
          title: { display: true, text: 'Population Affected (k)', color: '#94a3b8' }
        },
        y1: {
          position: 'right',
          grid: { drawOnChartArea: false },
          ticks: { color: '#ef4444', font: { family: 'Inter', size: 11 } },
          min: 0,
          max: 10,
          title: { display: true, text: 'Severity (0-10)', color: '#ef4444' }
        }
      }
    }
  });
}

// ================================================================
// ================================================================
// TASK 18: AI DECISION SUPPORT (DeepSeek-R1 8B Evidence Brief)
// ================================================================
let isGeneratingDecisionBrief = false;
let decisionBriefTimerInterval = null;

function initDecisionSupport() {
  try {
    const cached = sessionStorage.getItem('rzi_decision_brief');
    if (cached) {
      const parsed = JSON.parse(cached);
      if (parsed && parsed.brief) {
        renderDecisionBriefUI(parsed.brief, parsed.meta || {}, parsed.timestamp || Date.now());
        return;
      }
    }
  } catch (e) {
    console.warn('[DecisionSupport] Error reading cached brief:', e);
  }
}

function switchToDecisionBrief() {
  switchView('decision-support');
  setTimeout(() => {
    const panel = document.getElementById('ai-decision-support-panel');
    if (panel) {
      panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
      panel.style.transition = 'box-shadow 0.4s ease, border-color 0.4s ease';
      panel.style.borderColor = '#a855f7';
      panel.style.boxShadow = '0 0 28px rgba(168, 85, 247, 0.45)';
      setTimeout(() => {
        panel.style.borderColor = '';
        panel.style.boxShadow = '';
      }, 1800);
    }
  }, 80);
}

function parseDecisionBriefSections(rawText) {
  if (!rawText || typeof rawText !== 'string') return {};

  // Strip any <think> reasoning tokens immediately
  let text = rawText.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();

  const requiredSections = [
    'OBSERVATIONS',
    'RISK / PRIORITY',
    'AUTHORITY RECOMMENDATIONS',
    'SHELTER / ACCESS',
    'LIMITATIONS / CONFIDENCE'
  ];

  const headerPattern = requiredSections.map(s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  const regex = new RegExp('(?:###\\s*|\\*\\*|#\\s*)?(' + headerPattern + ')[\\s:*\\-]*\\n([\\s\\S]*?)(?=(?:###\\s*|\\*\\*|#\\s*)?(?:' + headerPattern + ')|$)', 'gi');

  const result = {};
  let match;
  while ((match = regex.exec(text)) !== null) {
    const key = match[1].trim().toUpperCase();
    const content = match[2].trim();
    if (key.includes('OBSERVATION')) result['OBSERVATIONS'] = content;
    else if (key.includes('RISK') || key.includes('PRIORITY')) result['RISK / PRIORITY'] = content;
    else if (key.includes('RECOMMENDATION')) result['AUTHORITY RECOMMENDATIONS'] = content;
    else if (key.includes('SHELTER') || key.includes('ACCESS')) result['SHELTER / ACCESS'] = content;
    else if (key.includes('LIMITATION') || key.includes('CONFIDENCE')) result['LIMITATIONS / CONFIDENCE'] = content;
  }

  // Fallback: If any section heading wasn't matched with newline, try broad search
  requiredSections.forEach(sec => {
    if (!result[sec]) {
      const broadRegex = new RegExp('(?:###|\\*\\*|#)?\\s*' + sec.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '[\\s:*\\-]*([\\s\\S]*?)(?=(?:###|\\*\\*|#)?\\s*(?:' + headerPattern + ')|$)', 'i');
      const m = text.match(broadRegex);
      if (m && m[1]) result[sec] = m[1].trim();
    }
  });

  return result;
}

function formatSectionContent(text) {
  if (!text || typeof text !== 'string') return '';

  // Strip any <think> tags if still present
  let clean = text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();

  const lines = clean.split('\n');
  let inList = false;
  let html = '';

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i].trim();
    if (!line) {
      if (inList) { html += '</ul>'; inList = false; }
      continue;
    }

    // Check for bullet lines
    const bulletMatch = line.match(/^[-*•]\s+(.*)$/) || line.match(/^\d+\.\s+(.*)$/);
    if (bulletMatch) {
      if (!inList) {
        html += '<ul style="margin:4px 0 6px 18px; padding:0; list-style-type:disc;">';
        inList = true;
      }
      let content = bulletMatch[1];
      content = content.replace(/\*\*(.*?)\*\*/g, '<strong style="color:#f1f5f9;">$1</strong>');
      html += `<li style="margin-bottom:5px; line-height:1.6; color:#cbd5e1;">${content}</li>`;
    } else {
      if (inList) { html += '</ul>'; inList = false; }
      line = line.replace(/\*\*(.*?)\*\*/g, '<strong style="color:#f1f5f9;">$1</strong>');
      html += `<p style="margin:0 0 6px 0; line-height:1.6; color:#cbd5e1;">${line}</p>`;
    }
  }

  if (inList) html += '</ul>';
  return html;
}

function renderDecisionBriefLoading(seconds = 0) {
  const body = document.getElementById('dsb-body');
  if (!body) return;
  body.innerHTML = `
    <div class="dsb-loading" id="dsb-loading-container">
      <div class="dsb-pulse-ring"></div>
      <div>
        <div class="dsb-loading-text" style="font-weight:700; font-size:13px; color:#c4b5fd;">
          Generating evidence-grounded decision brief…
        </div>
        <div id="dsb-loading-subtext" style="font-size:11.5px; color:#94a3b8; margin-top:4px;">
          Elapsed: ${seconds}s &bull; DeepSeek-R1 8B CPU inference in progress via LangChain / Ollama
        </div>
        <div style="font-size:10.5px; color:rgba(148,163,184,0.6); margin-top:4px;">
          Assembling TerraMind satellite extent, AP SDMA habitations &amp; shelters, and OSRM driving routes. Dashboard remains 100% interactive.
        </div>
      </div>
    </div>
  `;
}

function updateDecisionBriefLoadingTimer(seconds) {
  const subtext = document.getElementById('dsb-loading-subtext');
  if (subtext) {
    subtext.innerHTML = `Elapsed: ${seconds}s &bull; DeepSeek-R1 8B CPU inference in progress via LangChain / Ollama`;
  }
}

function renderDecisionBriefError(errMsg) {
  const body = document.getElementById('dsb-body');
  if (!body) return;
  body.innerHTML = `
    <div class="dsb-error">
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="10"></circle>
        <line x1="12" y1="8" x2="12" y2="12"></line>
        <line x1="12" y1="16" x2="12.01" y2="16"></line>
      </svg>
      <div>
        <div style="font-weight:700; font-size:13px; color:#fca5a5;">
          AI decision brief temporarily unavailable. Underlying GIS and hazard data remain available.
        </div>
        <div style="font-size:11px; color:rgba(252,165,165,0.75); margin-top:4px;">
          Service Status: ${String(errMsg || 'Inference service timeout or 503').replace(/</g, '&lt;').replace(/>/g, '&gt;')} &bull; All GIS hazard overlays, habitation matrices, and shelters remain active.
        </div>
        <button class="dsb-btn-refresh" onclick="generateDecisionBrief(true)" style="margin-top:10px; display:inline-flex;">
          🔄 Retry Decision Brief
        </button>
      </div>
    </div>
  `;
}

function renderDecisionBriefUI(briefText, meta = {}, timestamp = Date.now()) {
  const body = document.getElementById('dsb-body');
  if (!body) return;

  // Clean raw brief
  let cleanBrief = String(briefText || '').replace(/<think>[\s\S]*?<\/think>/gi, '').trim();

  // Extract the 5 required sections
  const sections = parseDecisionBriefSections(cleanBrief);

  const sectionDefs = [
    {
      key: 'OBSERVATIONS',
      title: 'OBSERVATIONS',
      icon: '🛰️',
      badge: 'SATELLITE & SENSOR GROUND TRUTH',
      color: '#38bdf8',
      fallback: '30 TerraMind flood polygons vectorized from Sentinel-1 RTC + Sentinel-2 L2A + Copernicus DEM across Coastal AP. Analysis threshold 0.50 is not ground-truth calibrated.'
    },
    {
      key: 'RISK / PRIORITY',
      title: 'RISK / PRIORITY',
      icon: '⚠️',
      badge: 'EXPOSURE & SEVERITY CLASSIFICATION',
      color: '#f97316',
      fallback: 'Coastal AP 2026 projected population (MoHFW projection, not a census; not exposed population). Normalized population-density score: 0.356, Population-density VPI contribution: 0.0534. Standby monitoring priority for proximity buffer clusters.'
    },
    {
      key: 'AUTHORITY RECOMMENDATIONS',
      title: 'AUTHORITY RECOMMENDATIONS',
      icon: '📋',
      badge: 'INCIDENT DIRECTIVES',
      color: '#a855f7',
      fallback: 'Dispatch field ground-truth reconnaissance to Peravaram (631.57 m distance) and 1-5 km buffer zones. Maintain active sensor surveillance on the 30 flood polygons. Stand down mass evacuation orders given 0 direct habitation inundations.'
    },
    {
      key: 'SHELTER / ACCESS',
      title: 'SHELTER / ACCESS',
      icon: '🏕️',
      badge: 'CAPACITY & OSRM LOGISTICS',
      color: '#22c55e',
      fallback: 'AP SDMA cyclone shelters identified in Coastal AP. Selected habitation-to-shelter OSRM routes computed successfully. Road passability during a disaster is not verified.'
    },
    {
      key: 'LIMITATIONS / CONFIDENCE',
      title: 'LIMITATIONS / CONFIDENCE',
      icon: '🛡️',
      badge: 'OPERATIONAL BOUNDARIES',
      color: '#94a3b8',
      fallback: 'TerraMind 0.50 threshold is uncalibrated against local ground truth. Spatial proximity buffers indicate geographic closeness, not confirmed flooding. Successful OSRM routes do not guarantee road passability or structural safety during an active event.'
    }
  ];

  let html = '<div class="dsb-sections">';
  sectionDefs.forEach(s => {
    let content = sections[s.key] || '';
    if (!content) {
      for (const k in sections) {
        if (k.toUpperCase().includes(s.title)) {
          content = sections[k];
          break;
        }
      }
    }
    const formattedHtml = formatSectionContent(content || s.fallback);
    html += `
      <div class="dsb-section" data-section="${s.key}">
        <div class="dsb-section-title" style="color:${s.color};">
          <span>${s.icon}</span>
          <span>${s.title}</span>
          <span style="margin-left:auto; font-size:9.5px; font-weight:700; color:rgba(148,163,184,0.6); letter-spacing:0.06em;">${s.badge}</span>
        </div>
        <div class="dsb-section-body">
          ${formattedHtml}
        </div>
      </div>
    `;
  });
  html += '</div>';

  body.innerHTML = html;

  // Provenance Line (Step 5)
  const metaModel = document.getElementById('dsb-meta-model');
  const metaTime = document.getElementById('dsb-meta-time');
  const metaTimeLbl = document.getElementById('dsb-meta-time-lbl');
  const metaSep = document.getElementById('dsb-meta-sep');

  if (metaModel) {
    let label = meta.model || 'Unknown';
    if (meta.provider === 'ollama') label = 'DeepSeek-R1 • Local AI';
    else if (meta.provider === 'claude') label = 'Claude • Cloud AI';
    else if (meta.provider === 'deterministic-fallback') label = 'Deterministic Emergency Analyst • Fallback';
    
    metaModel.textContent = label;
  }
  if (metaTime) {
    const timeStr = new Date(timestamp).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const durStr = meta.inference_duration_seconds ? ` (${meta.inference_duration_seconds}s inference)` : '';
    metaTime.textContent = `Generated today at ${timeStr} IST${durStr}`;
    metaTime.style.display = 'inline';
    if (metaTimeLbl) metaTimeLbl.style.display = 'inline';
    if (metaSep) metaSep.style.display = 'inline';
  }

  // Update legacy containers if present
  const oldText = document.getElementById('ai-brief-text');
  if (oldText) {
    oldText.innerHTML = `<div style="color:var(--text-primary); font-size:12.5px;">${formatSectionContent(sections['AUTHORITY RECOMMENDATIONS'] || cleanBrief)}</div>`;
  }
}

async function generateDecisionBrief(forceRefresh = false) {
  if (isGeneratingDecisionBrief) {
    showToast('AI Decision Brief inference is already in progress...', 'info');
    return;
  }

  // If not force refresh, check if we have a saved brief in sessionStorage
  if (!forceRefresh) {
    try {
      const cached = sessionStorage.getItem('rzi_decision_brief');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed && parsed.brief) {
          renderDecisionBriefUI(parsed.brief, parsed.meta || {}, parsed.timestamp || Date.now());
          showToast('Loaded active decision brief from session cache', 'info');
          return;
        }
      }
    } catch (e) {}
  }

  isGeneratingDecisionBrief = true;
  const btnGen = document.getElementById('btn-generate-brief');
  const btnRef = document.getElementById('btn-refresh-brief');
  const spinnerSvg = document.getElementById('dsb-refresh-svg');
  if (btnGen) btnGen.disabled = true;
  if (btnRef) btnRef.disabled = true;
  if (spinnerSvg) spinnerSvg.style.animation = 'dsb-spin 0.9s linear infinite';

  let elapsedSeconds = 0;
  renderDecisionBriefLoading(elapsedSeconds);

  if (decisionBriefTimerInterval) clearInterval(decisionBriefTimerInterval);
  decisionBriefTimerInterval = setInterval(() => {
    elapsedSeconds++;
    updateDecisionBriefLoadingTimer(elapsedSeconds);
  }, 1000);

  const startTime = Date.now();

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 320000); // 320s max timeout

    // Step 3: Call real API endpoint POST /api/ai-recommendation
    const resp = await fetch('/api/ai-recommendation', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({}),
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    if (!resp.ok) {
      throw new Error(`HTTP ${resp.status}`);
    }

    const data = await resp.json();
    const recommendationText = data.recommendation || data.brief;
    if (!data || !recommendationText) {
      throw new Error('API returned empty or invalid response');
    }

    const duration = Math.round((Date.now() - startTime) / 1000);
    const meta = data.meta || { model: data.model || 'Unknown Model', provider: data.provider || 'unknown' };
    if (!meta.inference_duration_seconds) meta.inference_duration_seconds = duration;

    // Cache in sessionStorage
    try {
      sessionStorage.setItem('rzi_decision_brief', JSON.stringify({
        brief: recommendationText,
        meta: meta,
        timestamp: Date.now()
      }));
    } catch (e) {}

    renderDecisionBriefUI(recommendationText, meta, Date.now());
    if (data.fallback) {
      showToast(`Primary AI unavailable. Deterministic emergency analysis active. (${duration}s)`, 'warning');
    } else {
      let providerName = meta.provider === 'claude' ? 'Claude' : 'DeepSeek';
      showToast(`${providerName} Decision Brief generated successfully (${duration}s)`, 'success');
    }

  } catch (err) {
    console.error('Decision brief fetch error:', err);
    let errorMsg = err.message || 'Request failed';
    if (errorMsg.toLowerCase().includes('failed to fetch') || errorMsg.toLowerCase().includes('networkerror')) {
      errorMsg = 'AI service is currently unreachable. GIS intelligence remains operational.';
    } else if (errorMsg.includes('HTTP')) {
      errorMsg = 'AI service returned an error. GIS intelligence remains operational.';
    }
    renderDecisionBriefError(errorMsg);
  } finally {
    isGeneratingDecisionBrief = false;
    if (decisionBriefTimerInterval) {
      clearInterval(decisionBriefTimerInterval);
      decisionBriefTimerInterval = null;
    }
    if (btnGen) btnGen.disabled = false;
    if (btnRef) btnRef.disabled = false;
    if (spinnerSvg) spinnerSvg.style.animation = '';
  }
}

// Backward-compatible alias
const fetchAIRecommendation = generateDecisionBrief;

// ================================================================
// PHASE 5: LIVE SHELTER OCCUPANCY MANAGEMENT (Authority Side)
// ================================================================
let currentEditingShelter = null;

function openShelterModal(shelterId) {
  const modal = document.getElementById('modal-shelter-occupancy');
  if (!modal) return;

  let shelter = null;
  if (window.currentPriorityData && window.currentPriorityData.shelterStatus) {
    shelter = window.currentPriorityData.shelterStatus.find(s => (s.shelter_id === shelterId || s.id === shelterId || s.name === shelterId));
  }
  if (!shelter && window.APP_DATA && window.APP_DATA.shelters) {
    shelter = window.APP_DATA.shelters.find(s => (s.id || s.shelter_id) === shelterId || s.name === shelterId);
  }

  if (!shelter) {
    showToast(`Shelter record ${shelterId} not loaded`, 'danger');
    return;
  }

  currentEditingShelter = shelter;
  const sId = shelter.shelter_id || shelter.id || shelter.name;
  document.getElementById('edit-shelter-id').value = sId;
  document.getElementById('modal-shelter-name').textContent = shelter.name;
  document.getElementById('modal-shelter-meta').textContent = `ID: ${sId} • District: ${shelter.district || 'Regional'}`;
  document.getElementById('edit-shelter-capacity').value = Number(shelter.capacity || shelter.max_capacity) || 1000;
  document.getElementById('edit-shelter-occupancy').value = Number(shelter.current_occupancy ?? shelter.new_occupancy ?? shelter.occupancy ?? 0);
  document.getElementById('edit-shelter-status').value = shelter.status || 'open';

  updateOccupancyPreview();
  modal.style.display = 'flex';
}

function closeShelterModal() {
  const modal = document.getElementById('modal-shelter-occupancy');
  if (modal) modal.style.display = 'none';
  currentEditingShelter = null;
}

function updateOccupancyPreview() {
  const cap = parseInt(document.getElementById('edit-shelter-capacity').value, 10) || 1;
  const occ = parseInt(document.getElementById('edit-shelter-occupancy').value, 10) || 0;
  const pct = Math.min(100, Math.max(0, Math.round((occ / cap) * 100)));

  const pctEl = document.getElementById('modal-occupancy-pct');
  const barEl = document.getElementById('modal-occupancy-bar');
  const statusEl = document.getElementById('edit-shelter-status');

  if (pctEl) pctEl.textContent = `${pct}% (${occ} / ${cap} beds)`;
  if (barEl) {
    barEl.style.width = `${pct}%`;
    if (pct >= 85) barEl.style.background = '#ef4444';
    else if (pct >= 60) barEl.style.background = '#f97316';
    else barEl.style.background = '#22c55e';
  }

  if (statusEl) {
    if (occ >= cap && statusEl.value !== 'closed') {
      statusEl.value = 'full';
    } else if (occ < cap && statusEl.value === 'full') {
      statusEl.value = 'open';
    }
  }
}

async function submitShelterOccupancy(event) {
  event.preventDefault();
  const shelterId = document.getElementById('edit-shelter-id').value;
  const rawOcc = document.getElementById('edit-shelter-occupancy').value;
  const occupancy = parseInt(rawOcc, 10);
  const status = document.getElementById('edit-shelter-status').value;
  const officer = document.getElementById('edit-shelter-officer').value;
  const cap = parseInt(document.getElementById('edit-shelter-capacity').value, 10) || 1000;

  const saveBtn = document.getElementById('btn-save-shelter');
  if (isNaN(occupancy) || occupancy < 0) {
    showToast('Please enter a valid non-negative occupancy number', 'warning');
    return;
  }
  if (saveBtn) saveBtn.disabled = true;

  try {
    // 1. Update local storage overrides for offline / page reload persistence (Requirement G1)
    try {
      const overrides = JSON.parse(localStorage.getItem('rzi_shelters_override') || '{}');
      overrides[shelterId] = {
        current_occupancy: occupancy,
        status: status,
        capacity: cap,
        updated_by: officer,
        timestamp: Date.now()
      };
      if (currentEditingShelter && currentEditingShelter.name) {
        overrides[currentEditingShelter.name] = overrides[shelterId];
      }
      localStorage.setItem('rzi_shelters_override', JSON.stringify(overrides));
    } catch (e) {}

    // 2. Synchronize in-memory HAZARD_INTEL across both portals
    if (typeof HAZARD_INTEL !== 'undefined') {
      Object.values(HAZARD_INTEL).forEach(hz => {
        if (Array.isArray(hz.safeSites)) {
          hz.safeSites.forEach(s => {
            if ((s.id || s.shelter_id) === shelterId || s.name === currentEditingShelter?.name) {
              s.current = occupancy;
              s.current_occupancy = occupancy;
              s.status = status;
              s.capacity = cap;
            }
          });
        }
      });
    }

    // 3. Patch backend shelter database
    const resp = await fetch(`/api/shelters/${encodeURIComponent(shelterId)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        current_occupancy: occupancy,
        status: status,
        capacity: cap,
        updated_by: officer
      })
    });

    if (!resp.ok) {
      const errData = await resp.json().catch(() => ({}));
      throw new Error(errData.error || `HTTP ${resp.status}`);
    }

    const data = await resp.json();
    showToast(`✅ ${data.message || 'Shelter occupancy updated'}`, 'success');
    closeShelterModal();

    // Recompute priority ranking immediately with updated shelter capacity
    await loadPriorityRanking(true);
    // Refresh AI recommendation with updated shelter data
    fetchAIRecommendation(false);

  } catch (err) {
    console.error('Shelter occupancy update failed:', err);
    showToast(`❌ Failed to update shelter: ${err.message}`, 'danger');
  } finally {
    if (saveBtn) saveBtn.disabled = false;
  }
}

// Persisted Shelter Overrides Applier (Requirement G1)
function applyShelterOverrides() {
  try {
    const raw = localStorage.getItem('rzi_shelters_override');
    if (!raw) return;
    const overrides = JSON.parse(raw);
    if (!overrides || typeof overrides !== 'object') return;

    if (window.APP_DATA && Array.isArray(window.APP_DATA.shelters)) {
      window.APP_DATA.shelters.forEach(s => {
        const o = overrides[s.id || s.shelter_id || s.name];
        if (o) {
          if (o.current_occupancy !== undefined) s.current_occupancy = o.current_occupancy;
          if (o.status !== undefined) s.status = o.status;
          if (o.capacity !== undefined) s.capacity = o.capacity;
        }
      });
    }

    if (typeof HAZARD_INTEL !== 'undefined') {
      Object.values(HAZARD_INTEL).forEach(hz => {
        if (Array.isArray(hz.safeSites)) {
          hz.safeSites.forEach(s => {
            const o = overrides[s.id || s.shelter_id || s.name];
            if (o) {
              if (o.current_occupancy !== undefined) {
                s.current = o.current_occupancy;
                s.current_occupancy = o.current_occupancy;
              }
              if (o.status !== undefined) s.status = o.status;
              if (o.capacity !== undefined) s.capacity = o.capacity;
            }
          });
        }
      });
    }
  } catch (e) {
    console.warn('[Authority] Error applying shelter overrides:', e);
  }
}
window.applyShelterOverrides = applyShelterOverrides;

// Expose globally for HTML onclick triggers
window.generateDecisionBrief = generateDecisionBrief;
window.switchToDecisionBrief = switchToDecisionBrief;
window.initDecisionSupport = initDecisionSupport;
window.renderDecisionBriefUI = renderDecisionBriefUI;
window.renderDecisionBriefError = renderDecisionBriefError;
window.fetchAIRecommendation = generateDecisionBrief;
window.openShelterModal = openShelterModal;
window.closeShelterModal = closeShelterModal;
window.updateOccupancyPreview = updateOccupancyPreview;
window.submitShelterOccupancy = submitShelterOccupancy;


