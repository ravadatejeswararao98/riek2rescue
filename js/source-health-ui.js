/**
 * RISK2RESCUE — DATA SOURCES MONITOR (js/source-health-ui.js)
 * Live-updating panel hydrated from Firestore onSnapshot() + /api/sources/health REST fallback.
 *
 * Features:
 * - 9 collapsible category sections, severity-sorted rows
 * - Clickable filter badges (Live / Unavailable / Unconfigured / Baseline / Archived)
 * - Global Re-probe + per-row ↻ retry button
 * - Inline Inspect drawer for UNAVAILABLE / NOT_CONFIGURED sources
 * - Strict truth semantics: LIVE only for verified LIVE_API successes
 */

(function (window) {
  'use strict';

  /* ── State ─────────────────────────────────────────────────── */
  let lastProbedTimestamp = null;
  let timerTicker        = null;
  let currentFilter      = 'ALL';
  let latestSources      = [];
  let isReprobing        = false;

  /* ── Category Definitions (matches source-registry.js) ──────── */
  const CATEGORIES = [
    { key: 'seismic',   label: '🌍 Seismic & Earthquake Sensors' },
    { key: 'weather',   label: '🌪️ Meteorological & Doppler Weather Feeds' },
    { key: 'hydrology', label: '🌊 River Basin Hydrological Gauges & Inundation' },
    { key: 'air',       label: '🌫️ Atmospheric Quality & Ground Stations' },
    { key: 'alerts',    label: '🔔 Official CAP Broadcasts' },
    { key: 'satellite', label: '🛰️ Earth Observation Satellites & Thermal Feeds' },
    { key: 'routing',   label: '🛣️ Road Infrastructure & Safe Corridors' },
    { key: 'reference', label: '🏛️ Official Enumerated Civil Infrastructure & Baselines' },
    { key: 'ai',        label: '🧠 Neural Inference & Decision Support Models' },
  ];

  /* Severity sort order (lower index = shown first) */
  const SEVERITY = {
    UNAVAILABLE:    0,
    NOT_CONFIGURED: 1,
    DEGRADED:       2,
    STALE:          3,
    LIVE:           4,
    DERIVED:        5,
    BASELINE:       6,
    REFERENCE:      7,
    ARCHIVED:       8,
    HISTORICAL:     9,
    SIMULATED:      10,
    DRILL:          10,
  };

  /* ── Helpers ─────────────────────────────────────────────────── */
  function esc(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  }

  function formatCadence(ms) {
    if (!ms) return 'Dynamic';
    if (ms >= 86400000) return `${Math.round(ms / 86400000)}d (Static)`;
    if (ms >= 3600000)  return `${Math.round(ms / 3600000)}h`;
    if (ms >= 60000)    return `${Math.round(ms / 60000)} min`;
    return `${Math.round(ms / 1000)}s`;
  }

  function formatAge(sec) {
    if (sec === null || sec === undefined) return 'Never fetched';
    if (sec < 60)   return `${sec}s ago`;
    const min = Math.floor(sec / 60);
    if (min < 60)   return `${min}m ago`;
    const hrs = Math.floor(min / 60);
    if (hrs < 24)   return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  }

  function sortBySeverity(sources) {
    return [...sources].sort((a, b) =>
      (SEVERITY[a.status] ?? 99) - (SEVERITY[b.status] ?? 99)
    );
  }

  /* ── Status Pill ─────────────────────────────────────────────── */
  function statusPill(status, requiresKey) {
    const map = {
      LIVE:           ['status-pill-live',         '● LIVE'],
      DEGRADED:       ['status-pill-degraded',      '▲ DEGRADED'],
      STALE:          ['status-pill-stale',         '⏳ STALE'],
      UNAVAILABLE:    ['status-pill-unavailable',   '✕ UNAVAILABLE'],
      NOT_CONFIGURED: ['status-pill-notconfigured', '◌ NOT CONFIGURED'],
      BASELINE:       ['status-pill-baseline',      'ℹ BASELINE'],
      REFERENCE:      ['status-pill-reference',     '📁 REFERENCE'],
      ARCHIVED:       ['status-pill-archived',      '📜 ARCHIVED'],
      HISTORICAL:     ['status-pill-historical',    '📜 HISTORICAL'],
      DERIVED:        ['status-pill-derived',       '⚙ DERIVED'],
      SIMULATED:      ['status-pill-drill',         '⚡ DRILL'],
      DRILL:          ['status-pill-drill',         '⚡ DRILL'],
    };
    const [cls, label] = map[status] || ['', esc(status)];
    const title = status === 'NOT_CONFIGURED' ? ` title="Add ${esc(requiresKey || '')} to .env"` : '';
    return `<span class="source-status-pill ${cls}"${title}>${label}</span>`;
  }

  /* ── Tier + Role Chips ───────────────────────────────────────── */
  function tierChip(tier, role) {
    const tierMap = {
      LIVE_API:          ['tier-live-api',  'LIVE API'],
      OFFICIAL_BASELINE: ['tier-baseline',  'BASELINE'],
      BASELINE:          ['tier-baseline',  'BASELINE'],
      REFERENCE:         ['tier-reference', 'REFERENCE'],
      ARCHIVED:          ['tier-archived',  'ARCHIVED'],
      HISTORICAL:        ['tier-historical','HISTORICAL'],
      DERIVED:           ['tier-derived',   'DERIVED'],
      SIMULATED:         ['tier-drill',     'SIMULATED'],
      DRILL:             ['tier-drill',     'DRILL'],
    };
    const [cls, label] = tierMap[tier] || ['', esc(tier)];
    let html = `<span class="source-tier-chip ${cls}">${label}</span>`;
    if (role && role !== 'PRIMARY') {
      const rcMap = { CROSS_CHECK: 'role-cross_check', FORECAST: 'role-forecast', REFERENCE: 'role-reference', DRILL: 'role-drill' };
      html += ` <span class="source-role-tag ${rcMap[role] || 'role-primary'}">${esc(role)}</span>`;
    }
    return html;
  }

  /* ── Ticker ──────────────────────────────────────────────────── */
  function updateTicker() {
    const el = document.getElementById('dsm-probed-age');
    if (!el || !lastProbedTimestamp) return;
    const sec = Math.max(0, Math.floor((Date.now() - lastProbedTimestamp) / 1000));
    el.textContent = `Last probed ${formatAge(sec)}`;
  }

  /* ── Register globals for inline onclick ─────────────────────── */
  function registerGlobals() {
    window._dsmReprobeRow = async function (sourceId, btn) {
      if (!btn) return;
      btn.disabled = true;
      const orig = btn.textContent;
      btn.textContent = '⏳';
      try {
        const resp = await fetch('/api/sources/health?refresh=1');
        if (resp.ok) {
          const data = await resp.json();
          const fresh = (data.sources || []).find(s => s.id === sourceId);
          if (fresh) {
            const updated = latestSources.map(s => s.id === sourceId ? { ...s, ...fresh } : s);
            renderPanel(updated);
          }
        }
      } catch (_) {}
      btn.disabled = false;
      btn.textContent = orig;
    };

    window._dsmToggleInspect = function (safeId) {
      const el = document.getElementById(`dsm-inspect-${safeId}`);
      if (el) {
        el.classList.toggle('dsm-inspect-open');
        const row = document.getElementById(`dsm-irow-${safeId}`);
        if (row) row.classList.toggle('dsm-inspect-row-open');
      }
    };
  }

  /* ── Build a single table row ────────────────────────────────── */
  function buildRow(src) {
    const isError       = src.status === 'UNAVAILABLE' || src.status === 'DEGRADED';
    const isUncfg       = src.status === 'NOT_CONFIGURED';
    const needsAttention = isError || isUncfg;

    const rowCls = ['datasource-row',
      isError ? 'row-has-error' : '',
      isUncfg ? 'row-not-configured' : '',
    ].filter(Boolean).join(' ');

    const safeId = src.id.replace(/[^a-z0-9_-]/gi, '_');
    const host   = esc(src.host || src.provenance?.host || '');

    /* Build inspect drawer */
    let inspectRowHtml = '';
    if (needsAttention) {
      const errMsg  = esc(src.error || src.detail ||
        (isUncfg ? `Set ${src.requiresKey || 'required env var'} in .env and restart.` : 'No upstream diagnostic available.'));
      const reqKey  = src.requiresKey ? `<span class="dsm-inspect-hint">Required: <code>${esc(src.requiresKey)}</code></span>` : '';
      const epHtml  = host ? `<div class="dsm-inspect-endpoint">📡 <code>${host}</code></div>` : '';

      inspectRowHtml = `
        <tr class="dsm-inspect-row" id="dsm-irow-${safeId}">
          <td colspan="6" style="padding:0;">
            <div class="dsm-inspect-drawer" id="dsm-inspect-${safeId}">
              <div class="dsm-inspect-inner">
                <div class="dsm-inspect-label">${isUncfg ? '⚙️ Configuration Required' : '⚠️ Upstream Diagnostic'}</div>
                <div class="dsm-inspect-msg">${errMsg}</div>
                ${epHtml}
                <div class="dsm-inspect-actions">
                  ${reqKey}
                  <button class="dsm-reprobe-row-btn" onclick="window._dsmReprobeRow('${esc(src.id)}', this)">↻ Retry Now</button>
                </div>
              </div>
            </div>
          </td>
        </tr>`;
    }

    const inspectBtn = needsAttention
      ? `<button class="error-toggle-btn dsm-inspect-btn" onclick="window._dsmToggleInspect('${safeId}')">Inspect ⚠️</button>`
      : '';

    const rowHtml = `
      <tr class="${rowCls}" id="dsm-row-${safeId}">
        <td>
          <div class="src-agency-title">${esc(src.agency)}</div>
          <div class="src-host-sub"><small>${host}</small></div>
        </td>
        <td>
          <div class="src-datatype">${esc(src.displayName)}</div>
          <div style="margin-top:4px;">${tierChip(src.tier, src.role)}</div>
        </td>
        <td><span class="src-cadence">${formatCadence(src.cadenceMs)}</span></td>
        <td><span class="src-latency">${src.latencyMs ? `${src.latencyMs} ms` : '—'}</span></td>
        <td>
          <div class="src-age-stamp">${formatAge(src.ageSeconds)}</div>
          ${src.recordCount > 0 ? `<div class="src-record-count"><small>${src.recordCount} records</small></div>` : ''}
        </td>
        <td class="dsm-status-cell">
          <div class="dsm-status-inner">
            ${statusPill(src.status, src.requiresKey)}
            <div class="dsm-row-actions">
              ${inspectBtn}
              <button class="dsm-reprobe-row-btn dsm-row-retry" title="Re-probe this source"
                      onclick="window._dsmReprobeRow('${esc(src.id)}', this)">↻</button>
            </div>
          </div>
        </td>
      </tr>${inspectRowHtml}`;

    return rowHtml;
  }

  /* ── Build a category <details> block ───────────────────────── */
  function buildCategoryBlock(catKey, catLabel, allCatSources) {
    /* apply filter */
    const visible = currentFilter === 'ALL'
      ? allCatSources
      : allCatSources.filter(s => {
          if (currentFilter === 'SIMULATED') return s.status === 'SIMULATED' || s.status === 'DRILL';
          return s.status === currentFilter;
        });

    if (visible.length === 0) return '';

    const sorted = sortBySeverity(visible);

    /* mini-summary for the <summary> bar */
    const cnt = {};
    allCatSources.forEach(s => { cnt[s.status] = (cnt[s.status] || 0) + 1; });
    const parts = [];
    if (cnt.LIVE)           parts.push(`<span class="cat-count-live">${cnt.LIVE}✓</span>`);
    if (cnt.UNAVAILABLE)    parts.push(`<span class="cat-count-err">${cnt.UNAVAILABLE}✕</span>`);
    if (cnt.NOT_CONFIGURED) parts.push(`<span class="cat-count-cfg">${cnt.NOT_CONFIGURED}◌</span>`);
    if (cnt.DEGRADED)       parts.push(`<span class="cat-count-deg">${cnt.DEGRADED}▲</span>`);
    if (cnt.BASELINE || cnt.REFERENCE || cnt.ARCHIVED) {
      const n = (cnt.BASELINE||0)+(cnt.REFERENCE||0)+(cnt.ARCHIVED||0);
      parts.push(`<span class="cat-count-baseline">${n}ℹ</span>`);
    }

    return `
      <div class="dsm-category-block" data-category="${esc(catKey)}">
        <details class="dsm-details" open>
          <summary class="dsm-cat-header">
            <span class="dsm-chevron">▾</span>
            <span class="dsm-cat-label">${catLabel}</span>
            <span class="dsm-cat-meta">${parts.join(' ')}</span>
          </summary>
          <div class="dsm-table-wrap">
            <table class="datasource-table">
              <thead>
                <tr>
                  <th style="width:25%;">Source Agency &amp; Host</th>
                  <th style="width:22%;">Data Type &amp; Tier</th>
                  <th style="width:8%;">Cadence</th>
                  <th style="width:8%;">Latency</th>
                  <th style="width:14%;">Last Success / Age</th>
                  <th style="width:23%;">Status</th>
                </tr>
              </thead>
              <tbody>${sorted.map(buildRow).join('')}</tbody>
            </table>
          </div>
        </details>
      </div>`;
  }

  /* ── Build the filter / summary strip ───────────────────────── */
  function buildStrip(sources) {
    const s = {
      total:        sources.length,
      live:         sources.filter(x => x.status === 'LIVE').length,
      degraded:     sources.filter(x => x.status === 'DEGRADED').length,
      stale:        sources.filter(x => x.status === 'STALE').length,
      unavailable:  sources.filter(x => x.status === 'UNAVAILABLE').length,
      notConfigured:sources.filter(x => x.status === 'NOT_CONFIGURED').length,
      baseline:     sources.filter(x => x.status === 'BASELINE').length,
      archived:     sources.filter(x => x.status === 'ARCHIVED').length,
      reference:    sources.filter(x => x.status === 'REFERENCE').length,
      historical:   sources.filter(x => x.status === 'HISTORICAL').length,
      simulated:    sources.filter(x => x.status === 'SIMULATED' || x.status === 'DRILL').length,
    };

    // Update existing header badge if present
    const badge = document.getElementById('datasources-header-badge');
    if (badge) {
      const liveTarget = sources.filter(x => x.tier === 'LIVE_API').length;
      if (s.live === liveTarget && liveTarget > 0) {
        badge.className = 'risk-badge risk-green';
        badge.textContent = `${s.live}/${liveTarget} Live Feeds Operational`;
      } else if (s.live > 0) {
        badge.className = 'risk-badge risk-orange';
        badge.textContent = `${s.live} of ${liveTarget} Live Feeds Active`;
      } else {
        badge.className = 'risk-badge risk-red';
        badge.textContent = 'Zero Live Feeds Reachable';
      }
    }

    const pill = (label, val, key, cls, always = false) => {
      if (!always && val === 0) return '';
      const active = currentFilter === key ? 'active-filter' : '';
      return `<button class="stat-pill ${cls} ${active}" onclick="window.SourceHealthUI.setFilter('${key}')"><strong>${val}</strong> ${label}</button>`;
    };

    return `
      <div class="datasources-truth-strip">
        <div class="truth-strip-stats">
          ${pill('Total', s.total, 'ALL', 'stat-all', true)}
          ${pill('Live', s.live, 'LIVE', 'stat-live')}
          ${pill('Degraded', s.degraded, 'DEGRADED', 'stat-degraded')}
          ${pill('Stale', s.stale, 'STALE', 'stat-stale')}
          ${pill('Unavailable', s.unavailable, 'UNAVAILABLE', 'stat-unavailable')}
          ${pill('Unconfigured', s.notConfigured, 'NOT_CONFIGURED', 'stat-notconfigured')}
          ${pill('Baseline', s.baseline, 'BASELINE', 'stat-baseline', true)}
          ${pill('Archived', s.archived, 'ARCHIVED', 'stat-archived')}
          ${pill('Reference', s.reference, 'REFERENCE', 'stat-reference')}
          ${pill('Historical', s.historical, 'HISTORICAL', 'stat-historical')}
          ${pill('Simulated', s.simulated, 'SIMULATED', 'stat-simulated')}
        </div>
        <div class="truth-strip-actions">
          <span class="probed-age-text" id="dsm-probed-age">Probing…</span>
          <button class="btn btn-glass reprobe-action-btn" id="datasources-reprobe-btn"
                  onclick="window.SourceHealthUI.reprobe()">🔄 Re-probe All</button>
        </div>
      </div>`;
  }

  /* ── Main render ─────────────────────────────────────────────── */
  function renderPanel(incoming) {
    const container = document.getElementById('datasources-root-container');
    if (!container) return;

    // Never overwrite real data with empty
    if (incoming && incoming.length > 0) latestSources = incoming;
    const sources = latestSources;

    lastProbedTimestamp = Date.now();

    if (!sources || sources.length === 0) {
      container.innerHTML = `
        <div class="datasources-no-telemetry-banner">
          ⏳ <strong>Loading Data Sources…</strong> Fetching probe results.
        </div>`;
      return;
    }

    const liveCount = sources.filter(s => s.status === 'LIVE').length;

    let html = '';
    if (liveCount === 0) {
      html += `
        <div class="datasources-no-telemetry-banner">
          ⚠️ <strong>NO LIVE TELEMETRY REACHABLE</strong> — Operating strictly on reference baselines. Do not use for live rescue dispatch.
        </div>`;
    }

    html += buildStrip(sources);

    // Group by category
    const grouped = {};
    sources.forEach(s => {
      const k = s.category || 'other';
      if (!grouped[k]) grouped[k] = [];
      grouped[k].push(s);
    });

    let hasRows = false;
    CATEGORIES.forEach(({ key, label }) => {
      const cats = grouped[key];
      if (!cats || cats.length === 0) return;
      const block = buildCategoryBlock(key, label, cats);
      if (block) { html += block; hasRows = true; }
    });

    // Catch-all orphaned sources
    const knownKeys = new Set(CATEGORIES.map(c => c.key));
    const orphaned = sources.filter(s => !knownKeys.has(s.category || ''));
    if (orphaned.length > 0) {
      const block = buildCategoryBlock('other', '📡 Other Data Sources', orphaned);
      if (block) { html += block; hasRows = true; }
    }

    if (!hasRows && currentFilter !== 'ALL') {
      html += `
        <div class="datasources-no-telemetry-banner" style="text-align:center;padding:24px 20px;">
          <p style="margin-bottom:12px;">No sources match the <strong>${esc(currentFilter)}</strong> filter.</p>
          <button class="btn btn-glass" onclick="window.SourceHealthUI.setFilter('ALL')">Clear Filter</button>
        </div>`;
    }

    container.innerHTML = html;
    updateTicker();
  }

  /* ── REST Probe ──────────────────────────────────────────────── */
  async function triggerReprobe(forceRefresh = true) {
    if (isReprobing) return;
    isReprobing = true;
    const btn = document.getElementById('datasources-reprobe-btn');
    if (btn) { btn.disabled = true; btn.innerHTML = '⏳ Probing…'; }

    try {
      const resp = await fetch(`/api/sources/health${forceRefresh ? '?refresh=1' : ''}`);
      if (resp.ok) {
        const data = await resp.json();
        if (data.sources && data.sources.length > 0) renderPanel(data.sources);
      }
    } catch (e) {
      console.warn('[DSM] Probe failed:', e.message);
      if (latestSources.length === 0) {
        const container = document.getElementById('datasources-root-container');
        if (container) {
          container.innerHTML = `<div class="datasources-no-telemetry-banner">⚠️ <strong>Health Engine Unreachable:</strong> ${esc(e.message)}</div>`;
        }
      }
    } finally {
      isReprobing = false;
      const b = document.getElementById('datasources-reprobe-btn');
      if (b) { b.disabled = false; b.innerHTML = '🔄 Re-probe All'; }
    }
  }

  /* ── Public API ──────────────────────────────────────────────── */
  function setFilter(f) {
    currentFilter = f;
    renderPanel(latestSources);
  }

  function init() {
    registerGlobals();

    if (timerTicker) clearInterval(timerTicker);
    timerTicker = setInterval(updateTicker, 1000);

    // Immediate REST fetch (no cache bust on first load)
    triggerReprobe(false);

    // Firestore realtime listener
    function attachFirestoreListener() {
      if (window.firebaseLive && typeof window.firebaseLive.onDatasources === 'function') {
        window.firebaseLive.onDatasources((ds) => {
          if (ds && ds.length > 0) renderPanel(ds);
        });
      } else {
        setTimeout(attachFirestoreListener, 2000);
      }
    }
    attachFirestoreListener();
  }

  window.SourceHealthUI = { init, refresh: () => triggerReprobe(false), reprobe: () => triggerReprobe(true), setFilter };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})(typeof window !== 'undefined' ? window : global);

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

  let lastProbedTimestamp = null;
  let timerTicker = null;
  let currentFilter = 'ALL';
  let latestSources = [];

  const CATEGORY_TITLES = {
    'seismic': '🚨 Seismic & Earthquake Sensors',
    'weather': '🌪️ Meteorological & Doppler Weather Feeds',
    'hydrology': '🌊 River Basin Hydrological Gauges & Inundation',
    'air': '🌫️ Atmospheric Quality & Ground Stations',
    'alerts': '🔔 Official Common Alerting Protocol (CAP) Broadcasts',
    'satellite': '🛰️ Earth Observation Satellites & Thermal Feeds',
    'routing': '🛣️ Road Infrastructure & Safe Corridors',
    'reference': '🏛️ Official Enumerated Civil Infrastructure & Baselines',
    'database': '🔥 Realtime Database & Multi-Device Sync',
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
    if (ms >= 86400000) return `${Math.round(ms / 86400000)}d (Static)`;
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

  async function triggerReprobe() {
    const reprobeBtn = document.getElementById('datasources-reprobe-btn');
    if (reprobeBtn) {
      reprobeBtn.disabled = true;
      reprobeBtn.innerHTML = '<span>⏳ Probing Feeds…</span>';
    }
    try {
      const resp = await fetch('/api/sources/health?refresh=1');
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      // If we got here but Firestore isn't updating (e.g. backend doesn't push to Firestore yet),
      // we could manually trigger a render here as a fallback. But according to requirements, 
      // we strictly use Firestore onSnapshot.
      const data = await resp.json();
      if (!window.firebaseLive || !window.firebaseLive.datasources || window.firebaseLive.datasources.length === 0) {
          // Fallback if Firestore is empty (e.g. backend not syncing to Firestore yet)
          renderSourcesPanel(data.sources || []);
      }
    } catch (e) {
      console.warn('Reprobe error:', e);
      if (reprobeBtn) {
        reprobeBtn.disabled = false;
        reprobeBtn.innerHTML = '🔄 Re-probe';
      }
    }
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
      case 'REFERENCE':
        return '<span class="source-status-pill status-pill-reference">📁 REFERENCE</span>';
      case 'ARCHIVED':
        return '<span class="source-status-pill status-pill-archived">📜 ARCHIVED</span>';
      case 'HISTORICAL':
        return '<span class="source-status-pill status-pill-historical">📜 HISTORICAL</span>';
      case 'DERIVED':
        return '<span class="source-status-pill status-pill-derived">⚙ DERIVED</span>';
      case 'SIMULATED':
      case 'DRILL':
        return '<span class="source-status-pill status-pill-drill">⚡ DRILL / SIMULATED</span>';
      default:
        return `<span class="source-status-pill">${escapeHtml(status)}</span>`;
    }
  }

  function renderTierChip(tier) {
    switch (tier) {
      case 'LIVE_API':
        return '<span class="source-tier-chip tier-live-api">LIVE API</span>';
      case 'REFERENCE':
        return '<span class="source-tier-chip tier-reference">REFERENCE</span>';
      case 'BASELINE':
      case 'OFFICIAL_BASELINE':
        return '<span class="source-tier-chip tier-baseline">BASELINE</span>';
      case 'ARCHIVED':
        return '<span class="source-tier-chip tier-archived">ARCHIVED</span>';
      case 'HISTORICAL':
        return '<span class="source-tier-chip tier-historical">HISTORICAL</span>';
      case 'DERIVED':
        return '<span class="source-tier-chip tier-derived">DERIVED</span>';
      case 'SIMULATED':
      case 'DRILL':
        return '<span class="source-tier-chip tier-drill">SIMULATED — DRILL</span>';
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

  function setFilter(filterType) {
    currentFilter = filterType;
    renderSourcesPanel(latestSources);
  }

  function renderSourcesPanel(sources = []) {
    latestSources = sources;
    const container = document.getElementById('datasources-root-container');
    if (!container) return;

    lastProbedTimestamp = Date.now();

    const s = {
      live: sources.filter(src => src.status === 'LIVE').length,
      degraded: sources.filter(src => src.status === 'DEGRADED').length,
      stale: sources.filter(src => src.status === 'STALE').length,
      unavailable: sources.filter(src => src.status === 'UNAVAILABLE').length,
      notConfigured: sources.filter(src => src.status === 'NOT_CONFIGURED').length,
      baseline: sources.filter(src => src.status === 'BASELINE').length,
      archived: sources.filter(src => src.status === 'ARCHIVED').length,
      reference: sources.filter(src => src.status === 'REFERENCE').length,
      historical: sources.filter(src => src.status === 'HISTORICAL').length,
      simulated: sources.filter(src => src.status === 'SIMULATED' || src.status === 'DRILL').length,
    };

    const liveTarget = sources.filter(src => src.tier === 'LIVE_API').length;

    // Update badge in header if exists
    const badge = document.getElementById('datasources-header-badge');
    if (badge) {
      if (s.live === liveTarget && liveTarget > 0) {
        badge.className = 'risk-badge risk-green';
        badge.textContent = `${s.live}/${liveTarget} Live Feeds Operational`;
      } else if (s.live > 0) {
        badge.className = 'risk-badge risk-orange';
        badge.textContent = `${s.live} of ${liveTarget} Live Feeds Active`;
      } else if (sources.length > 0) {
        badge.className = 'risk-badge risk-red';
        badge.textContent = 'Zero Live Feeds Reachable';
      }
    }

    if (sources.length === 0) {
        container.innerHTML = `
          <div class="datasources-no-telemetry-banner">
            ⏳ <strong>Loading Data Sources...</strong> Waiting for sync from cloud.
          </div>
        `;
        return;
    }

    // Apply Filter
    let filteredSources = sources;
    if (currentFilter !== 'ALL') {
      if (currentFilter === 'SIMULATED') {
         filteredSources = sources.filter(src => src.status === 'SIMULATED' || src.status === 'DRILL');
      } else {
         filteredSources = sources.filter(src => src.status === currentFilter);
      }
    }

    // Group sources by category
    const categories = {};
    filteredSources.forEach(src => {
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

    // 2. Truth Header Strip (Clickable Filters)
    html += `
      <div class="datasources-truth-strip">
        <div class="truth-strip-stats">
          <span class="stat-pill stat-all ${currentFilter === 'ALL' ? 'active-filter' : ''}" onclick="window.SourceHealthUI.setFilter('ALL')" style="cursor:pointer; border: 1px solid #ccc; padding: 2px 8px; border-radius: 12px; margin-right: 4px;"><strong>${sources.length}</strong> Total</span>
          ${s.live > 0 ? `<span class="stat-pill stat-live ${currentFilter === 'LIVE' ? 'active-filter' : ''}" onclick="window.SourceHealthUI.setFilter('LIVE')" style="cursor:pointer;"><strong>${s.live}</strong> Live</span>` : ''}
          ${s.degraded > 0 ? `<span class="stat-pill stat-degraded ${currentFilter === 'DEGRADED' ? 'active-filter' : ''}" onclick="window.SourceHealthUI.setFilter('DEGRADED')" style="cursor:pointer;"><strong>${s.degraded}</strong> Degraded</span>` : ''}
          ${s.stale > 0 ? `<span class="stat-pill stat-stale ${currentFilter === 'STALE' ? 'active-filter' : ''}" onclick="window.SourceHealthUI.setFilter('STALE')" style="cursor:pointer;"><strong>${s.stale}</strong> Stale</span>` : ''}
          ${s.unavailable > 0 ? `<span class="stat-pill stat-unavailable ${currentFilter === 'UNAVAILABLE' ? 'active-filter' : ''}" onclick="window.SourceHealthUI.setFilter('UNAVAILABLE')" style="cursor:pointer;"><strong>${s.unavailable}</strong> Unavailable</span>` : ''}
          ${s.notConfigured > 0 ? `<span class="stat-pill stat-notconfigured ${currentFilter === 'NOT_CONFIGURED' ? 'active-filter' : ''}" onclick="window.SourceHealthUI.setFilter('NOT_CONFIGURED')" style="cursor:pointer;"><strong>${s.notConfigured}</strong> Unconfigured</span>` : ''}
          <span class="stat-pill stat-baseline ${currentFilter === 'BASELINE' ? 'active-filter' : ''}" onclick="window.SourceHealthUI.setFilter('BASELINE')" style="cursor:pointer;"><strong>${s.baseline}</strong> Baseline</span>
          ${s.archived > 0 ? `<span class="stat-pill stat-archived ${currentFilter === 'ARCHIVED' ? 'active-filter' : ''}" onclick="window.SourceHealthUI.setFilter('ARCHIVED')" style="cursor:pointer;"><strong>${s.archived}</strong> Archived</span>` : ''}
          ${s.reference > 0 ? `<span class="stat-pill stat-reference ${currentFilter === 'REFERENCE' ? 'active-filter' : ''}" onclick="window.SourceHealthUI.setFilter('REFERENCE')" style="cursor:pointer;"><strong>${s.reference}</strong> Reference</span>` : ''}
          ${s.historical > 0 ? `<span class="stat-pill stat-historical ${currentFilter === 'HISTORICAL' ? 'active-filter' : ''}" onclick="window.SourceHealthUI.setFilter('HISTORICAL')" style="cursor:pointer;"><strong>${s.historical}</strong> Historical</span>` : ''}
          ${s.simulated > 0 ? `<span class="stat-pill stat-simulated ${currentFilter === 'SIMULATED' ? 'active-filter' : ''}" onclick="window.SourceHealthUI.setFilter('SIMULATED')" style="cursor:pointer;"><strong>${s.simulated}</strong> Simulated</span>` : ''}
        </div>
        <div class="truth-strip-actions">
          <span class="probed-age-text" id="datasources-probed-age">Last probed 0s ago</span>
          <button class="btn btn-glass reprobe-action-btn" id="datasources-reprobe-btn" onclick="window.SourceHealthUI.reprobe()">
            🔄 Re-probe
          </button>
        </div>
      </div>
    `;

    // 3. Category tables — render known categories first
    const catKeys = Object.keys(CATEGORY_TITLES);
    let hasResults = false;
    const renderedIds = new Set();

    catKeys.forEach(catKey => {
      const catSources = categories[catKey];
      if (!catSources || catSources.length === 0) return;
      hasResults = true;

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
        renderedIds.add(src.id);
        const isError = src.status === 'UNAVAILABLE' || src.status === 'DEGRADED';
        const rowId = `datasource-row-${src.id}`;
        const errDetailId = `err-detail-${src.id}`;

        html += `
          <tr id="${rowId}" class="datasource-row ${isError ? 'row-has-error' : ''}">
            <td>
              <div class="src-agency-title">${escapeHtml(src.agency)}</div>
              <div class="src-host-sub"><small>${escapeHtml(src.host || src.provenance?.host)}</small></div>
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

        if (src.error || src.detail) {
          html += `
            <tr id="${errDetailId}" class="datasource-error-row">
              <td colspan="6">
                <div class="datasource-error-box ${src.error ? 'box-error' : 'box-detail'}">
                  ${src.detail ? `<div class="box-detail-line"><strong>Telemetry Detail:</strong> ${escapeHtml(src.detail)}</div>` : ''}
                  ${src.error ? `<div class="box-error-line"><strong>Upstream Diagnostic:</strong> <code>${escapeHtml(src.error)}</code> (Host: ${escapeHtml(src.host || src.provenance?.host)})</div>` : ''}
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

    // 4. Catch-all: render any sources whose category isn't in CATEGORY_TITLES
    const orphaned = filteredSources.filter(src => !renderedIds.has(src.id));
    if (orphaned.length > 0) {
      hasResults = true;
      html += `
        <div class="datasource-category-block">
          <div class="datasource-cat-header">📡 Other Data Sources</div>
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
      orphaned.forEach(src => {
        const isError = src.status === 'UNAVAILABLE' || src.status === 'DEGRADED';
        const rowId = `datasource-row-${src.id}`;
        const errDetailId = `err-detail-${src.id}`;
        html += `
          <tr id="${rowId}" class="datasource-row ${isError ? 'row-has-error' : ''}">
            <td>
              <div class="src-agency-title">${escapeHtml(src.agency)}</div>
              <div class="src-host-sub"><small>${escapeHtml(src.host || src.provenance?.host)}</small></div>
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
        if (src.error || src.detail) {
          html += `
            <tr id="${errDetailId}" class="datasource-error-row">
              <td colspan="6">
                <div class="datasource-error-box ${src.error ? 'box-error' : 'box-detail'}">
                  ${src.detail ? `<div class="box-detail-line"><strong>Telemetry Detail:</strong> ${escapeHtml(src.detail)}</div>` : ''}
                  ${src.error ? `<div class="box-error-line"><strong>Upstream Diagnostic:</strong> <code>${escapeHtml(src.error)}</code></div>` : ''}
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
    }

    if (!hasResults && currentFilter !== 'ALL') {
       html += `
          <div class="datasources-no-telemetry-banner" style="text-align: center; padding: 20px;">
            <p>No data sources match the <strong>${currentFilter}</strong> filter.</p>
            <button class="btn btn-glass" onclick="window.SourceHealthUI.setFilter('ALL')">Clear Filter</button>
          </div>
       `;
    }

    container.innerHTML = html;
  }

  function init() {
    if (timerTicker) clearInterval(timerTicker);
    timerTicker = setInterval(updateTicker, 1000);

    // Initial fallback fetch to populate if Firebase hasn't synced yet or doesn't have it
    triggerReprobe();
    
    // Attach to Firebase Live State for realtime updates from onSnapshot
    if (window.firebaseLive && typeof window.firebaseLive.onDatasources === 'function') {
      window.firebaseLive.onDatasources((datasources) => {
        renderSourcesPanel(datasources);
      });
    } else {
      // If firebaseLive isn't ready immediately, wait a short moment and try again
      setTimeout(() => {
        if (window.firebaseLive && typeof window.firebaseLive.onDatasources === 'function') {
          window.firebaseLive.onDatasources((datasources) => {
            renderSourcesPanel(datasources);
          });
        }
      }, 2000);
    }
  }

  window.SourceHealthUI = {
    init,
    refresh: () => triggerReprobe(),
    reprobe: () => triggerReprobe(),
    setFilter: (f) => setFilter(f)
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(typeof window !== 'undefined' ? window : global);
