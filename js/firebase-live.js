// ================================================================
// FIREBASE-LIVE.JS — Live Realtime Database & Multi-device Mesh Sync
// ================================================================

class FirebaseLiveService {
  constructor() {
    this.db = null;
    this.isCloudConnected = false;
    this.connectionMode = 'initializing'; // 'cloud', 'mesh', 'offline'
    this.meshChannel = null;
    this.reportListeners = [];
    this.alertListeners = [];
    this.statusListeners = [];

    // Local cached state (pre-populated from APP_DATA when available)
    this.reports = [];
    this.alerts = [];

    this.initMeshChannel();
    this.initFirebase();
  }

  // ---- Cross-tab BroadcastChannel & Local Storage Sync ----
  initMeshChannel() {
    try {
      if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
        this.meshChannel = new BroadcastChannel('rzi_mesh_sync');
        this.meshChannel.onmessage = (event) => {
          this.handleMeshMessage(event.data);
        };
      }
    } catch (e) {
      console.warn('BroadcastChannel not supported:', e);
    }

    // Load initial offline/mesh reports and alerts from localStorage if present
    try {
      const storedReports = localStorage.getItem('rzi_synced_reports');
      if (storedReports) {
        this.reports = JSON.parse(storedReports);
      } else if (typeof APP_DATA !== 'undefined' && APP_DATA.citizenReports) {
        this.reports = JSON.parse(JSON.stringify(APP_DATA.citizenReports));
      }

      const storedAlerts = localStorage.getItem('rzi_synced_alerts');
      if (storedAlerts) {
        this.alerts = JSON.parse(storedAlerts);
      } else if (typeof APP_DATA !== 'undefined' && APP_DATA.alerts) {
        this.alerts = JSON.parse(JSON.stringify(APP_DATA.alerts));
      }
    } catch (e) {
      console.warn('Error loading cached disaster data:', e);
    }
  }

  ensureInitialData() {
    try {
      if (this.reports.length === 0) {
        const stored = localStorage.getItem('rzi_synced_reports');
        if (stored) {
          this.reports = JSON.parse(stored);
        }
      }
      if (typeof APP_DATA !== 'undefined' && APP_DATA.citizenReports) {
        APP_DATA.citizenReports.forEach(defRep => {
          if (!this.reports.some(r => r.id === defRep.id)) {
            this.reports.push(JSON.parse(JSON.stringify(defRep)));
          }
        });
      }

      if (this.alerts.length === 0) {
        const storedAlerts = localStorage.getItem('rzi_synced_alerts');
        if (storedAlerts) {
          this.alerts = JSON.parse(storedAlerts);
        }
      }
      if (typeof APP_DATA !== 'undefined' && APP_DATA.alerts) {
        APP_DATA.alerts.forEach(defAlt => {
          if (!this.alerts.some(a => a.id === defAlt.id)) {
            this.alerts.push(JSON.parse(JSON.stringify(defAlt)));
          }
        });
      }
    } catch (e) { }
  }

  handleMeshMessage(data) {
    this.ensureInitialData();
    if (!data || !data.type) return;

    if (data.type === 'NEW_REPORT') {
      const exists = this.reports.some(r => r.id === data.payload.id);
      if (!exists) {
        this.reports.unshift(data.payload);
        this.persistLocalCache();
        this.notifyReportListeners(this.reports, { added: data.payload });
      }
    } else if (data.type === 'UPDATE_REPORT') {
      const idx = this.reports.findIndex(r => r.id === data.payload.id);
      if (idx !== -1) {
        this.reports[idx] = { ...this.reports[idx], ...data.payload };
        this.persistLocalCache();
        this.notifyReportListeners(this.reports, { updated: data.payload });
      }
    } else if (data.type === 'NEW_ALERT') {
      const exists = this.alerts.some(a => a.id === data.payload.id);
      if (!exists) {
        this.alerts.unshift(data.payload);
        this.persistLocalCache();
        this.notifyAlertListeners(this.alerts, { added: data.payload });
      }
    } else if (data.type === 'REMOVE_ZONE') {
      if (typeof window !== 'undefined') {
        this.forceRemoveZoneFromMemory(data.payload.zoneId);
        this.redrawAllMaps();
        if (typeof renderZoneManager === 'function') {
          renderZoneManager();
        }
      }
    } else if (data.type === 'NEW_ZONE') {
      if (typeof window !== 'undefined') {
        this.forceAddZoneToMemory(data.payload);
        this.redrawAllMaps();
        if (typeof renderZoneManager === 'function') {
          renderZoneManager();
        }
      }
    }
  }

  forceRemoveZoneFromMemory(zoneId) {
    if (typeof window === 'undefined') return;
    if (window.APP_DATA && window.APP_DATA.riskZones) {
      window.APP_DATA.riskZones = window.APP_DATA.riskZones.filter(z => z.id !== zoneId);
    }
    if (window.HAZARD_INTEL) {
      Object.keys(window.HAZARD_INTEL).forEach(key => {
        if (window.HAZARD_INTEL[key].zones) {
          window.HAZARD_INTEL[key].zones = window.HAZARD_INTEL[key].zones.filter(z => z.id !== zoneId);
        }
      });
    }
    if (window.hazardEngine && window.hazardEngine.aiState) {
      if (window.hazardEngine.aiState.allZones) {
        window.hazardEngine.aiState.allZones = window.hazardEngine.aiState.allZones.filter(z => z.id !== zoneId);
      }
      if (window.hazardEngine.aiState.zonesByHazard) {
        Object.keys(window.hazardEngine.aiState.zonesByHazard).forEach(key => {
          window.hazardEngine.aiState.zonesByHazard[key] = window.hazardEngine.aiState.zonesByHazard[key].filter(z => z.id !== zoneId);
        });
      }
    }
  }

  forceAddZoneToMemory(zone) {
    if (typeof window === 'undefined') return;
    if (window.APP_DATA && window.APP_DATA.riskZones) {
      const exists = window.APP_DATA.riskZones.some(z => z.id === zone.id);
      if (!exists) window.APP_DATA.riskZones.push(zone);
    }
    if (window.HAZARD_INTEL) {
      const normHazard = zone.hazardType || 'cyclone';
      if (window.HAZARD_INTEL[normHazard] && window.HAZARD_INTEL[normHazard].zones) {
        const exists = window.HAZARD_INTEL[normHazard].zones.some(z => z.id === zone.id);
        if (!exists) window.HAZARD_INTEL[normHazard].zones.push(zone);
      }
    }
  }

  redrawAllMaps() {
    if (typeof window === 'undefined') return;
    if (window.mapApp && typeof window.mapApp.drawRiskZones === 'function') window.mapApp.drawRiskZones();
    if (window.authMapInstance && typeof window.authMapInstance.drawRiskZones === 'function') window.authMapInstance.drawRiskZones();
    if (window.disasterMap && typeof window.disasterMap.drawRiskZones === 'function') window.disasterMap.drawRiskZones();
    if (window.hazardEngine) {
      const activeKey = window.hazardEngine.activeKey || 'cyclone';
      window.hazardEngine.invalidateCache(activeKey);
      window.hazardEngine.render(activeKey, true);
    }
  }

  // ---- Firebase Cloud Firestore Initialization ----
  initFirebase() {
    const config = getFirebaseConfig();

    if (typeof firebase === 'undefined') {
      console.warn('Firebase SDK not loaded, falling back to Realtime Mesh Channel.');
      this.setConnectionStatus('mesh', 'Local Realtime Mesh Active');
      return;
    }

    try {
      // Check if default app is already initialized
      let app;
      if (!firebase.apps.length) {
        app = firebase.initializeApp(config);
      } else {
        app = firebase.app();
      }

      this.db = firebase.firestore();

      // Enable offline persistence in Firestore if possible
      try {
        this.db.enablePersistence({ synchronizeTabs: true }).catch((err) => {
          if (err.code !== 'failed-precondition' && err.code !== 'unimplemented') {
            console.warn('Firestore persistence warning:', err);
          }
        });
      } catch (err) {
        // ignore multiple tab error
      }

      // Attach real-time cloud listeners
      this.attachCloudListeners(config);
    } catch (error) {
      console.warn('Firebase initialization notice:', error.message);
      this.setConnectionStatus('mesh', 'Local Mesh Active (Add Firebase Keys)');
    }
  }

  attachCloudListeners(config) {
    if (!this.db) return;

    // Listen to Citizen Reports collection
    this.db.collection('citizen_reports')
      .orderBy('timestamp', 'desc')
      .limit(50)
      .onSnapshot((snapshot) => {
        const fromServer = snapshot.metadata && !snapshot.metadata.fromCache;
        if (fromServer) {
          this.isCloudConnected = true;
          this.setConnectionStatus('cloud', `Live Cloud Firestore (${config.projectId})`);
        } else if (!this.isCloudConnected) {
          this.setConnectionStatus('mesh', 'Local Mesh Active');
        }

        if (!snapshot.empty) {
          const cloudReports = [];
          snapshot.forEach(doc => {
            const data = doc.data();
            cloudReports.push({ id: doc.id, ...data });
          });
          this.reports = cloudReports;
          this.persistLocalCache();
          this.notifyReportListeners(this.reports);
        } else {
          // If collection is empty and custom config is active, seed once
          if (config.isCustom && this.reports.length > 0 && fromServer) {
            this.seedCloudReports();
          }
        }
      }, (error) => {
        console.warn('Firestore reports listener notice (using mesh sync):', error.message);
        this.isCloudConnected = false;
        this.setConnectionStatus('mesh', 'Local Mesh Active');
      });

    // Listen to Emergency Alerts collection
    this.db.collection('emergency_alerts')
      .orderBy('timestamp', 'desc')
      .limit(30)
      .onSnapshot((snapshot) => {
        const fromServer = snapshot.metadata && !snapshot.metadata.fromCache;
        if (fromServer) {
          this.isCloudConnected = true;
          this.setConnectionStatus('cloud', `Live Cloud Firestore (${config.projectId})`);
        }

        if (!snapshot.empty) {
          const cloudAlerts = [];
          snapshot.forEach(doc => {
            const data = doc.data();
            cloudAlerts.push({ id: doc.id, ...data });
          });
          this.alerts = cloudAlerts;
          this.persistLocalCache();
          this.notifyAlertListeners(this.alerts);
        }
      }, (error) => {
        console.warn('Firestore alerts listener notice:', error.message);
        this.isCloudConnected = false;
        this.setConnectionStatus('mesh', 'Local Mesh Active');
      });

    // Listen to Risk Zones collection
    this.db.collection('risk_zones')
      .onSnapshot((snapshot) => {
        if (!snapshot.empty) {
          const cloudZones = [];
          snapshot.forEach(doc => {
            cloudZones.push({ id: doc.id, ...doc.data() });
          });
          
          if (typeof window !== 'undefined' && window.APP_DATA) {
            window.APP_DATA.riskZones = cloudZones;
            
            // Reconcile with HAZARD_INTEL by replacing all existing zones with cloud zones
            if (window.HAZARD_INTEL) {
              Object.keys(window.HAZARD_INTEL).forEach(key => {
                if (window.HAZARD_INTEL[key].zones) {
                  // Only keep zones that are actually in cloudZones
                  window.HAZARD_INTEL[key].zones = window.HAZARD_INTEL[key].zones.filter(hz => cloudZones.some(cz => cz.id === hz.id));
                }
              });
              cloudZones.forEach(zone => {
                 const nh = zone.hazardType || 'cyclone';
                 if (window.HAZARD_INTEL[nh] && window.HAZARD_INTEL[nh].zones) {
                    if (!window.HAZARD_INTEL[nh].zones.some(z => z.id === zone.id)) {
                      window.HAZARD_INTEL[nh].zones.push(zone);
                    }
                 }
              });
            }

            this.redrawAllMaps();
            
            // Re-render Zone Manager UI
            if (typeof renderZoneManager === 'function') {
              renderZoneManager();
            }
          }
        } else {
          // If the cloud collection is explicitly empty, we should wipe local zones (after seeding if necessary)
          const fromServer = snapshot.metadata && !snapshot.metadata.fromCache;
          if (fromServer && !config.isCustom) {
            if (typeof window !== 'undefined' && window.APP_DATA) {
               window.APP_DATA.riskZones = [];
               this.redrawAllMaps();
               if (typeof renderZoneManager === 'function') {
                 renderZoneManager();
               }
            }
          }
        }
      }, (error) => {
        console.warn('Firestore risk_zones listener notice:', error.message);
      });

    // Active server ping probe to verify whether backend Firestore is genuinely reachable
    this.checkCloudConnectivity();
  }

  /**
   * Directly probes Cloud Firestore server endpoint to verify genuine connectivity
   */
  async checkCloudConnectivity() {
    if (!this.db) {
      this.isCloudConnected = false;
      this.setConnectionStatus('mesh', 'Local Mesh Active');
      return false;
    }
    try {
      await this.db.collection('citizen_reports').limit(1).get({ source: 'server' });
      this.isCloudConnected = true;
      this.setConnectionStatus('cloud', 'Live Cloud Firestore Connected');
      return true;
    } catch (e) {
      this.isCloudConnected = false;
      this.setConnectionStatus('mesh', 'Local Mesh Active');
      return false;
    }
  }

  setConnectionStatus(mode, label) {
    this.connectionMode = mode;
    this.statusListeners.forEach(fn => {
      try { fn(mode, label); } catch (e) { }
    });
    this.updateDOMIndicator();
  }

  updateDOMIndicator() {
    if (typeof document === 'undefined') return;
    // Citizens operate silently without raw sync-state jargon
    if (document.body && document.body.classList.contains('citizen-page')) return;

    const indicators = document.querySelectorAll('#sync-status-indicator, .sync-status-indicator');
    indicators.forEach(el => {
      const isSynced = this.isCloudConnected;
      el.className = `sync-status-indicator ${isSynced ? 'synced' : 'offline'}`;
      el.title = isSynced
        ? '🟢 Live Cloud Firestore Connected & Synchronized'
        : '⚪ Operating in offline local storage / mesh fallback mode';
      el.innerHTML = `
        <span class="sync-dot"></span>
        <span class="sync-text">${isSynced ? '🟢 Synced' : '⚪ Offline (local only)'}</span>
      `;
    });
  }

  persistLocalCache() {
    try {
      localStorage.setItem('rzi_synced_reports', JSON.stringify(this.reports));
      localStorage.setItem('rzi_synced_alerts', JSON.stringify(this.alerts));
    } catch (e) { }
  }

  // ---- Public Event Subscription Methods ----
  onReports(callback) {
    this.ensureInitialData();
    this.reportListeners.push(callback);
    // Trigger immediately with current state
    if (this.reports.length > 0) {
      callback(this.reports);
    }
  }

  onAlerts(callback) {
    this.ensureInitialData();
    this.alertListeners.push(callback);
    if (this.alerts.length > 0) {
      callback(this.alerts);
    }
  }

  onStatus(callback) {
    this.statusListeners.push(callback);
    callback(this.connectionMode, this.isCloudConnected ? 'Live Cloud Firestore Connected' : 'Local Realtime Mesh Active');
  }

  notifyReportListeners(reports, meta) {
    this.reportListeners.forEach(fn => {
      try { fn(reports, meta); } catch (e) { console.error('Error in report listener:', e); }
    });
  }

  notifyAlertListeners(alerts, meta) {
    this.alertListeners.forEach(fn => {
      try { fn(alerts, meta); } catch (e) { console.error('Error in alert listener:', e); }
    });
  }

  // ---- Write Operations (Citizen & Authority) ----

  /**
   * Submit a new citizen incident report (e.g. from citizen.html)
   */
  async submitCitizenReport(reportData) {
    this.ensureInitialData();
    const id = reportData.id || ('REP-' + Date.now().toString().slice(-6));

    // Validate coordinates: latitude >= -90 && latitude <= 90, longitude >= -180 && longitude <= 180
    const rawLat = reportData.latitude ?? reportData.lat ?? reportData.locationCoords?.latitude;
    const rawLng = reportData.longitude ?? reportData.lng ?? reportData.locationCoords?.longitude;
    const isCoordValid = (
      rawLat !== null && rawLat !== undefined &&
      rawLng !== null && rawLng !== undefined &&
      !isNaN(Number(rawLat)) && !isNaN(Number(rawLng)) &&
      Number(rawLat) >= -90 && Number(rawLat) <= 90 &&
      Number(rawLng) >= -180 && Number(rawLng) <= 180
    );

    const lat = isCoordValid ? Number(rawLat) : null;
    const lng = isCoordValid ? Number(rawLng) : null;
    const accuracy = reportData.locationAccuracy ?? reportData.accuracy ?? reportData.locationCoords?.accuracy ?? null;
    const locStatus = isCoordValid ? (reportData.locationStatus || 'available') : 'unavailable';
    const locString = reportData.location || (isCoordValid ? `Lat ${lat.toFixed(5)}° N, Lng ${lng.toFixed(5)}° E` : 'Location unavailable');

    const fullReport = {
      id,
      type: reportData.type || 'Flood',
      severity: reportData.severity || 'High',
      status: reportData.status || 'Pending',
      desc: reportData.desc || reportData.details || '',
      category: reportData.category || 'Citizen Field Report',
      reporter: reportData.reporter || reportData.citizenName || 'Citizen Reporter',
      phone: reportData.phone || '+91-Verified',
      location: locString,
      lat: lat,
      lng: lng,
      latitude: lat,
      longitude: lng,
      locationAccuracy: accuracy ? Math.round(accuracy) : null,
      locationTimestamp: reportData.locationTimestamp || Date.now(),
      locationStatus: locStatus,
      locationCoords: isCoordValid ? {
        latitude: lat,
        longitude: lng,
        accuracy: accuracy ? Math.round(accuracy) : null,
        capturedAt: reportData.locationTimestamp || Date.now()
      } : null,
      time: 'Just now',
      timestamp: Date.now(),
      upvotes: 1
    };

    // 1. Update local cache & broadcast via mesh
    this.reports.unshift(fullReport);
    this.persistLocalCache();
    this.notifyReportListeners(this.reports, { added: fullReport });

    if (this.meshChannel) {
      this.meshChannel.postMessage({ type: 'NEW_REPORT', payload: fullReport });
    }

    // 2. Write to Firebase Cloud Firestore in background if available
    if (this.db) {
      this.db.collection('citizen_reports').doc(id).set(fullReport).catch(err => {
        console.warn('Saved report to mesh sync (Firestore cloud write pending):', err.message);
      });
    }

    return fullReport;
  }

  /**
   * Authority verifies a report
   */
  async verifyReport(reportId, officerNotes = '') {
    const report = this.reports.find(r => r.id === reportId);
    if (!report) return null;

    const updates = {
      id: reportId,
      status: 'Verified',
      officerNotes: officerNotes || 'Confirmed via GIS telemetry and Sentinel-2 satellite anomaly.',
      verifiedAt: new Date().toLocaleTimeString(),
      verifiedTimestamp: Date.now()
    };

    Object.assign(report, updates);
    this.persistLocalCache();
    this.notifyReportListeners(this.reports, { updated: report });

    if (this.meshChannel) {
      this.meshChannel.postMessage({ type: 'UPDATE_REPORT', payload: updates });
    }

    // Write to Firestore in background
    if (this.db) {
      this.db.collection('citizen_reports').doc(reportId).set(updates, { merge: true }).catch(err => {
        console.warn('Firestore report verify update notice:', err.message);
      });
    }

    // Automatically generate and broadcast regional emergency alert
    const newAlert = {
      id: 'ALT-' + Date.now().toString().slice(-4),
      level: report.severity === 'Critical' ? 'CRITICAL' : 'HIGH',
      type: report.type,
      title: `VERIFIED CITIZEN ALERT: ${report.type} at ${report.desc.slice(0, 30)}...`,
      message: `${report.desc} — Verified by Authority Incident Response Commander.`,
      time: 'Just now',
      timestamp: Date.now(),
      area: `Vicinity coordinates [${report.lat.toFixed(2)}, ${report.lng.toFixed(2)}]`,
      confidence: 96,
      sources: ['Citizen Verified', 'NDRF Dispatch', 'Satellite Radar Cross-check'],
      active: true
    };

    await this.broadcastEmergencyAlert(newAlert);
    return report;
  }

  /**
   * Authority rejects/dismisses a report
   */
  async rejectReport(reportId, reason = '') {
    const report = this.reports.find(r => r.id === reportId);
    if (!report) return null;

    const updates = {
      id: reportId,
      status: 'Rejected',
      rejectionReason: reason || 'Unsubstantiated condition; dismissed after drone inspection.',
      dismissedAt: new Date().toLocaleTimeString()
    };

    Object.assign(report, updates);
    this.persistLocalCache();
    this.notifyReportListeners(this.reports, { updated: report });

    if (this.meshChannel) {
      this.meshChannel.postMessage({ type: 'UPDATE_REPORT', payload: updates });
    }

    if (this.db) {
      this.db.collection('citizen_reports').doc(reportId).set(updates, { merge: true }).catch(err => {
        console.warn('Firestore reject update notice:', err.message);
      });
    }

    return report;
  }

  /**
   * Push a regional Emergency Alert (triggers instant warning across citizen devices)
   */
  async broadcastEmergencyAlert(alertData) {
    const alertId = alertData.id || ('ALT-' + Date.now().toString().slice(-4));
    const fullAlert = {
      id: alertId,
      level: alertData.level || 'CRITICAL',
      type: alertData.type || 'Emergency Broadcast',
      title: alertData.title || 'REGIONAL EMERGENCY BROADCAST',
      message: alertData.message || alertData.desc || 'Immediate caution advised.',
      time: alertData.time || 'Just now',
      timestamp: alertData.timestamp || Date.now(),
      area: alertData.area || 'All Active Hazard Zones',
      confidence: alertData.confidence || 95,
      sources: alertData.sources || ['Authority Command Center', 'IMD Doppler Radar'],
      active: true
    };

    this.alerts.unshift(fullAlert);
    this.persistLocalCache();
    this.notifyAlertListeners(this.alerts, { added: fullAlert });

    if (this.meshChannel) {
      this.meshChannel.postMessage({ type: 'NEW_ALERT', payload: fullAlert });
    }

    if (this.db) {
      this.db.collection('emergency_alerts').doc(alertId).set(fullAlert).catch(err => {
        console.warn('Firestore emergency alert broadcast notice:', err.message);
      });
    }

    return fullAlert;
  }

  /**
   * Broadcast zone creation
   */
  broadcastZoneCreation(zone) {
    if (this.meshChannel) {
      this.meshChannel.postMessage({ type: 'NEW_ZONE', payload: zone });
    }
    if (this.db) {
      this.db.collection('risk_zones').doc(zone.id).set(zone).catch(err => {
        console.warn('Firestore zone creation broadcast notice:', err.message);
      });
    }
  }

  /**
   * Broadcast zone removal
   */
  broadcastZoneRemoval(zoneId) {
    if (this.meshChannel) {
      this.meshChannel.postMessage({ type: 'REMOVE_ZONE', payload: { zoneId } });
    }
    if (this.db) {
      this.db.collection('risk_zones').doc(zoneId).delete().catch(err => {
        console.warn('Firestore zone deletion broadcast notice:', err.message);
      });
    }
  }

  /**
   * Seeds default Indian disaster scenarios into Cloud Firestore
   */
  async seedCloudReports() {
    // Strictly gate demo data seeding: never pollute live Firestore unless drill mode is explicitly enabled
    if (typeof window === 'undefined' || window.SEED_DEMO_DATA !== true) {
      console.log('[FirebaseLive] Production mode active: skipping demo data seeding.');
      return;
    }
    if (!this.db) return;
    try {
      const batch = this.db.batch();
      const initialReports = (typeof APP_DATA !== 'undefined' && APP_DATA.citizenReports)
        ? APP_DATA.citizenReports
        : [];

      initialReports.forEach((rep, idx) => {
        const docRef = this.db.collection('citizen_reports').doc(rep.id);
        batch.set(docRef, { ...rep, timestamp: Date.now() - (idx * 600000) }, { merge: true });
      });

      const initialAlerts = (typeof APP_DATA !== 'undefined' && APP_DATA.alerts)
        ? APP_DATA.alerts
        : [];

      initialAlerts.forEach((alt, idx) => {
        const docRef = this.db.collection('emergency_alerts').doc(alt.id);
        batch.set(docRef, { ...alt, timestamp: Date.now() - (idx * 300000) }, { merge: true });
      });

      const initialZones = (typeof APP_DATA !== 'undefined' && APP_DATA.riskZones)
        ? APP_DATA.riskZones
        : [];
        
      initialZones.forEach(zone => {
        const docRef = this.db.collection('risk_zones').doc(zone.id);
        batch.set(docRef, { ...zone }, { merge: true });
      });

      await batch.commit();
      console.log('Successfully seeded initial disaster datasets to Cloud Firestore.');
    } catch (e) {
      console.warn('Could not seed cloud reports:', e.message);
    }
  }
}


// Global Singleton Instance
window.firebaseLive = new FirebaseLiveService();

// Synchronize DOM connectivity indicators on initial load
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      if (window.firebaseLive) window.firebaseLive.updateDOMIndicator();
    });
  } else {
    setTimeout(() => {
      if (window.firebaseLive) window.firebaseLive.updateDOMIndicator();
    }, 0);
  }
}
