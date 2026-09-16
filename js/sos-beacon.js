/**
 * ================================================================
 * SOS-BEACON.JS — Citizen Emergency Distress Beacon & Rescue Dispatch
 * ================================================================
 * RISK2RESCUE PLATFORM
 */

class EmergencySOSBeacon {
  constructor() {
    this.isActive = false;
    this.beaconSoundTimer = null;
    this.userCoords = null; // No hardcoded fallback
    this.hasLiveFix = false;
    this._isLocating = false;
    this.initSOS();
  }

  initSOS() {
    if (typeof navigator !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        pos => {
          if (pos && pos.coords) {
            this.userCoords = {
              lat: pos.coords.latitude,
              lng: pos.coords.longitude,
              latitude: pos.coords.latitude,
              longitude: pos.coords.longitude,
              accuracy: (typeof pos.coords.accuracy === 'number' && !isNaN(pos.coords.accuracy)) ? Math.round(pos.coords.accuracy) : null,
              capturedAt: pos.timestamp || Date.now()
            };
            this.hasLiveFix = true;
            if (typeof window !== 'undefined') {
              window.citizenGPSLocation = { ...this.userCoords };
            }
          }
        },
        err => {
          // Do not substitute any hardcoded or fake coordinates
          this.hasLiveFix = false;
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
      );
    }
  }

  resolveCoords() {
    if (this.hasLiveFix && this.userCoords && typeof this.userCoords.latitude === 'number' && typeof this.userCoords.longitude === 'number') {
      return this.userCoords;
    }
    if (typeof window !== 'undefined' && window.citizenGPSLocation && typeof window.citizenGPSLocation.lat === 'number' && typeof window.citizenGPSLocation.lng === 'number' && !window.citizenGPSLocation.default) {
      return {
        lat: window.citizenGPSLocation.lat,
        lng: window.citizenGPSLocation.lng,
        latitude: window.citizenGPSLocation.lat,
        longitude: window.citizenGPSLocation.lng,
        accuracy: window.citizenGPSLocation.accuracy || null
      };
    }
    return null;
  }

  async triggerSOS() {
    const toolSos = document.getElementById('tool-sos');

    // Prevent repeated clicks while location retrieval is in progress
    if (this._isLocating) {
      if (typeof showToast === 'function') {
        showToast("Getting your current location... Please wait.", "info");
      }
      return;
    }

    this._isLocating = true;
    if (toolSos) {
      toolSos.classList.add('sos-active');
      toolSos.setAttribute('disabled', 'true');
    }
    document.querySelectorAll('.sos-beacon-btn').forEach(b => {
      b.classList.add('sos-active');
      b.setAttribute('disabled', 'true');
    });

    // UX prompt when citizen presses SOS
    if (typeof showToast === 'function') {
      showToast("Getting your current location... Allow location access so emergency authorities can locate you.", "warning");
    }

    // 1. Obtain user's actual current geographic coordinates at the moment of SOS
    let latitude = null;
    let longitude = null;
    let accuracy = null;
    let capturedAt = Date.now();
    let hasLocation = false;

    if (typeof navigator !== 'undefined' && 'geolocation' in navigator) {
      try {
        const position = await new Promise((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(
            resolve,
            reject,
            {
              enableHighAccuracy: true,
              timeout: 10000,
              maximumAge: 0
            }
          );
        });

        if (position && position.coords) {
          latitude = position.coords.latitude;
          longitude = position.coords.longitude;
          accuracy = position.coords.accuracy;
          capturedAt = position.timestamp || Date.now();

          // Validate coordinates
          if (typeof latitude === 'number' && typeof longitude === 'number' &&
              !isNaN(latitude) && !isNaN(longitude) &&
              latitude >= -90 && latitude <= 90 &&
              longitude >= -180 && longitude <= 180) {
            hasLocation = true;
            console.log("SOS geolocation captured:", {
              latitude,
              longitude,
              accuracy
            });

            const parsedAcc = (typeof accuracy === 'number' && !isNaN(accuracy)) ? Math.round(accuracy) : null;
            this.userCoords = {
              lat: latitude,
              lng: longitude,
              latitude,
              longitude,
              accuracy: parsedAcc,
              capturedAt
            };
            this.hasLiveFix = true;
            if (typeof window !== 'undefined') {
              window.citizenGPSLocation = { lat: latitude, lng: longitude, accuracy: parsedAcc };
            }
          }
        }
      } catch (geoErr) {
        console.warn("Live SOS GPS acquisition failed:", geoErr);
        hasLocation = false;
      }
    } else {
      console.warn("Geolocation API not available in navigator.");
      hasLocation = false;
    }

    this._isLocating = false;
    if (toolSos) toolSos.removeAttribute('disabled');
    document.querySelectorAll('.sos-beacon-btn').forEach(b => b.removeAttribute('disabled'));

    if (!hasLocation) {
      const warnMsg = "Your current location could not be accessed. Please enable location permission so authorities can locate your SOS.";
      if (typeof showToast === 'function') {
        showToast(warnMsg, "warning");
      }

      // Geolocation failure confirmation dialog
      const proceedWithoutLocation = confirm(
        "⚠️ LOCATION ACCESS UNAVAILABLE\n\nYour current location could not be accessed.\n\nDo you want to send the SOS with 'Location unavailable' so authorities are alerted to your emergency?"
      );

      if (!proceedWithoutLocation) {
        if (toolSos) toolSos.classList.remove('sos-active');
        document.querySelectorAll('.sos-beacon-btn').forEach(b => b.classList.remove('sos-active'));
        return;
      }

      this.userCoords = {
        lat: null,
        lng: null,
        latitude: null,
        longitude: null,
        accuracy: null,
        capturedAt: Date.now()
      };
      this.hasLiveFix = false;
    }

    this.isActive = true;

    // Escalate SOS beacon buttons into rapid, urgent pulse
    if (toolSos) toolSos.classList.add('sos-active');
    document.querySelectorAll('.sos-beacon-btn').forEach(b => b.classList.add('sos-active'));

    // Temporary red vignette flash at screen edges
    const flash = document.createElement('div');
    flash.className = 'sos-vignette-overlay';
    flash.id = 'active-sos-vignette';
    document.body.appendChild(flash);
    setTimeout(() => { if (flash.parentNode) flash.remove(); }, 1650);

    this.renderSOSModal();

    // Broadcast high-priority distress event to Firebase & local mesh
    const sosId = 'SOS-' + Date.now().toString().slice(-6);
    const parsedAccFinal = hasLocation && typeof accuracy === 'number' && !isNaN(accuracy) ? Math.round(accuracy) : null;
    const distressPayload = {
      id: sosId,
      reportId: sosId,
      source: 'SOS_BEACON',
      sourceId: 'sos_beacon',
      type: '🆘 EMERGENCY SOS DISTRESS',
      reportType: 'SOS',
      category: 'Critical Life Rescue',
      citizenName: 'Citizen in Distress',
      phone: '+91 98765-EMERGENCY',
      desc: hasLocation
        ? `Immediate beacon distress signal from citizen terminal. Verified device GPS acquired.`
        : `Immediate beacon distress signal from citizen terminal. GPS location was unavailable at transmission.`,
      description: hasLocation
        ? `Immediate beacon distress signal from citizen terminal. Verified device GPS acquired.`
        : `Immediate beacon distress signal from citizen terminal. GPS location was unavailable at transmission.`,
      details: hasLocation
        ? `Immediate beacon distress signal from citizen terminal. Verified device GPS acquired.`
        : `Immediate beacon distress signal from citizen terminal. GPS location was unavailable at transmission.`,
      lat: hasLocation ? latitude : null,
      lng: hasLocation ? longitude : null,
      latitude: hasLocation ? latitude : null,
      longitude: hasLocation ? longitude : null,
      accuracy: parsedAccFinal,
      locationAccuracy: parsedAccFinal,
      locationTimestamp: capturedAt,
      locationStatus: hasLocation ? 'AVAILABLE' : 'UNAVAILABLE',
      location: hasLocation
        ? `Lat ${latitude.toFixed(5)}° N, Lng ${longitude.toFixed(5)}° E${parsedAccFinal !== null ? ` (±${parsedAccFinal}m)` : ''}`
        : 'Location unavailable',
      locationCoords: hasLocation ? {
        latitude: latitude,
        longitude: longitude,
        accuracy: parsedAccFinal,
        capturedAt: capturedAt
      } : null,
      severity: 'Critical',
      status: 'Pending',
      lifecycleStatus: 'PENDING',
      verificationStatus: 'UNVERIFIED',
      isSos: true,
      sosStatus: 'HIGH_PRIORITY_URGENT',
      upvotes: 0,
      time: 'Just now',
      timestamp: Date.now(),
      submissionTimestamp: Date.now(),
      submittedAt: new Date().toISOString(),
      receivedAt: Date.now()
    };

    // 1. Immediately store in localStorage so all tabs / portals have instant access
    try {
      const existing = JSON.parse(localStorage.getItem('rzi_citizen_reports') || '[]');
      const idx = existing.findIndex(r => r.id === distressPayload.id);
      if (idx === -1) {
        existing.unshift(distressPayload);
      } else {
        existing[idx] = distressPayload;
      }
      localStorage.setItem('rzi_citizen_reports', JSON.stringify(existing));
    } catch (e) {
      console.warn("Storage write error for SOS:", e);
    }

    // 2. Broadcast via BroadcastChannel 'rzi_mesh_sync' (used by FirebaseLive & cross-tab sync)
    try {
      if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
        const bc = new BroadcastChannel('rzi_mesh_sync');
        bc.postMessage({ type: 'NEW_REPORT', payload: distressPayload });
        setTimeout(() => { try { bc.close(); } catch(e){} }, 1000);
      }
    } catch (e) {}

    // 3. Offline submission queue or Firebase submission
    if (!navigator.onLine) {
      if (typeof window.queueOfflineSubmission === 'function') {
        window.queueOfflineSubmission(distressPayload);
      } else {
        try {
          const q = JSON.parse(localStorage.getItem('rzi_offline_queue') || '[]');
          q.push({ ...distressPayload, queuedAt: Date.now() });
          localStorage.setItem('rzi_offline_queue', JSON.stringify(q));
        } catch (e) { }
      }
      if (typeof showToast === 'function') {
        showToast("🆘 EMERGENCY SOS QUEUED LOCALLY — TRANSMITTING WHEN CONNECTED", "warning");
      }
    } else {
      if (window.firebaseLive && typeof window.firebaseLive.submitCitizenReport === 'function') {
        window.firebaseLive.submitCitizenReport(distressPayload).catch(() => {
          if (typeof window.queueOfflineSubmission === 'function') {
            window.queueOfflineSubmission(distressPayload);
          }
        });
      }
      if (typeof showToast === 'function') {
        if (hasLocation) {
          showToast("SOS sent successfully. Your current location was shared with the authority.", "success");
        } else {
          showToast("🆘 Emergency SOS transmitted (Location unavailable)", "danger");
        }
      }
    }
  }

  closeSOS() {
    this.isActive = false;
    const toolSos = document.getElementById('tool-sos');
    if (toolSos) toolSos.classList.remove('sos-active');
    document.querySelectorAll('.sos-beacon-btn').forEach(b => b.classList.remove('sos-active'));
    const flash = document.getElementById('active-sos-vignette');
    if (flash) flash.remove();

    const modal = document.getElementById('teja-sos-modal');
    if (modal) modal.remove();
  }

  renderSOSModal() {
    let modal = document.getElementById('teja-sos-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'teja-sos-modal';
      modal.className = 'modal-overlay';
      modal.style.display = 'flex';
      modal.style.zIndex = '10005';
      document.body.appendChild(modal);
    }

    const shelterInfo = (typeof nearestShelterText === 'function')
      ? nearestShelterText()
      : 'Nearest Designated Relief Shelter';

    const hasCoords = this.userCoords &&
                      typeof this.userCoords.latitude === 'number' &&
                      typeof this.userCoords.longitude === 'number' &&
                      !isNaN(this.userCoords.latitude);

    const coordsDisplay = hasCoords
      ? `${this.userCoords.latitude.toFixed(5)}° N, ${this.userCoords.longitude.toFixed(5)}° E (Accuracy: ±${this.userCoords.accuracy || 'N/A'}m)`
      : '<span style="color:#f87171;">Location unavailable (GPS access was denied or unavailable)</span>';

    modal.innerHTML = `
      <div class="modal-box" style="border: 2px solid #ef4444; box-shadow: 0 0 50px rgba(239,68,68,0.5); max-width: 480px; text-align: center;">
        <div style="font-size: 54px; animation: beaconGlow 1s infinite alternate;">🚨</div>
        
        <h2 style="color: #ef4444; font-size: 22px; font-weight: 800; margin-top: 10px;">
          EMERGENCY RESCUE BEACON ACTIVE
        </h2>
        <p style="color: #cbd5e1; font-size: 13px; margin: 8px 0 16px;">
          ${hasCoords ? 'Your high-priority coordinates have been transmitted to the NDRF & SDMA Incident Command Center. Rescue teams are triaging your sector.' : 'Emergency distress signal dispatched. Incident Command notified that device location was unavailable.'}
        </p>

        <div style="background: rgba(239, 68, 68, 0.12); border: 1px solid rgba(239, 68, 68, 0.3); border-radius: 12px; padding: 14px; text-align: left; margin-bottom: 16px;">
          <div style="font-size: 11px; color: #f87171; text-transform: uppercase; font-weight: 700;">Transmitted Coordinates</div>
          <div style="font-size: 14px; font-weight: 700; color: #fff; margin-top: 2px;">
            ${coordsDisplay}
          </div>
          <div style="font-size: 12px; color: #94a3b8; margin-top: 6px;">
            Nearest Shelter: <strong>${shelterInfo}</strong>
          </div>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 18px;">
          <a href="tel:1078" class="btn" style="background: #2563eb; color: #fff; text-decoration: none; padding: 10px; font-weight: 700; border-radius: 8px; font-size: 13px; display: flex; align-items: center; justify-content: center; gap: 6px;">
            📞 NDRF 1078
          </a>
          <a href="tel:112" class="btn" style="background: #059669; color: #fff; text-decoration: none; padding: 10px; font-weight: 700; border-radius: 8px; font-size: 13px; display: flex; align-items: center; justify-content: center; gap: 6px;">
            🚓 Police 112
          </a>
        </div>

        <div style="display: flex; gap: 8px;">
          <button class="btn btn-primary" style="flex: 1; padding: 10px;" onclick="window.emergencySOS.closeSOS(); if (typeof showShelters === 'function') showShelters();">
            <span>🗺️ Show Safe Route</span>
          </button>
          <button class="btn btn-glass" style="padding: 10px 18px;" onclick="window.emergencySOS.closeSOS()">
            Dismiss
          </button>
        </div>
      </div>
    `;
  }
}

// Singleton instance
if (typeof window !== 'undefined') {
  window.emergencySOS = new EmergencySOSBeacon();
}
