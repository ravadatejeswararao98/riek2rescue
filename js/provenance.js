/**
 * RISK2RESCUE — PROVENANCE ENGINE (js/provenance.js)
 * Uniform data rendering with agency attribution, age stamps, and audit tracing.
 * 
 * Prime Directive: Never invent a number.
 * If data is missing or source is UNAVAILABLE, renders "—" with an UNAVAILABLE chip.
 */

(function(window) {
  'use strict';

  const Provenance = {
    /**
     * Map of known agency short labels by sourceId
     */
    agencyShortNames: {
      'usgs_earthquakes': 'USGS',
      'openmeteo_weather': 'Open-Meteo',
      'openmeteo_airquality': 'Open-Meteo AQ',
      'cwc_nwic_river': 'CWC / NWIC',
      'imd_cap_alerts': 'IMD CAP',
      'cap_imd': 'IMD CAP',
      'cap_cwc': 'CWC CAP',
      'cap_incois': 'INCOIS CAP',
      'cap_gsi': 'GSI CAP',
      'cpcb_airquality': 'CPCB MoEFCC',
      'gdacs_events': 'GDACS',
      'copernicus_dataspace': 'Copernicus SAR',
      'google_flood_forecast': 'Google Flood Hub',
      'osrm_routing': 'OSRM / OSM',
      'nasa_firms_viirs': 'NASA FIRMS',
      'sentinel_hub_api': 'Sentinel Hub',
      'windy_point_forecast': 'Windy.com',
      'ollama_llm': 'Ollama Local',
      'ai_service_fastapi': 'GeoAI TerraMind',
      'ap_sdma_shelters': 'AP SDMA Directory',
      'census_india_ap': 'Census 2011',
      'ap_boundary_polygon': 'Survey of India'
    },

    /**
     * Formats relative age
     */
    formatAge(fetchedAt) {
      if (!fetchedAt) return '';
      const ms = Date.now() - new Date(fetchedAt).getTime();
      const sec = Math.max(0, Math.floor(ms / 1000));
      if (sec < 60) return `${sec}s ago`;
      const min = Math.floor(sec / 60);
      if (min < 60) return `${min}m ago`;
      const hrs = Math.floor(min / 60);
      if (hrs < 24) return `${hrs}h ago`;
      return `${Math.floor(hrs / 24)}d ago`;
    },

    /**
     * Highlights or opens the source row in the Sensor Data Sources panel
     */
    openSourceInPanel(sourceId) {
      if (typeof window.switchView === 'function') {
        window.switchView('datasources');
      }
      setTimeout(() => {
        const row = document.getElementById(`datasource-row-${sourceId}`);
        if (row) {
          row.scrollIntoView({ behavior: 'smooth', block: 'center' });
          row.classList.add('datasource-row-highlight');
          setTimeout(() => row.classList.remove('datasource-row-highlight'), 3000);
        }
      }, 150);
    },

    /**
     * Core renderer for any dynamic metric
     * @param {HTMLElement|string} targetEl - Element or query selector
     * @param {Object} options
     * @param {*} options.value - Number, string, or null
     * @param {string} [options.unit] - Optional unit (e.g. 'km/h', 'M', 'm')
     * @param {string} options.sourceId - ID of contributing source
     * @param {string} [options.status] - 'LIVE' | 'STALE' | 'DEGRADED' | 'UNAVAILABLE' | 'NOT_CONFIGURED' | 'BASELINE'
     * @param {string|number} [options.fetchedAt] - Timestamp of acquisition
     * @param {string[]} [options.contributingSourceIds] - For DERIVED metrics
     */
    renderValue(targetEl, options = {}) {
      const el = typeof targetEl === 'string' ? document.querySelector(targetEl) : targetEl;
      if (!el) return;

      const { value, unit = '', sourceId, status = 'LIVE', fetchedAt, contributingSourceIds } = options;
      const isUnavailable = status === 'UNAVAILABLE' || status === 'NOT_CONFIGURED' || value === null || value === undefined || value === '';

      if (sourceId) {
        el.setAttribute('data-source-id', sourceId);
      }
      if (status) {
        el.setAttribute('data-source-status', status);
      }

      // 1. If unavailable, show honest "—" with UNAVAILABLE chip
      if (isUnavailable) {
        el.innerHTML = `<span class="val-num val-unavailable">—</span>${unit ? ` <span class="val-unit">${escapeHtml(unit)}</span>` : ''} <span class="provenance-chip status-unavailable" title="Source unavailable or not reporting" onclick="event.stopPropagation(); window.Provenance.openSourceInPanel('${sourceId}')">UNAVAILABLE</span>`;
        return;
      }

      // 2. Render actual value
      const agencyLabel = Provenance.agencyShortNames[sourceId] || sourceId;
      const ageStr = fetchedAt ? Provenance.formatAge(fetchedAt) : '';
      const displayVal = typeof value === 'number' ? (Number.isInteger(value) ? value.toLocaleString() : value.toFixed(1)) : value;

      const badgeHtml = `<span class="provenance-chip ${status === 'BASELINE' ? 'status-baseline' : (status === 'STALE' ? 'status-stale' : 'status-live')}" title="Click to view ${agencyLabel} in Sensor Data Sources" onclick="event.stopPropagation(); window.Provenance.openSourceInPanel('${sourceId}')">
        <span class="prov-agency">${escapeHtml(agencyLabel)}</span>
        ${ageStr ? `<span class="prov-age">· ${escapeHtml(ageStr)}</span>` : ''}
      </span>`;

      el.innerHTML = `<span class="val-num">${escapeHtml(String(displayVal))}</span>${unit ? ` <span class="val-unit">${escapeHtml(unit)}</span>` : ''} ${badgeHtml}`;
    }
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

  window.Provenance = Provenance;
})(typeof window !== 'undefined' ? window : global);
