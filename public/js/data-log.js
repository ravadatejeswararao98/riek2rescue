/**
 * RISK2RESCUE — DATA LOG MODULE (public/js/data-log.js)
 *
 * Features:
 * - Lists all data sources with their live status
 * - Clicking a source name slides up a log drawer showing current + past entries
 * - Auto-refreshes every 10 seconds
 * - Manual "Refresh Now" button per source and global
 * - Session-scoped log history: accumulates since authority login
 * - Clicking an open source name again closes the drawer
 */

(function () {
  'use strict';

  /* ── Session Log Store ──────────────────────────────────────────
     Holds in-memory log entries per source from the moment the
     authority logged in. Never persisted to disk.
  ──────────────────────────────────────────────────────────────── */
  const sessionLog = {}; // { sourceId: [ { ts, status, recordCount, latencyMs, error, rawSnippet } ] }
  const SESSION_START = new Date();
  let autoRefreshTimer = null;
  let activeDrawerSourceId = null;

  /* ── Utility ────────────────────────────────────────────────── */
  function fmt(ts) {
    if (!ts) return '—';
    try {
      return new Date(ts).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    } catch { return ts; }
  }

  function fmtFull(ts) {
    if (!ts) return '—';
    try {
      return new Date(ts).toLocaleString('en-IN');
    } catch { return ts; }
  }

  function statusPill(status) {
    const map = {
      LIVE:           { cls: 'dl-pill-live',    label: '● LIVE' },
      DEGRADED:       { cls: 'dl-pill-degraded',label: '▲ DEGRADED' },
      UNAVAILABLE:    { cls: 'dl-pill-unavail', label: '✖ UNAVAILABLE' },
      NOT_CONFIGURED: { cls: 'dl-pill-noconf',  label: '○ NOT CONFIGURED' },
      STALE:          { cls: 'dl-pill-stale',   label: '◑ STALE' },
      BASELINE:       { cls: 'dl-pill-base',    label: '□ BASELINE' },
      ARCHIVED:       { cls: 'dl-pill-base',    label: '▣ ARCHIVED' },
    };
    const s = map[status] || { cls: 'dl-pill-base', label: status || '—' };
    return `<span class="dl-pill ${s.cls}">${s.label}</span>`;
  }

  /* ── Fetch source health list ───────────────────────────────── */
  async function fetchSources(force = false) {
    const url = `/api/sources/health${force ? '?refresh=1' : ''}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json(); // { sources: [...] }
  }

  /* ── Fetch raw payload for one source ──────────────────────── */
  async function fetchSourceRaw(sourceId) {
    const res = await fetch(`/api/sources/${encodeURIComponent(sourceId)}/raw`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json(); // { sourceId, metrics, rawPayload }
  }

  /* ── Accumulate log entry for a source ─────────────────────── */
  function addLogEntry(sourceId, entry) {
    if (!sessionLog[sourceId]) sessionLog[sourceId] = [];
    // Prepend so newest is first
    sessionLog[sourceId].unshift({ ...entry, sessionTs: new Date().toISOString() });
    // Cap at 50 entries per source
    if (sessionLog[sourceId].length > 50) sessionLog[sourceId].length = 50;
  }

  /* ── Render source list ─────────────────────────────────────── */
  function renderSourceList(sources) {
    const container = document.getElementById('dl-source-list');
    if (!container) return;

    if (!sources || sources.length === 0) {
      container.innerHTML = '<div class="dl-loading">No data sources found.</div>';
      return;
    }

    // Sort: UNAVAILABLE/DEGRADED first, then by category
    const sorted = [...sources].sort((a, b) => {
      const order = { UNAVAILABLE: 0, DEGRADED: 1, NOT_CONFIGURED: 2, STALE: 3, LIVE: 4, BASELINE: 5 };
      return (order[a.status] ?? 9) - (order[b.status] ?? 9);
    });

    container.innerHTML = sorted.map(src => {
      const isActive = activeDrawerSourceId === src.id;
      return `
        <div class="dl-source-row ${isActive ? 'dl-source-row--active' : ''}" 
             id="dl-row-${src.id}"
             data-source-id="${src.id}">
          <div class="dl-source-main" onclick="window._dlToggleDrawer('${src.id}', '${escHtml(src.name || src.id)}')">
            <div class="dl-source-name-group">
              <span class="dl-source-name">${escHtml(src.name || src.id)}</span>
              ${statusPill(src.status)}
              ${src.category ? `<span class="dl-source-cat">${escHtml(src.category)}</span>` : ''}
            </div>
            <div class="dl-source-meta">
              ${src.lastCheckedAt ? `<span>Last checked: ${fmt(src.lastCheckedAt)}</span>` : ''}
              ${src.latencyMs != null ? `<span>${src.latencyMs}ms</span>` : ''}
              ${src.recordCount != null ? `<span>${src.recordCount} records</span>` : ''}
            </div>
          </div>
          <button class="dl-row-refresh-btn" 
                  title="Refresh ${escHtml(src.name || src.id)}"
                  onclick="window._dlRefreshSource('${src.id}', '${escHtml(src.name || src.id)}'); event.stopPropagation();">
            <i class="fi fi-rr-rotate-right" aria-hidden="true"></i>
          </button>
          <span class="dl-chevron">${isActive ? '▲' : '▼'}</span>
        </div>`;
    }).join('');
  }

  function escHtml(str) {
    return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  /* ── Toggle log drawer ─────────────────────────────────────── */
  window._dlToggleDrawer = function (sourceId, sourceName) {
    const drawer = document.getElementById('dl-drawer');
    if (!drawer) return;

    if (activeDrawerSourceId === sourceId) {
      // Same source clicked again — close drawer
      activeDrawerSourceId = null;
      drawer.classList.remove('dl-drawer--open');
      setTimeout(() => { drawer.style.display = 'none'; }, 320);
      // Update row chevrons
      document.querySelectorAll('.dl-source-row').forEach(r => r.classList.remove('dl-source-row--active'));
      document.querySelectorAll('.dl-chevron').forEach(c => c.textContent = '▼');
      return;
    }

    // New source opened
    activeDrawerSourceId = sourceId;
    drawer.style.display = 'flex';
    requestAnimationFrame(() => drawer.classList.add('dl-drawer--open'));

    const titleEl = document.getElementById('dl-drawer-title');
    if (titleEl) titleEl.textContent = sourceName;

    // Update active state in list
    document.querySelectorAll('.dl-source-row').forEach(r => {
      r.classList.toggle('dl-source-row--active', r.dataset.sourceId === sourceId);
    });
    document.querySelectorAll('.dl-chevron').forEach((c, i) => {
      const row = document.querySelectorAll('.dl-source-row')[i];
      c.textContent = (row && row.dataset.sourceId === sourceId) ? '▲' : '▼';
    });

    renderDrawerLog(sourceId);
    fetchAndLogSource(sourceId);
  };

  /* ── Render drawer log entries ─────────────────────────────── */
  function renderDrawerLog(sourceId) {
    const body = document.getElementById('dl-drawer-body');
    if (!body) return;

    const entries = sessionLog[sourceId] || [];
    if (entries.length === 0) {
      body.innerHTML = '<div class="dl-loading">Fetching live data…</div>';
      return;
    }

    body.innerHTML = `
      <div class="dl-log-list">
        ${entries.map((e, i) => `
          <div class="dl-log-entry ${i === 0 ? 'dl-log-entry--latest' : ''}">
            <div class="dl-log-entry-header">
              <span class="dl-log-time">${fmtFull(e.sessionTs)}</span>
              ${statusPill(e.status)}
              ${e.latencyMs != null ? `<span class="dl-log-latency">${e.latencyMs}ms</span>` : ''}
              ${e.recordCount != null ? `<span class="dl-log-records">${e.recordCount} records</span>` : ''}
              ${i === 0 ? '<span class="dl-log-live-badge">● LATEST</span>' : ''}
            </div>
            ${e.error ? `<div class="dl-log-error">⚠ ${escHtml(e.error)}</div>` : ''}
            ${e.rawSnippet ? `
              <details class="dl-log-raw">
                <summary>View raw payload snippet</summary>
                <pre class="dl-log-pre">${escHtml(e.rawSnippet)}</pre>
              </details>` : ''}
          </div>`).join('')}
      </div>`;
  }

  /* ── Fetch and log a single source ────────────────────────── */
  async function fetchAndLogSource(sourceId) {
    try {
      const data = await fetchSourceRaw(sourceId);
      const m = data.metrics || {};
      const rawSnippet = data.rawPayload
        ? JSON.stringify(data.rawPayload, null, 2).slice(0, 600) + (JSON.stringify(data.rawPayload).length > 600 ? '\n…' : '')
        : null;

      addLogEntry(sourceId, {
        status: m.consecutiveFailures > 0 ? 'DEGRADED' : (m.lastSuccessAt ? 'LIVE' : 'UNAVAILABLE'),
        latencyMs: m.lastLatencyMs ?? null,
        recordCount: m.lastRecordCount ?? null,
        lastSuccessAt: m.lastSuccessAt,
        error: m.lastError || null,
        rawSnippet
      });
    } catch (err) {
      addLogEntry(sourceId, {
        status: 'UNAVAILABLE',
        error: err.message,
        rawSnippet: null
      });
    }

    if (activeDrawerSourceId === sourceId) {
      renderDrawerLog(sourceId);
    }
  }

  /* ── Global refresh ─────────────────────────────────────────── */
  async function refreshAll(force = false) {
    const btn = document.getElementById('dl-refresh-all-btn');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fi fi-rr-rotate-right" aria-hidden="true"></i> Refreshing…'; }

    try {
      const data = await fetchSources(force);
      const sources = data.sources || [];
      renderSourceList(sources);

      // Log each source into session log
      sources.forEach(src => {
        addLogEntry(src.id, {
          status: src.status,
          latencyMs: src.latencyMs ?? null,
          recordCount: src.recordCount ?? null,
          lastSuccessAt: src.lastCheckedAt,
          error: src.error || null,
          rawSnippet: null
        });
      });

      // If a drawer is open, re-render it
      if (activeDrawerSourceId) {
        renderDrawerLog(activeDrawerSourceId);
        fetchAndLogSource(activeDrawerSourceId);
      }
    } catch (err) {
      const list = document.getElementById('dl-source-list');
      if (list) list.innerHTML = `<div class="dl-loading">⚠ Could not reach server: ${escHtml(err.message)}</div>`;
    } finally {
      if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fi fi-rr-rotate-right" aria-hidden="true"></i> Refresh Now'; }
    }
  }

  /* ── Per-source refresh ─────────────────────────────────────── */
  window._dlRefreshSource = async function (sourceId, sourceName) {
    // Also open drawer if not already open
    if (activeDrawerSourceId !== sourceId) {
      window._dlToggleDrawer(sourceId, sourceName);
    }
    await fetchAndLogSource(sourceId);
  };

  /* ── Auto-refresh loop ──────────────────────────────────────── */
  function startAutoRefresh() {
    stopAutoRefresh();
    autoRefreshTimer = setInterval(() => {
      refreshAll(false);
    }, 10000);
  }

  function stopAutoRefresh() {
    if (autoRefreshTimer) { clearInterval(autoRefreshTimer); autoRefreshTimer = null; }
  }

  /* ── Init ────────────────────────────────────────────────────── */
  function initDataLog() {
    // Set session start time
    const sessionEl = document.getElementById('dl-session-start');
    if (sessionEl) sessionEl.textContent = SESSION_START.toLocaleTimeString('en-IN');

    // Global refresh button
    const refreshAllBtn = document.getElementById('dl-refresh-all-btn');
    if (refreshAllBtn) refreshAllBtn.addEventListener('click', () => refreshAll(true));

    // Drawer close button
    const closeBtn = document.getElementById('dl-drawer-close-btn');
    if (closeBtn) closeBtn.addEventListener('click', () => {
      if (activeDrawerSourceId) window._dlToggleDrawer(activeDrawerSourceId, '');
    });

    // Drawer refresh button
    const drawerRefreshBtn = document.getElementById('dl-drawer-refresh-btn');
    if (drawerRefreshBtn) drawerRefreshBtn.addEventListener('click', () => {
      if (activeDrawerSourceId) fetchAndLogSource(activeDrawerSourceId);
    });

    // Initial load
    refreshAll(false);
    startAutoRefresh();
  }

  /* ── Hook into existing authority dock navigation ─────────────
     When the "data-log" view is shown, initialise the panel.
     Re-use the existing dock-item click wiring already in authority.js.
  ──────────────────────────────────────────────────────────────── */
  let dlInitialized = false;

  // Observe for when #view-data-log becomes visible
  const observer = new MutationObserver(() => {
    const panel = document.getElementById('view-data-log');
    if (panel && panel.style.display !== 'none' && !dlInitialized) {
      dlInitialized = true;
      initDataLog();
    }
    // Stop/start auto refresh based on visibility
    if (panel) {
      if (panel.style.display === 'none') {
        stopAutoRefresh();
      } else if (dlInitialized && !autoRefreshTimer) {
        startAutoRefresh();
      }
    }
  });

  document.addEventListener('DOMContentLoaded', () => {
    const panel = document.getElementById('view-data-log');
    if (panel) observer.observe(panel, { attributes: true, attributeFilter: ['style'] });
  });

})();
