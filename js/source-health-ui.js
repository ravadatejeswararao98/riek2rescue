/**
 * RISK2RESCUE — SENSOR DATA SOURCES PANEL (js/source-health-ui.js)
 * Real-time honest health telemetry UI directly hydrated from /api/sources/health
 * 
 * Strict Truth Semantics:
 * - Green LIVE only for verified LIVE_API feeds succeeding now.
 * - Amber DEGRADED or STALE with exact age stamp.
 * - Red UNAVAILABLE with full error trace.
 * - Grey NOT_CONFIGURED showing the required .env variable.
 * - Blue BASELINE for official static references.
 * - Red banner when 0 live feeds are reachable.
 */

(function(window) {
  'use strict';

  let autoRefreshTimer = null;
  let lastProbedTimestamp = null;
  let timerTicker = null;

  const CATEGORY_TITLES = {
    'seismic': '🚨 Seismic & Earthquake Sensors',
    'weather': '🌪️ Meteorological & Doppler Weather Feeds',
    'hydrology': '🌊 River Basin Hydrological Gauges & Inundation',
    'air': '🌫️ Atmospheric Quality & Ground Stations',
    'alerts': '🔔 Official Common Alerting Protocol (CAP) Broadcasts',
    'satellite': '🛰️ Earth Observation Satellites & Thermal Feeds',
    'routing': '🛣️ Road Infrastructure & Safe Corridors',
    'reference': '🏛️ Official Enumerated Civil Infrastructure & Baselines',
    'ai': '🧠 Neural Inference & Decision Support Models'
  };

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function formatCadence(ms) {
    if (!ms) return 'Dynamic';
    if (ms >= 86400000) return `${Math.round(ms / 86400000)}d (Baseline)`;
    if (ms >= 3600000) return `${Math.round(ms / 3600000)}h`;
    if (ms >= 60000) return `${Math.round(ms / 60000)} min`;
    return `${Math.round(ms / 1000)}s`;
  }

  function formatAge(sec) {
    if (sec === null || sec === undefined) return 'Never fetched';
    if (sec < 60) return `${sec}s ago`;
    const min = Math.floor(sec / 60);
    if (min < 60) return `${min}m ago`;
    const hrs = Math.floor(min / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  }

  async function fetchHealth(forceRefresh = false) {
    const url = `/api/sources/health${forceRefresh ? '?refresh=1' : ''}`;
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    return await resp.json();
  }

  function renderStatusPill(status, requiresKey) {
    switch (status) {
      case 'LIVE':
        return '<span class="source-status-pill status-pill-live">● LIVE</span>';
      case 'DEGRADED':
        return '<span class="source-status-pill status-pill-degraded">▲ DEGRADED</span>';
      case 'STALE':
        return '<span class="source-status-pill status-pill-stale">⏳ STALE</span>';
      case 'UNAVAILABLE':
        return '<span class="source-status-pill status-pill-unavailable">✕ UNAVAILABLE</span>';
      case 'NOT_CONFIGURED':
        return `<span class="source-status-pill status-pill-notconfigured" title="Add ${escapeHtml(requiresKey || '')} to .env">◌ NOT CONFIGURED</span>`;
      case 'BASELINE':
        return '<span class="source-status-pill status-pill-baseline">ℹ BASELINE</span>';
      default:
        return `<span class="source-status-pill">${escapeHtml(status)}</span>`;
    }
  }

  function renderTierChip(tier) {
    switch (tier) {
      case 'LIVE_API':
        return '<span class="source-tier-chip tier-live-api">LIVE API</span>';
      case 'OFFICIAL_BASELINE':
        return '<span class="source-tier-chip tier-baseline">OFFICIAL BASELINE</span>';
      case 'DERIVED':
        return '<span class="source-tier-chip tier-derived">DERIVED</span>';
      case 'SIMULATED':
        return '<span class="source-tier-chip tier-simulated">SIMULATED — DRILL</span>';
      default:
        return `<span class="source-tier-chip">${escapeHtml(tier)}</span>`;
    }
  }

  function updateTicker() {
    const ageEl = document.getElementById('datasources-probed-age');
    if (!ageEl || !lastProbedTimestamp) return;
    const elapsedSec = Math.max(0, Math.floor((Date.now() - lastProbedTimestamp) / 1000));
    ageEl.textContent = `Last probed ${elapsedSec}s ago`;
  }

  async function refreshSourcesPanel(forceRefresh = false) {
    const container = document.getElementById('datasources-root-container');
    if (!container) return;

    const reprobeBtn = document.getElementById('datasources-reprobe-btn');
    if (reprobeBtn) {
      reprobeBtn.disabled = true;
      reprobeBtn.innerHTML = '<span>⏳ Probing Feeds…</span>';
    }

    try {
      const data = await fetchHealth(forceRefresh);
      lastProbedTimestamp = Date.now();
      const s = data.summary || {};
      const sources = data.sources || [];

      // Update badge in header if exists
      const badge = document.getElementById('datasources-header-badge');
      if (badge) {
        if (s.live === s.total) {
          badge.className = 'risk-badge risk-green';
          badge.textContent = `${s.live}/${s.total} Systems Operational`;
        } else if (s.live > 0) {
          badge.className = 'risk-badge risk-orange';
          badge.textContent = `${s.live} of ${s.total} Feeds Live`;
        } else {
          badge.className = 'risk-badge risk-red';
          badge.textContent = 'Zero Live Feeds Reachable';
        }
      }

      // Group sources by category
      const categories = {};
      sources.forEach(src => {
        const cat = src.category || 'other';
        if (!categories[cat]) categories[cat] = [];
        categories[cat].push(src);
      });

      // Render full container HTML
      let html = '';

      // 1. Red banner if zero live feeds
      if (s.live === 0) {
        html += `
          <div class="datasources-no-telemetry-banner">
            ⚠️ <strong>NO LIVE TELEMETRY REACHABLE</strong> — Operating strictly on reference baselines. Do not use for tactical field rescue dispatch decisions.
          </div>
        `;
      }

      // 2. Truth Header Strip
      html += `
        <div class="datasources-truth-strip">
          <div class="truth-strip-stats">
            <span class="stat-pill stat-live"><strong>${s.live}</strong> Live</span>
            ${s.degraded > 0 ? `<span class="stat-pill stat-degraded"><strong>${s.degraded}</strong> Degraded</span>` : ''}
            ${s.stale > 0 ? `<span class="stat-pill stat-stale"><strong>${s.stale}</strong> Stale</span>` : ''}
            ${s.unavailable > 0 ? `<span class="stat-pill stat-unavailable"><strong>${s.unavailable}</strong> Unavailable</span>` : ''}
            ${s.notConfigured > 0 ? `<span class="stat-pill stat-notconfigured"><strong>${s.notConfigured}</strong> Unconfigured</span>` : ''}
            <span class="stat-pill stat-baseline"><strong>${s.baseline}</strong> Baseline</span>
          </div>
          <div class="truth-strip-actions">
            <span class="probed-age-text" id="datasources-probed-age">Last probed 0s ago</span>
            <button class="btn btn-glass reprobe-action-btn" id="datasources-reprobe-btn" onclick="window.SourceHealthUI.reprobe()">
              🔄 Re-probe
            </button>
          </div>
        </div>
      `;

      // 3. Category tables
      Object.keys(CATEGORY_TITLES).forEach(catKey => {
        const catSources = categories[catKey];
        if (!catSources || catSources.length === 0) return;

        html += `
          <div class="datasource-category-block">
            <div class="datasource-cat-header">${CATEGORY_TITLES[catKey]}</div>
            <table class="datasource-table">
              <thead>
                <tr>
                  <th style="width:28%;">Source Agency & Host</th>
                  <th style="width:22%;">Data Type & Tier</th>
                  <th style="width:12%;">Cadence</th>
                  <th style="width:12%;">Latency</th>
                  <th style="width:14%;">Last Success / Age</th>
                  <th style="width:12%;">Status</th>
                </tr>
              </thead>
              <tbody>
        `;

        catSources.forEach(src => {
          const isError = src.status === 'UNAVAILABLE' || src.status === 'DEGRADED';
          const rowId = `datasource-row-${src.id}`;
          const errDetailId = `err-detail-${src.id}`;

          html += `
            <tr id="${rowId}" class="datasource-row ${isError ? 'row-has-error' : ''}">
              <td>
                <div class="src-agency-title">${escapeHtml(src.agency)}</div>
                <div class="src-host-sub"><small>${escapeHtml(src.host)}</small></div>
                ${src.role && src.role !== 'PRIMARY' ? `<span class="source-role-tag role-${src.role.toLowerCase()}">${escapeHtml(src.role)}</span>` : ''}
              </td>
              <td>
                <div class="src-datatype">${escapeHtml(src.displayName)}</div>
                <div style="margin-top:4px;">${renderTierChip(src.tier)}</div>
              </td>
              <td><span class="src-cadence">${formatCadence(src.cadenceMs)}</span></td>
              <td><span class="src-latency">${src.latencyMs ? `${src.latencyMs} ms` : '—'}</span></td>
              <td>
                <div class="src-age-stamp">${formatAge(src.ageSeconds)}</div>
                ${src.recordCount > 0 ? `<div class="src-record-count"><small>${src.recordCount} records</small></div>` : ''}
              </td>
              <td>
                ${renderStatusPill(src.status, src.requiresKey)}
                ${isError && src.error ? `
                  <button class="error-toggle-btn" onclick="document.getElementById('${errDetailId}').classList.toggle('expanded')" title="View error trace">
                    Inspect ⚠️
                  </button>
                ` : ''}
              </td>
            </tr>
          `;

          // Expandable error / detail drawer
          if (src.error || src.detail) {
            html += `
              <tr id="${errDetailId}" class="datasource-error-row">
                <td colspan="6">
                  <div class="datasource-error-box ${src.error ? 'box-error' : 'box-detail'}">
                    ${src.detail ? `<div class="box-detail-line"><strong>Telemetry Detail:</strong> ${escapeHtml(src.detail)}</div>` : ''}
                    ${src.error ? `<div class="box-error-line"><strong>Upstream Diagnostic:</strong> <code>${escapeHtml(src.error)}</code> (Host: ${escapeHtml(src.host)})</div>` : ''}
                  </div>
                </td>
              </tr>
            `;
          }
        });

        html += `
              </tbody>
            </table>
          </div>
        `;
      });

      container.innerHTML = html;

    } catch (err) {
      container.innerHTML = `
        <div class="datasources-no-telemetry-banner">
          ⚠️ <strong>Health Engine Unreachable:</strong> ${escapeHtml(err.message)}
        </div>
      `;
    } finally {
      if (reprobeBtn) {
        reprobeBtn.disabled = false;
        reprobeBtn.innerHTML = '🔄 Re-probe';
      }
    }
  }

  function init() {
    refreshSourcesPanel(false);

    if (timerTicker) clearInterval(timerTicker);
    timerTicker = setInterval(updateTicker, 1000);

    // Auto-refresh every 60s while visible
    if (autoRefreshTimer) clearInterval(autoRefreshTimer);
    autoRefreshTimer = setInterval(() => {
      const section = document.getElementById('view-datasources');
      if (section && section.style.display !== 'none') {
        refreshSourcesPanel(false);
      }
    }, 60000);
  }

  window.SourceHealthUI = {
    init,
    refresh: () => refreshSourcesPanel(false),
    reprobe: () => refreshSourcesPanel(true)
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(typeof window !== 'undefined' ? window : global);
