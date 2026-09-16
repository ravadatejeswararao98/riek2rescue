// ================================================================
// FIREBASE-LIVE.JS — Live Realtime Database & Multi-device Mesh Sync
// ================================================================

/**
 * Normalizes a live citizen report without inventing data.
 * Adheres strictly to Task 6 requirements:
 * - Preserves: id, type, category, desc/message, latitude, longitude, accuracy, timestamp, time, status, verification state, source, reporter metadata.
 * - Does NOT invent: coordinates, timestamps, accuracy, severity, verification, location names.
 * - Missing values remain null, UNKNOWN, UNAVAILABLE as appropriate.
 * - Validates coordinates against official AP boundary GeoJSON (window.isInsideAndhraPradesh).
 * - Flags reports outside AP as Rejected / Out of State.
 *
 * @param {Object} raw
 * @param {string} defaultSource
 * @returns {Object|null}
 */
function normalizeCitizenReport(raw, defaultSource = 'FIREBASE') {
  if (!raw || typeof raw !== 'object') return null;

  const id = raw.id || raw.reportId || ('REP-' + (raw.timestamp || Date.now()).toString().slice(-6));
  const reportId = raw.reportId || id;
  const type = raw.type || raw.category || 'UNKNOWN';
  const reportType = raw.reportType || type;
  const category = raw.category || raw.type || 'Citizen Field Report';
  const desc = raw.desc ?? raw.description ?? raw.message ?? raw.details ?? '';
  const message = desc;
  const reporter = raw.reporter ?? raw.citizenName ?? 'Citizen Reporter';
  const phone = raw.phone ?? raw.contact ?? 'UNAVAILABLE';
  const timestamp = typeof raw.timestamp === 'number' ? raw.timestamp : (raw.timestamp ? new Date(raw.timestamp).getTime() : null);
  const time = raw.time || (timestamp ? new Date(timestamp).toLocaleTimeString() : 'UNAVAILABLE');
  const source = raw.source || defaultSource || 'UNKNOWN';
  const sourceId = raw.sourceId || (defaultSource ? defaultSource.toLowerCase() : 'unknown');

  // Coordinate parsing and validation
  const rawLat = raw.latitude ?? raw.lat ?? raw.locationCoords?.latitude ?? raw.locationCoords?.lat;
  const rawLng = raw.longitude ?? raw.lng ?? raw.lon ?? raw.locationCoords?.longitude ?? raw.locationCoords?.lng;

  const hasCoords = (
    rawLat !== null && rawLat !== undefined &&
    rawLng !== null && rawLng !== undefined &&
    rawLat !== '' && rawLng !== '' &&
    !isNaN(Number(rawLat)) && !isNaN(Number(rawLng)) &&
    isFinite(Number(rawLat)) && isFinite(Number(rawLng)) &&
    Number(rawLat) >= -90 && Number(rawLat) <= 90 &&
    Number(rawLng) >= -180 && Number(rawLng) <= 180
  );

  const lat = hasCoords ? Number(rawLat) : null;
  const lng = hasCoords ? Number(rawLng) : null;
  const rawAcc = raw.locationAccuracy ?? raw.accuracy ?? raw.locationCoords?.accuracy;
  const accuracy = (hasCoords && rawAcc !== null && rawAcc !== undefined && !isNaN(Number(rawAcc)) && isFinite(Number(rawAcc)) && Number(rawAcc) >= 0)
    ? Math.round(Number(rawAcc))
    : null;

  // Spatial containment check against official AP boundary GeoJSON
  let isInsideAP = null;
  if (hasCoords) {
    if (typeof window !== 'undefined' && typeof window.isInsideAndhraPradesh === 'function') {
      isInsideAP = window.isInsideAndhraPradesh(lat, lng);
    } else if (typeof global !== 'undefined' && typeof global.isCoordInsideAP === 'function') {
      isInsideAP = global.isCoordInsideAP(lng, lat);
    } else if (typeof isCoordInsideAP === 'function') {
      isInsideAP = isCoordInsideAP(lng, lat);
    }
  }

  // Preserve existing report status (Pending, Verified, Rejected, Resolved, Escalated)
  let status = raw.status || 'Pending';
  let lifecycleStatus = raw.lifecycleStatus || (status === 'Verified' ? 'VERIFIED' : (status === 'Rejected' || status === 'Dismissed' ? 'REJECTED' : (status === 'Resolved' ? 'RESOLVED' : (status === 'Escalated' ? 'ESCALATED' : 'PENDING'))));
  let verificationStatus = raw.verificationStatus || (status === 'Verified' ? 'VERIFIED' : (status === 'Rejected' ? 'REJECTED' : 'UNVERIFIED'));

  let rejectionReason = raw.rejectionReason || null;

  // If coordinates outside AP boundary, fail closed: mark explicitly as Rejected
  if (hasCoords && isInsideAP === false) {
    status = 'Rejected';
    lifecycleStatus = 'REJECTED';
    verificationStatus = 'REJECTED';
    rejectionReason = rejectionReason || 'Out of State — Coordinate outside Andhra Pradesh operational boundary';
  }

  const isSos = Boolean(raw.isSos || (type && type.toUpperCase().includes('SOS')));
  const severity = raw.severity || (isSos ? 'Critical' : 'UNKNOWN');

  const locString = raw.location && !raw.location.toLowerCase().includes('fallback')
    ? raw.location
    : (hasCoords ? `Lat ${lat.toFixed(5)}° N, Lng ${lng.toFixed(5)}° E` : 'Location unavailable');

  const isDrill = Boolean(raw.isDrill || raw.isSimulated || raw.tier === 'SIMULATED' || raw.role === 'DRILL');

  return {
    id,
    reportId,
    type,
    reportType,
    category,
    desc,
    description: desc,
    message,
    reporter,
    phone,
    timestamp,
    submissionTimestamp: raw.submissionTimestamp || timestamp,
    submittedAt: raw.submittedAt || (timestamp ? new Date(timestamp).toISOString() : null),
    receivedAt: raw.receivedAt || null,
    time,
    source,
    sourceId,
    status,
    lifecycleStatus,
    verificationStatus,
    rejectionReason,
    severity,
    isSos,
    sosStatus: isSos ? (raw.sosStatus || 'HIGH_PRIORITY_URGENT') : undefined,
    lat,
    lng,
    latitude: lat,
    longitude: lng,
    accuracy,
    locationAccuracy: accuracy,
    location: locString,
    locationStatus: hasCoords ? 'AVAILABLE' : 'UNAVAILABLE',
    locationCoords: hasCoords ? {
      latitude: lat,
      longitude: lng,
      accuracy,
      capturedAt: raw.locationTimestamp || timestamp
    } : null,
    isInsideAP,
    upvotes: typeof raw.upvotes === 'number' ? raw.upvotes : 0,
    photo: raw.photo || null,
    officerNotes: raw.officerNotes || null,
    verifiedBy: raw.verifiedBy || null,
    verifiedAt: raw.verifiedAt || null,
    verifiedTimestamp: raw.verifiedTimestamp || null,
    resolvedAt: raw.resolvedAt || null,
    resolvedTimestamp: raw.resolvedTimestamp || null,
    isDrill,
    tier: raw.tier || (isDrill ? 'SIMULATED' : 'LIVE_API'),
    role: raw.role || (isDrill ? 'DRILL' : 'OPERATIONAL')
  };
}

if (typeof window !== 'undefined') {
  window.normalizeCitizenReport = normalizeCitizenReport;
}

class FirebaseLiveService {
  constructor() {
    this.db = null;
    this.isCloudConnected = false;
    this.connectionMode = 'initializing'; // 'cloud', 'mesh', 'offline'
    this.meshChannel = null;
    this.reportListeners = [];
    this.alertListeners = [];
    this.statusListeners = [];
    this.datasourceListeners = [];

    // Local cached state — live reports start strictly as []
    this.reports = [];
    this.alerts = [];
    this.datasources = [];

    this.initMeshChannel();
    this.initFirebase();
  }

  syncToAppData() {
    if (typeof window !== 'undefined' && window.APP_DATA && window.APP_DATA.live) {
      window.APP_DATA.live.citizenReports = this.reports;
      if (Array.isArray(this.alerts) && this.alerts.length > 0) {
        const liveOnly = this.alerts.filter(a => a && !a.isDemo && !a.isDrill && a.tier !== 'SIMULATED' && a.role !== 'DRILL' && a.source !== 'STATIC_DEMO');
        if (liveOnly.length > 0) {
          const map = new Map();
          (window.APP_DATA.live.alerts || []).forEach(a => map.set(`${a.sourceId || a.source}_${a.id}`, a));
          liveOnly.forEach(a => map.set(`${a.sourceId || a.source}_${a.id}`, a));
          window.APP_DATA.live.alerts = Array.from(map.values());
        }
      }
    }
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
        const parsed = JSON.parse(storedReports);
        if (Array.isArray(parsed)) {
          // Keep only live reports (filter out simulated/drill/mock reports)
          this.reports = parsed
            .filter(r => r && !r.isDemo && !r.isDrill && r.tier !== 'SIMULATED' && r.role !== 'DRILL' && r.source !== 'STATIC_DEMO')
            .map(r => normalizeCitizenReport(r, r.source || 'REALTIME_MESH'))
            .filter(Boolean);
        }
      }

      const storedAlerts = localStorage.getItem('rzi_synced_alerts');
      if (storedAlerts) {
        const parsed = JSON.parse(storedAlerts);
        if (Array.isArray(parsed)) {
          this.alerts = parsed.filter(a => a && !a.isDemo && !a.isDrill && a.tier !== 'SIMULATED' && a.role !== 'DRILL' && a.source !== 'STATIC_DEMO');
        }
      } else if (typeof APP_DATA !== 'undefined' && APP_DATA.mode === 'DRILL' && Array.isArray(APP_DATA.alerts)) {
        this.alerts = JSON.parse(JSON.stringify(APP_DATA.alerts));
      }
    } catch (e) {
      console.warn('Error loading cached disaster data:', e);
    }
    this.syncToAppData();
  }

  ensureInitialData() {
    try {
      if (this.reports.length === 0) {
        const stored = localStorage.getItem('rzi_synced_reports');
        if (stored) {
          const parsed = JSON.parse(stored);
          if (Array.isArray(parsed)) {
            this.reports = parsed
              .filter(r => r && !r.isDemo && !r.isDrill && r.tier !== 'SIMULATED' && r.role !== 'DRILL' && r.source !== 'STATIC_DEMO')
              .map(r => normalizeCitizenReport(r, r.source || 'REALTIME_MESH'))
              .filter(Boolean);
          }
        }
      }
      // Never auto-inject default reports into LIVE operational state
      if (typeof APP_DATA !== 'undefined' && APP_DATA.mode === 'DRILL' && Array.isArray(APP_DATA.citizenReports)) {
        APP_DATA.citizenReports.forEach(defRep => {
          if (!this.reports.some(r => r.id === defRep.id)) {
            const norm = normalizeCitizenReport(defRep, 'DRILL');
            if (norm) this.reports.push(norm);
          }
        });
      }

      if (this.alerts.length === 0) {
        const storedAlerts = localStorage.getItem('rzi_synced_alerts');
        if (storedAlerts) {
          const parsed = JSON.parse(storedAlerts);
          if (Array.isArray(parsed)) {
            this.alerts = parsed.filter(a => a && !a.isDemo && !a.isDrill && a.tier !== 'SIMULATED' && a.role !== 'DRILL' && a.source !== 'STATIC_DEMO');
          }
        }
      }
      // Never auto-inject static alerts into LIVE operational state
      if (typeof APP_DATA !== 'undefined' && APP_DATA.mode === 'DRILL' && Array.isArray(APP_DATA.alerts)) {
        APP_DATA.alerts.forEach(defAlt => {
          if (!this.alerts.some(a => a.id === defAlt.id)) {
            this.alerts.push(JSON.parse(JSON.stringify(defAlt)));
          }
        });
      }
      this.syncToAppData();
    } catch (e) { }
  }

  handleMeshMessage(data) {
    this.ensureInitialData();
    if (!data || !data.type) return;

    if (data.type === 'NEW_REPORT') {
      const exists = this.reports.some(r => r.id === data.payload.id);
      if (!exists) {
        const normalized = normalizeCitizenReport(data.payload, data.payload?.source || 'REALTIME_MESH');
        if (normalized) {
          this.reports.unshift(normalized);
          this.persistLocalCache();
          this.syncToAppData();
          this.notifyReportListeners(this.reports, { added: normalized });
        }
      }
    } else if (data.type === 'UPDATE_REPORT') {
      const idx = this.reports.findIndex(r => r.id === data.payload.id);
      if (idx !== -1) {
        this.reports[idx] = normalizeCitizenReport({ ...this.reports[idx], ...data.payload }, this.reports[idx].source || 'REALTIME_MESH');
        this.persistLocalCache();
        this.syncToAppData();
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
            const norm = (typeof normalizeCitizenReport === 'function')
              ? normalizeCitizenReport({ id: doc.id, ...data }, 'FIREBASE')
              : { id: doc.id, ...data };
            if (norm) cloudReports.push(norm);
          });
          this.reports = cloudReports;
          this.persistLocalCache();
          this.syncToAppData();
          this.notifyReportListeners(this.reports);
        } else {
          // Cloud collection is empty — operational live state starts strictly as []
          this.reports = [];
          this.persistLocalCache();
          this.syncToAppData();
          this.notifyReportListeners(this.reports);
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
              if (window.HAZARD_INTEL) {
                Object.keys(window.HAZARD_INTEL).forEach(key => {
                  if (window.HAZARD_INTEL[key].zones) window.HAZARD_INTEL[key].zones = [];
                });
              }
              this.redrawAllMaps();
              if (typeof renderZoneManager === 'function') renderZoneManager();
            }
          }
        }
      }, (error) => {
        console.warn('Firestore risk_zones listener notice:', error.message);
      });

    // Listen to Datasources collection
    this.db.collection('datasources')
      .onSnapshot((snapshot) => {
        const cloudDatasources = [];
        snapshot.forEach(doc => {
          cloudDatasources.push({ id: doc.id, ...doc.data() });
        });
        this.datasources = cloudDatasources;
        this.notifyDatasourceListeners(this.datasources);
      }, (error) => {
        console.warn('Firestore datasources listener notice:', error.message);
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
    if (document.body && document.body.classList && document.body.classList.contains('citizen-page')) return;

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

  onDatasources(callback) {
    this.datasourceListeners.push(callback);
    if (this.datasources.length > 0) {
      callback(this.datasources);
    }
  }

  onConnectionStatus(callback) {
    this.statusListeners.push(callback);
    callback(this.connectionMode, this.isCloudConnected ? 'Live Cloud Firestore Connected' : 'Local Realtime Mesh Active');
  }

  onStatus(callback) {
    this.statusListeners.push(callback);
    callback(this.connectionMode, this.isCloudConnected ? 'Live Cloud Firestore Connected' : 'Local Realtime Mesh Active');
  }

  notifyReportListeners(reports, meta) {
    this.syncToAppData();
    this.reportListeners.forEach(fn => {
      try { fn(reports, meta); } catch (e) { console.error('Error in report listener:', e); }
    });
  }

  notifyAlertListeners(alerts, meta = null) {
    this.alertListeners.forEach(cb => {
      try { cb(alerts, meta); } catch (e) { console.error('Alert listener err:', e); }
    });
  }

  notifyDatasourceListeners(datasources, meta = null) {
    this.datasourceListeners.forEach(cb => {
      try { cb(datasources, meta); } catch (e) { console.error('Datasource listener err:', e); }
    });
  }

  // ---- Write Operations (Citizen & Authority) ----

  /**
   * Submit a new citizen incident report (e.g. from citizen.html or SOS beacon)
   */
  async submitCitizenReport(reportData) {
    this.ensureInitialData();
    const source = reportData.source || (this.isCloudConnected ? 'FIREBASE' : 'REALTIME_MESH');
    const fullReport = normalizeCitizenReport(reportData, source);
    if (!fullReport) return null;

    // 1. Update local cache, sync canonical live state, & broadcast via mesh
    this.reports.unshift(fullReport);
    this.persistLocalCache();
    this.syncToAppData();
    this.notifyReportListeners(this.reports, { added: fullReport });

    if (this.meshChannel) {
      this.meshChannel.postMessage({ type: 'NEW_REPORT', payload: fullReport });
    }

    // 2. Write to Firebase Cloud Firestore in background if available
    if (this.db) {
      this.db.collection('citizen_reports').doc(fullReport.id).set(fullReport).catch(err => {
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
      officerNotes: officerNotes || 'Confirmed via GIS telemetry and district inspection team.',
      verifiedAt: new Date().toLocaleTimeString(),
      verifiedTimestamp: Date.now()
    };

    Object.assign(report, updates);
    this.persistLocalCache();
    this.syncToAppData();
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
      title: `VERIFIED CITIZEN ALERT: ${report.type} at ${(report.desc || report.message || report.location || '').slice(0, 30)}...`,
      message: `${report.desc || report.message || ''} — Verified by Authority Incident Response Commander.`,
      time: 'Just now',
      timestamp: Date.now(),
      area: (report.lat && report.lng) ? `Vicinity coordinates [${Number(report.lat).toFixed(2)}, ${Number(report.lng).toFixed(2)}]` : (report.location || 'Reported Incident Area'),
      confidence: 96,
      sources: ['Citizen Verified', 'Incident Response Command'],
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
      rejectionReason: reason || 'Unsubstantiated condition or outside operational scope; dismissed.',
      dismissedAt: new Date().toLocaleTimeString()
    };

    Object.assign(report, updates);
    this.persistLocalCache();
    this.syncToAppData();
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

      const initialAlerts = (typeof APP_DATA !== 'undefined' && APP_DATA.alerts && APP_DATA.mode === 'DRILL')
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
if (typeof window !== 'undefined') {
  window.firebaseLive = new FirebaseLiveService();
}

// Synchronize DOM connectivity indicators on initial load
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      if (typeof window !== 'undefined' && window.firebaseLive) window.firebaseLive.updateDOMIndicator();
    });
  } else {
    setTimeout(() => {
      if (typeof window !== 'undefined' && window.firebaseLive) window.firebaseLive.updateDOMIndicator();
    }, 0);
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    normalizeCitizenReport,
    FirebaseLiveService
  };
}
