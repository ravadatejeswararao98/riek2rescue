// ================================================================
// WINDY-INTEGRATION.JS — Shared Windy.com Weather Radar Controller
// Used by both citizen.html and authority.html
// Uses iframe embed (embed.windy.com/embed2.html) — no API key needed
// ================================================================
class WindyIntegrationController {
  constructor(options = {}) {
    this.currentLat = options.lat || 16.99;
    this.currentLon = options.lon || 82.25;
    this.currentPlace = options.place || 'Kakinada, AP';
    this.activeMode = 'gis';
    this.timelineOffsetHours = 0;
    this._lastAutoHazard = null;

    this.mapId = options.mapId || (document.getElementById('authority-map') ? 'authority-map' : 'map');
    this.btnGis = document.getElementById('btn-mode-gis');

    this.init();
  }

  init() {
    // Mode toggle (Active GIS map)
    if (this.btnGis) {
      this.btnGis.addEventListener('click', () => this.setMode('gis'));
    }

    // Initial point forecast fetch
    this.fetchPointForecast(this.currentLat, this.currentLon);
  }

  setMode(mode) {
    this.activeMode = 'gis';
    if (this.btnGis) this.btnGis.classList.add('active');

    const mapEl = document.getElementById(this.mapId) || document.getElementById('authority-map') || document.getElementById('map');
    if (mapEl) mapEl.style.display = '';

    if (typeof showToast === 'function') {
      showToast('🗺️ GIS Risk Map: Active Hazard Corridors', 'info');
    }
  }

  setTimelineHourOffset(offsetHours) {
    this.timelineOffsetHours = Number(offsetHours) || 0;
    // 1. Instantly update weather readout from existing timeSeries (zero latency)
    if (this.lastForecastData) {
      this.applyTimelineWeather(this.timelineOffsetHours);
    }
    // 2. Fetch fresh point forecast for the target hour offset
    this.fetchPointForecast(this.currentLat, this.currentLon, this.timelineOffsetHours);
  }

  onLocationChanged(lat, lon, place) {
    this.currentLat = lat;
    this.currentLon = lon;
    if (place) this.currentPlace = place;
    if (typeof flyToCitizenMap === 'function') {
      flyToCitizenMap(lat, lon);
    } else if (window.authMapInstance && window.authMapInstance.flyToLocation) {
      window.authMapInstance.flyToLocation(lat, lon);
    }
    this.fetchPointForecast(lat, lon, this.timelineOffsetHours);
  }

  applyTimelineWeather(offsetHours = 0) {
    if (!this.lastForecastData) return;
    const data = this.lastForecastData;
    const s = data.summary || {};
    const ts = data.timeSeries;

    let temp = Math.round(s.currentTempC !== undefined ? s.currentTempC : 28);
    let wind = Math.round(s.currentWindKmh !== undefined ? s.currentWindKmh : 15);
    let gust = Math.round(s.maxGustKmh !== undefined ? s.maxGustKmh : wind * 1.5);
    let precip = s.maxPrecipPerHourMm || 0;
    let pressure = s.pressureHpa || 1008;
    let overallRisk = s.overallRisk || 'GREEN';

    if (offsetHours > 0 && ts && ts.timestamps && ts.timestamps.length) {
      const targetTime = Date.now() + (offsetHours * 3600 * 1000);
      let minDiff = Infinity;
      let idx = 0;
      for (let i = 0; i < ts.timestamps.length; i++) {
        const diff = Math.abs(ts.timestamps[i] - targetTime);
        if (diff < minDiff) {
          minDiff = diff;
          idx = i;
        }
      }

      if (ts.temp && ts.temp[idx] !== undefined) temp = Math.round(ts.temp[idx]);
      if (ts.windKmh && ts.windKmh[idx] !== undefined) wind = Math.round(ts.windKmh[idx]);
      if (ts.gustKmh && ts.gustKmh[idx] !== undefined) gust = Math.round(ts.gustKmh[idx]);
      else gust = Math.round(wind * 1.4);
      if (ts.precipMm && ts.precipMm[idx] !== undefined) precip = ts.precipMm[idx];
      if (ts.pressure && ts.pressure[idx] !== undefined) pressure = ts.pressure[idx];

      const isSevereWind = gust >= 65;
      const isExtremeRain = precip >= 15;
      if (isSevereWind || isExtremeRain || pressure <= 990) {
        overallRisk = 'RED';
      } else if (gust >= 45 || precip >= 7) {
        overallRisk = 'ORANGE';
      } else if (gust >= 28 || precip >= 2) {
        overallRisk = 'YELLOW';
      } else {
        overallRisk = 'GREEN';
      }
    }

    let icon = '🌤️';
    if (precip >= 10) icon = '⛈️';
    else if (precip > 0.5) icon = '🌧️';
    else if (gust >= 50) icon = '🌪️';
    else if (gust >= 35) icon = '💨';
    else if (temp >= 32) icon = '☀️';

    // Update Topbar Weather Pill
    const chipTemp = document.getElementById('chip-temp');
    const chipWind = document.getElementById('chip-wind');
    const chipIcon = document.getElementById('chip-icon');
    const chipRisk = document.getElementById('chip-risk');

    if (chipTemp) chipTemp.textContent = `${temp}°C`;
    if (chipWind) chipWind.textContent = `${wind} km/h`;
    if (chipIcon) chipIcon.textContent = icon;

    const isCitizenPortal = document.body && document.body.classList.contains('citizen-page');
    if (chipRisk && !isCitizenPortal) {
      chipRisk.className = 'windy-risk-chip';
      if (overallRisk === 'RED') {
        chipRisk.textContent = 'RED ZONE';
        chipRisk.classList.add('red');
      } else if (overallRisk === 'ORANGE') {
        chipRisk.textContent = 'HIGH RISK';
        chipRisk.classList.add('orange');
      } else if (overallRisk === 'YELLOW') {
        chipRisk.textContent = 'MODERATE';
        chipRisk.classList.add('yellow');
      } else {
        chipRisk.textContent = 'SAFE';
        chipRisk.classList.add('green');
      }
    }

    // Update Inspector dialog stats
    const inspWind = document.getElementById('insp-wind');
    const inspPressure = document.getElementById('insp-pressure');
    const inspRisk = document.getElementById('insp-risk');
    const inspSurge = document.getElementById('insp-surge');

    if (inspWind) inspWind.textContent = `${gust} km/h`;
    if (inspPressure) inspPressure.textContent = `${pressure} hPa`;
    if (inspRisk) {
      const tierNames = { RED: 'Active Hazard Zone', ORANGE: 'High Alert Zone', YELLOW: 'Moderate Risk Zone', GREEN: 'Safe Zone' };
      inspRisk.textContent = tierNames[overallRisk] || `${overallRisk} ZONE`;
      inspRisk.style.color = overallRisk === 'RED' ? '#ef4444' : overallRisk === 'ORANGE' ? '#f97316' : overallRisk === 'YELLOW' ? '#eab308' : '#22c55e';
    }
    if (inspSurge) {
      const estSurge = Math.max(0.8, (precip * 0.12 + (gust / 140) * 2.2)).toFixed(1);
      inspSurge.textContent = `${estSurge} meters`;
    }

    if (isCitizenPortal && typeof window.updateCitizenRiskBadge === 'function') {
      window.updateCitizenRiskBadge();
    }
  }

  async fetchPointForecast(lat, lon, offsetHours = null) {
    if (offsetHours !== null && typeof offsetHours === 'number') {
      this.timelineOffsetHours = offsetHours;
    }
    const chipSourceTag = document.getElementById('chip-source-tag');
    try {
      const resp = await fetch('/api/windy/point-forecast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lat: Number(lat),
          lon: Number(lon),
          model: 'ecmwf',
          hourOffset: this.timelineOffsetHours || 0
        })
      });

      if (!resp.ok) {
        if (chipSourceTag) {
          chipSourceTag.textContent = 'Data unavailable';
          chipSourceTag.title = 'Upstream meteorological API error';
          chipSourceTag.style.borderColor = 'rgba(239,68,68,0.4)';
          chipSourceTag.style.color = '#f87171';
        }
        return;
      }

      const data = await resp.json();
      if (!data || data.status === 'unavailable' || !data.summary) {
        if (chipSourceTag) {
          chipSourceTag.textContent = 'Data unavailable';
          chipSourceTag.title = data?.error || 'Meteorological stream offline';
          chipSourceTag.style.borderColor = 'rgba(239,68,68,0.4)';
          chipSourceTag.style.color = '#f87171';
        }
        return;
      }

      if (chipSourceTag) {
        const src = (data.source || '').toLowerCase();
        if (src.includes('open-meteo')) {
          chipSourceTag.textContent = 'Live: Open-Meteo';
          chipSourceTag.title = 'Authentic live weather observations via Open-Meteo ECMWF/GFS models';
          chipSourceTag.style.borderColor = 'rgba(56,189,248,0.4)';
          chipSourceTag.style.color = '#38bdf8';
        } else if (src.includes('windy')) {
          chipSourceTag.textContent = 'Live: Windy API';
          chipSourceTag.title = 'Windy Point Forecast API stream';
          chipSourceTag.style.borderColor = 'rgba(34,197,94,0.4)';
          chipSourceTag.style.color = '#22c55e';
        } else {
          chipSourceTag.textContent = 'Live API';
          chipSourceTag.title = data.source || 'Live sensor stream';
        }
      }

      this.lastForecastData = data;
      this.applyTimelineWeather(this.timelineOffsetHours);

      const s = data.summary;
      if (s.isSevereWind || s.isExtremeRain) {
        const banner = document.getElementById('citizen-emergency-banner');
        const bTitle = document.getElementById('cit-banner-title');
        const bMsg = document.getElementById('cit-banner-msg');
        if (banner && bTitle && bMsg) {
          bTitle.textContent = `Severe Meteorological Warning — ${this.currentPlace}`;
          bMsg.textContent = s.advisoryMessage;
          banner.style.display = 'block';
        }
      }

    } catch (err) {
      console.warn('Point Forecast fetch error:', err);
    }
  }
}

if (typeof window !== 'undefined') {
  window.WindyIntegrationController = WindyIntegrationController;
}
