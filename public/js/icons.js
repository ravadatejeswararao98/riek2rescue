/**
 * js/icons.js
 * Central Icon Registry and Helper for Risk2Rescue (R2R)
 * Uses Flaticon Uicons (Regular Rounded `fi-rr-*` and Bold Rounded `fi-br-*`).
 */

(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define([], factory);
  } else if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.R2R_ICONS = factory();
    root.ICONS = root.R2R_ICONS.ICONS;
    root.iconHtml = root.R2R_ICONS.iconHtml;
  }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const ICONS = {
    // Dock / Navigation
    nav: {
      home: 'fi-rr-home',
      command: 'fi-rr-settings-sliders',
      habitations: 'fi-rr-house-building',
      zoneManager: 'fi-rr-map',
      populationRisk: 'fi-rr-triangle-warning',
      reports: 'fi-rr-inbox-in',
      safesites: 'fi-rr-person-shelter',
      decisionSupport: 'fi-rr-robot',
      datasources: 'fi-rr-satellite-dish'
    },
    // Hazards (canonical lowercase hazard key)
    hazard: {
      cyclone: 'fi-rr-tornado',
      flood: 'fi-rr-water',
      landslide: 'fi-rr-mountains',
      earthquake: 'fi-rr-waveform-path',
      tsunami: 'fi-rr-wave',
      cloudburst: 'fi-rr-thunderstorm',
      coastal_erosion: 'fi-rr-island-tropical',
      storm: 'fi-rr-thunderstorm-risk',
      default: 'fi-rr-triangle-warning'
    },
    // Map Layers
    mapLayer: {
      standard: 'fi-rr-map',
      satellite: 'fi-rr-satellite',
      windy: 'fi-rr-wind',
      layers: 'fi-rr-layers'
    },
    // Weather Conditions
    weather: {
      clear: 'fi-rr-sun',
      clouds: 'fi-rr-clouds',
      rain: 'fi-rr-cloud-rain',
      drizzle: 'fi-rr-cloud-drizzle',
      squall: 'fi-rr-wind',
      storm: 'fi-rr-thunderstorm'
    },
    // Status & UI Actions
    ui: {
      search: 'fi-rr-search',
      filter: 'fi-rr-filter',
      refresh: 'fi-rr-refresh',
      close: 'fi-rr-cross-circle',
      check: 'fi-rr-check-circle',
      warning: 'fi-rr-triangle-warning',
      info: 'fi-rr-info',
      phone: 'fi-rr-phone-call',
      users: 'fi-rr-users',
      capacity: 'fi-rr-bed'
    }
  };

  /**
   * Generates HTML markup for an icon
   * @param {string} iconClass - e.g. 'fi-rr-home', or mapped key
   * @param {string} [extraClasses=''] - additional CSS classes
   * @param {string} [ariaLabel=''] - accessibility label (if empty, aria-hidden="true")
   * @returns {string} HTML string e.g. `<i class="fi fi-rr-home extra" aria-hidden="true"></i>`
   */
  function iconHtml(iconClass, extraClasses, ariaLabel) {
    if (!iconClass) return '';
    const cls = iconClass.startsWith('fi-') ? iconClass : ('fi-rr-' + iconClass);
    const classes = ['fi', cls, extraClasses].filter(Boolean).join(' ');
    if (ariaLabel) {
      return `<i class="${classes}" role="img" aria-label="${ariaLabel}"></i>`;
    }
    return `<i class="${classes}" aria-hidden="true"></i>`;
  }

  return {
    ICONS,
    iconHtml
  };
}));
