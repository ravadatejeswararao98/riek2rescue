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
  const CATEGORY_TITLES = {
    'seismic': '🌍 Seismic & Earthquake Sensors',
    'weather': '🌪️ Meteorological & Doppler Weather Feeds',
    'hydrology': '🌊 River Basin Hydrological Gauges & Inundation',
    'air': '🌫️ Atmospheric Quality & Ground Stations',
    'alerts': '🔔 Official CAP Broadcasts',
    'satellite': '🛰️ Earth Observation Satellites & Thermal Feeds',
    'routing': '🛣️ Road Infrastructure & Safe Corridors',
    'reference': '🏛️ Official Enumerated Civil Infrastructure & Baselines',
    'ai': '🧠 Neural Inference & Decision Support Models'
  };

  const CATEGORIES = [
    { key: 'seismic',   label: CATEGORY_TITLES.seismic },
    { key: 'weather',   label: CATEGORY_TITLES.weather },
    { key: 'hydrology', label: CATEGORY_TITLES.hydrology },
    { key: 'air',       label: CATEGORY_TITLES.air },
    { key: 'alerts',    label: CATEGORY_TITLES.alerts },
    { key: 'satellite', label: CATEGORY_TITLES.satellite },
    { key: 'routing',   label: CATEGORY_TITLES.routing },
    { key: 'reference', label: CATEGORY_TITLES.reference },
    { key: 'ai',        label: CATEGORY_TITLES.ai },
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
      SIMULATED:         ['tier-drill',     'SIMULATED — DRILL'],
      DRILL:             ['tier-drill',     'SIMULATED — DRILL'],
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
