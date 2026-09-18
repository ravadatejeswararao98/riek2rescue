/**
 * RISK2RESCUE — Shared Auth, Data, & Real-Time Sync Client
 * 
 * Replaces fragmented Firebase initialization across Citizen & Authority portals
 * with a single unified client backed by PostgreSQL + Redis via Node REST & WebSockets.
 * 
 * Role-Based Access Control (RBAC):
 *   - Citizen Role: Read public hazard data, submit SOS & incident reports.
 *   - Authority Role: Full lifecycle triage (verify/reject), zone management, emergency alerts.
 * 
 * Zero-Breakage Compatibility:
 *   - Exports window.RZIClient & singleton window.rziClient
 *   - Aliases window.firebaseLive = window.rziClient
 */

(function(global) {
  'use strict';

  function normalizeReport(raw, source = 'API') {
    if (!raw) return null;
    const id = raw.id || raw.reportId || ('REP-' + Date.now());
    const isSos = Boolean(raw.isSos || (raw.type && String(raw.type).toUpperCase().includes('SOS')));
    const lat = Number(raw.lat ?? raw.latitude);
    const lng = Number(raw.lng ?? raw.lon ?? raw.longitude);
    const validCoords = !isNaN(lat) && !isNaN(lng) && lat !== 0 && lng !== 0;

    return {
      id,
      reportId: id,
      type: raw.type || raw.category || 'Incident',
      category: raw.category || raw.type || 'Incident',
      severity: raw.severity || (isSos ? 'Critical' : 'Moderate'),
      desc: raw.desc || raw.description || raw.message || '',
      description: raw.description || raw.desc || raw.message || '',
      location: raw.location || (validCoords ? `[${lat.toFixed(3)}, ${lng.toFixed(3)}]` : 'Location not specified'),
      lat: validCoords ? lat : null,
      lng: validCoords ? lng : null,
      status: raw.status || (isSos ? 'Pending' : 'PENDING_TRIAGE'),
      verificationStatus: raw.verificationStatus || 'UNVERIFIED',
      lifecycleStatus: raw.lifecycleStatus || 'PENDING',
      officerNotes: raw.officerNotes || '',
      rejectionReason: raw.rejectionReason || null,
      source: raw.source || source,
      isSos,
      timestamp: raw.timestamp ? (typeof raw.timestamp === 'number' ? raw.timestamp : new Date(raw.timestamp).getTime()) : Date.now(),
      submittedAt: raw.submittedAt || new Date().toISOString(),
      verifiedAt: raw.verifiedAt || null,
      verifiedBy: raw.verifiedBy || null
    };
  }

  class RZIClient {
    constructor() {
      this.role = 'citizen';
      this.user = null;
      this.token = null;
      this.isCloudConnected = false;
      this.connectionMode = 'initializing'; // 'cloud', 'mesh', 'offline'

      this.reports = [];
      this.alerts = [];
      this.zones = [];
      this.datasources = [];

      this.reportListeners = [];
      this.alertListeners = [];
      this.zoneListeners = [];
      this.statusListeners = [];
      this.authListeners = [];
      this.datasourceListeners = [];

      this.ws = null;
      this.meshChannel = null;
      this.reconnectTimer = null;

      this.initAuthFromStorage();
      this.initMeshChannel();
      this.initWebSocket();
      this.fetchInitialData();
    }

    // ----------------------------------------------------------------
    // AUTHENTICATION & ROLE MANAGEMENT
    // ----------------------------------------------------------------
    initAuthFromStorage() {
      try {
        const storedToken = localStorage.getItem('rzi_token') || sessionStorage.getItem('rzi_token');
        const storedOfficer = sessionStorage.getItem('rzi_authority_officer') || localStorage.getItem('rzi_authority_officer');

        if (storedOfficer) {
          this.user = JSON.parse(storedOfficer);
          this.role = 'authority';
        }
        if (storedToken) {
          this.token = storedToken;
        }

        // Verify active session with backend asynchronously
        this.checkAuthSession();
      } catch (e) {
        this.role = 'citizen';
        this.user = null;
      }
    }

    async checkAuthSession() {
      try {
        const headers = {};
        if (this.token) headers['Authorization'] = `Bearer ${this.token}`;
        const res = await fetch('/api/auth/me', { headers });
        if (res.ok) {
          const data = await res.json();
          if (data.success && data.role === 'authority' && data.user) {
            this.role = 'authority';
            this.user = data.user;
            sessionStorage.setItem('rzi_authority_officer', JSON.stringify(data.user));
            this.notifyAuthListeners();
          } else if (this.role === 'authority' && (!data.user || data.role !== 'authority')) {
            // Re-affirm authority if stored locally, or fall back cleanly
            this.notifyAuthListeners();
          }
        }
      } catch (e) {}
    }

    getRole() {
      return this.role;
    }

    getUser() {
      return this.user;
    }

    isAuthenticated() {
      return this.role === 'authority' && Boolean(this.user);
    }

    async login(identifier, password) {
      const payload = { identifier, password };
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const result = await res.json();

      if (!res.ok || !result.success) {
        throw new Error(result.error || 'Authentication failed');
      }

      this.token = result.token;
      this.user = result.user;
      this.role = 'authority';

      try {
        localStorage.setItem('rzi_token', this.token);
        sessionStorage.setItem('rzi_token', this.token);
        sessionStorage.setItem('rzi_authority_officer', JSON.stringify(this.user));
        document.cookie = `rzi_auth=true; path=/; max-age=604800`;
      } catch (e) {}

      // Upgrade WebSocket connection to authority role
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: 'auth', token: this.token }));
      }

      this.notifyAuthListeners();
      return result;
    }

    async register(officerData) {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(officerData)
      });
      const result = await res.json();

      if (!res.ok || !result.success) {
        throw new Error(result.error || 'Registration failed');
      }

      this.token = result.token;
      this.user = result.user;
      this.role = 'authority';

      try {
        localStorage.setItem('rzi_token', this.token);
        sessionStorage.setItem('rzi_token', this.token);
        sessionStorage.setItem('rzi_authority_officer', JSON.stringify(this.user));
        document.cookie = `rzi_auth=true; path=/; max-age=604800`;
      } catch (e) {}

      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: 'auth', token: this.token }));
      }

      this.notifyAuthListeners();
      return result;
    }

    async logout() {
      try {
        await fetch('/api/auth/logout', { method: 'POST' });
      } catch (e) {}

      this.token = null;
      this.user = null;
      this.role = 'citizen';

      try {
        localStorage.removeItem('rzi_token');
        sessionStorage.removeItem('rzi_token');
        sessionStorage.removeItem('rzi_authority_officer');
        document.cookie = `rzi_auth=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT`;
      } catch (e) {}

      this.notifyAuthListeners();
    }

    onAuthStateChanged(callback) {
      this.authListeners.push(callback);
      callback(this.user, this.role);
    }

    notifyAuthListeners() {
      this.authListeners.forEach(cb => {
        try { cb(this.user, this.role); } catch (e) {}
      });
    }

    // ----------------------------------------------------------------
    // CROSS-TAB MESH & OFFLINE RESILIENCE
    // ----------------------------------------------------------------
    initMeshChannel() {
      try {
        if ('BroadcastChannel' in window) {
          this.meshChannel = new BroadcastChannel('rzi_mesh_sync');
          this.meshChannel.onmessage = (event) => {
            this.handleIncomingEvent(event.data);
          };
        }
      } catch (e) {}
    }

    // ----------------------------------------------------------------
    // WEBSOCKET REAL-TIME STREAM
    // ----------------------------------------------------------------
    initWebSocket() {
      try {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        let wsUrl = `${protocol}//${window.location.host}/`;
        if (this.token) {
          wsUrl += `?token=${encodeURIComponent(this.token)}`;
        }

        this.ws = new WebSocket(wsUrl);

        this.ws.onopen = () => {
          this.isCloudConnected = true;
          this.setConnectionStatus('cloud', 'Live Server & Database Stream Connected');
          if (this.token) {
            this.ws.send(JSON.stringify({ type: 'auth', token: this.token }));
          }
        };

        this.ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            this.handleIncomingEvent(data);
          } catch (e) {}
        };

        this.ws.onclose = () => {
          this.isCloudConnected = false;
          this.setConnectionStatus('mesh', 'Local Mesh Mode Active');
          this.scheduleReconnect();
        };

        this.ws.onerror = () => {
          this.isCloudConnected = false;
          this.setConnectionStatus('mesh', 'Local Mesh Mode Active');
        };
      } catch (e) {
        this.isCloudConnected = false;
        this.setConnectionStatus('mesh', 'Local Mesh Mode Active');
      }
    }

    scheduleReconnect() {
      if (this.reconnectTimer) return;
      this.reconnectTimer = setTimeout(() => {
        this.reconnectTimer = null;
        this.initWebSocket();
      }, 5000);
    }

    // ----------------------------------------------------------------
    // INCOMING EVENT DISPATCHER
    // ----------------------------------------------------------------
    handleIncomingEvent(data) {
      if (!data) return;

      // 1. Live state snapshot broadcast
      if (data.type === 'live_state_update' && data.data) {
        if (Array.isArray(data.data.zones)) {
          this.zones = data.data.zones;
          this.notifyZoneListeners(this.zones);
        }
        if (Array.isArray(data.data.alerts)) {
          this.alerts = data.data.alerts;
          this.notifyAlertListeners(this.alerts);
        }
        this.syncToAppData();
      }

      // 2. High-priority authority broadcast alert
      if (data.type === 'authority_alert' && data.alert) {
        const alert = data.alert;
        if (!this.alerts.some(a => a.id === alert.id)) {
          this.alerts.unshift(alert);
          this.notifyAlertListeners(this.alerts, { added: alert });
        }
      }

      // 3. New citizen report
      if (data.type === 'NEW_REPORT' && data.payload) {
        const norm = normalizeReport(data.payload);
        if (norm && !this.reports.some(r => r.id === norm.id)) {
          // Citizen role only sees verified reports
          if (this.role === 'authority' || norm.status === 'Verified') {
            this.reports.unshift(norm);
            this.notifyReportListeners(this.reports, { added: norm });
          }
        }
      }

      // 4. Report status update (verify / reject)
      if (data.type === 'UPDATE_REPORT' && data.payload) {
        const upd = data.payload;
        const idx = this.reports.findIndex(r => r.id === upd.id || r.reportId === upd.id);
        if (idx !== -1) {
          this.reports[idx] = Object.assign({}, this.reports[idx], upd);
          // If rejected and citizen role, remove from public view
          if (this.role === 'citizen' && upd.status === 'Rejected') {
            this.reports.splice(idx, 1);
          }
          this.notifyReportListeners(this.reports, { updated: this.reports[idx] });
        } else if (upd.status === 'Verified') {
          const norm = normalizeReport(upd);
          this.reports.unshift(norm);
          this.notifyReportListeners(this.reports, { added: norm });
        }
      }

      // 5. Zone created
      if (data.type === 'NEW_ZONE' && data.payload) {
        const zone = data.payload;
        const idx = this.zones.findIndex(z => z.id === zone.id);
        if (idx >= 0) this.zones[idx] = zone;
        else this.zones.push(zone);
        this.notifyZoneListeners(this.zones);
        this.syncToAppData();
      }

      // 6. Zone removed
      if (data.type === 'REMOVE_ZONE' && data.payload) {
        const zoneId = data.payload.zoneId;
        this.zones = this.zones.filter(z => z.id !== zoneId);
        this.notifyZoneListeners(this.zones);
        this.syncToAppData();
      }

      // 7. Full live state update pushed over WebSocket
      if (data.type === 'live_state_update' && data.data) {
        if (Array.isArray(data.data.zones)) {
          this.zones = data.data.zones;
          this.notifyZoneListeners(this.zones);
          this.syncToAppData();
          if (window.mapApp && typeof window.mapApp.drawRiskZones === 'function') window.mapApp.drawRiskZones();
          if (window.authMapInstance && typeof window.authMapInstance.drawRiskZones === 'function') window.authMapInstance.drawRiskZones();
          if (window.disasterMap && typeof window.disasterMap.drawRiskZones === 'function') window.disasterMap.drawRiskZones();
        }
        if (Array.isArray(data.data.alerts)) {
          this.alerts = data.data.alerts;
          this.notifyAlertListeners(this.alerts);
          this.syncToAppData();
        }
      }

      // 8. Explicit zone refresh broadcast
      if (data.type === 'ZONES_REFRESH' && data.payload) {
        if (Array.isArray(data.payload.zones)) {
          this.zones = data.payload.zones;
          this.notifyZoneListeners(this.zones);
          this.syncToAppData();
          if (window.mapApp && typeof window.mapApp.drawRiskZones === 'function') window.mapApp.drawRiskZones();
          if (window.authMapInstance && typeof window.authMapInstance.drawRiskZones === 'function') window.authMapInstance.drawRiskZones();
          if (window.disasterMap && typeof window.disasterMap.drawRiskZones === 'function') window.disasterMap.drawRiskZones();
        }
      }
    }

    // ----------------------------------------------------------------
    // INITIAL DATA FETCH VIA REST
    // ----------------------------------------------------------------
    async fetchInitialData() {
      try {
        const headers = {};
        if (this.token) headers['Authorization'] = `Bearer ${this.token}`;

        // Fetch reports
        const repRes = await fetch('/api/reports', { headers }).catch(() => null);
        if (repRes && repRes.ok) {
          const repData = await repRes.json();
          if (Array.isArray(repData.reports)) {
            this.reports = repData.reports.map(r => normalizeReport(r));
            this.notifyReportListeners(this.reports);
          }
        }

        // Fetch active zones
        const zoneRes = await fetch('/api/gis/zones').catch(() => null);
        if (zoneRes && zoneRes.ok) {
          const zoneData = await zoneRes.json();
          if (Array.isArray(zoneData.zones)) {
            this.zones = zoneData.zones;
            this.notifyZoneListeners(this.zones);
          }
        }

        // Fetch alerts
        const altRes = await fetch('/api/alerts').catch(() => null);
        if (altRes && altRes.ok) {
          const altData = await altRes.json();
          if (Array.isArray(altData.alerts)) {
            this.alerts = altData.alerts;
            this.notifyAlertListeners(this.alerts);
          }
        }

        this.syncToAppData();
      } catch (e) {}
    }

    syncToAppData() {
      if (typeof window !== 'undefined' && window.APP_DATA) {
        if (!window.APP_DATA.live) window.APP_DATA.live = {};
        window.APP_DATA.live.citizenReports = this.reports;
        window.APP_DATA.riskZones = this.zones;
        if (Array.isArray(this.alerts) && this.alerts.length > 0) {
          window.APP_DATA.live.alerts = this.alerts;
        }
        if (typeof window.syncMonitoredHazardsFromLiveIntel === 'function') {
          window.syncMonitoredHazardsFromLiveIntel(null, this.zones);
        }
        if (typeof window.renderZoneManager === 'function') {
          window.renderZoneManager();
        }
      }
    }

    // ----------------------------------------------------------------
    // STATUS & INDICATORS
    // ----------------------------------------------------------------
    setConnectionStatus(mode, label) {
      this.connectionMode = mode;
      this.statusListeners.forEach(fn => {
        try { fn(mode, label); } catch (e) {}
      });
      this.updateDOMIndicator();
    }

    updateDOMIndicator() {
      if (typeof document === 'undefined') return;
      if (document.body && document.body.classList.contains('citizen-page')) return;

      const indicators = document.querySelectorAll('#sync-status-indicator, .sync-status-indicator');
      indicators.forEach(el => {
        const isSynced = this.isCloudConnected;
        el.className = `sync-status-indicator ${isSynced ? 'synced' : 'offline'}`;
        el.title = isSynced
          ? '🟢 Live Server & Database Connected & Synchronized'
          : '⚪ Operating in offline local storage / mesh fallback mode';
        el.innerHTML = `
          <span class="sync-dot"></span>
          <span class="sync-text">${isSynced ? '🟢 Synced' : '⚪ Offline (local only)'}</span>
        `;
      });
    }

    // ----------------------------------------------------------------
    // PUBLIC SUBSCRIPTION API
    // ----------------------------------------------------------------
    onReports(callback) {
      this.reportListeners.push(callback);
      if (this.reports.length > 0) callback(this.reports);
    }

    onAlerts(callback) {
      this.alertListeners.push(callback);
      if (this.alerts.length > 0) callback(this.alerts);
    }

    onZones(callback) {
      this.zoneListeners.push(callback);
      if (this.zones.length > 0) callback(this.zones);
    }

    onStatus(callback) {
      this.statusListeners.push(callback);
      callback(this.connectionMode, this.isCloudConnected ? 'Live Server Connected' : 'Local Mesh Active');
    }

    onConnectionStatus(callback) {
      this.onStatus(callback);
    }

    onDatasources(callback) {
      this.datasourceListeners.push(callback);
      if (this.datasources.length > 0) callback(this.datasources);
    }

    notifyReportListeners(reports, meta) {
      this.syncToAppData();
      this.reportListeners.forEach(fn => {
        try { fn(reports, meta); } catch (e) {}
      });
    }

    notifyAlertListeners(alerts, meta) {
      this.syncToAppData();
      this.alertListeners.forEach(fn => {
        try { fn(alerts, meta); } catch (e) {}
      });
    }

    notifyZoneListeners(zones) {
      this.syncToAppData();
      this.zoneListeners.forEach(fn => {
        try { fn(zones); } catch (e) {}
      });
    }

    // ----------------------------------------------------------------
    // INCIDENT MUTATION OPERATIONS (REST + WS + MESH)
    // ----------------------------------------------------------------

    /**
     * Submit a Citizen or SOS Report
     */
    async submitCitizenReport(reportData) {
      const payload = {
        ...reportData,
        submittedAt: new Date().toISOString(),
        source: reportData.source || 'CITIZEN_WEB'
      };

      // Optimistic local update & mesh broadcast
      const normalized = normalizeReport(payload);
      if (normalized) {
        this.reports.unshift(normalized);
        this.notifyReportListeners(this.reports, { added: normalized });

        if (this.meshChannel) {
          this.meshChannel.postMessage({ type: 'NEW_REPORT', payload: normalized });
        }
      }

      // REST POST to server
      try {
        const headers = { 'Content-Type': 'application/json' };
        if (this.token) headers['Authorization'] = `Bearer ${this.token}`;
        const res = await fetch('/api/reports', {
          method: 'POST',
          headers,
          body: JSON.stringify(payload)
        });
        if (res.ok) {
          const resJson = await res.json();
          return resJson.report || normalized;
        }
      } catch (err) {
        console.warn('[RZIClient] Server submission deferred (stored in mesh cache):', err.message);
      }

      return normalized;
    }

    /**
     * Authority Action: Verify a Citizen Report
     */
    async verifyReport(reportId, officerNotes = '') {
      if (this.role !== 'authority') {
        throw new Error('Forbidden: Authority clearance required to verify reports.');
      }

      const report = this.reports.find(r => r.id === reportId || r.reportId === reportId);
      const updates = {
        id: reportId,
        status: 'Verified',
        verificationStatus: 'VERIFIED',
        lifecycleStatus: 'VERIFIED',
        officerNotes: officerNotes || 'Confirmed by Incident Command.',
        verifiedAt: new Date().toLocaleTimeString(),
        verifiedTimestamp: Date.now()
      };

      if (report) {
        Object.assign(report, updates);
        this.notifyReportListeners(this.reports, { updated: report });
      }

      if (this.meshChannel) {
        this.meshChannel.postMessage({ type: 'UPDATE_REPORT', payload: updates });
      }

      // REST POST to server
      try {
        const headers = { 'Content-Type': 'application/json' };
        if (this.token) headers['Authorization'] = `Bearer ${this.token}`;
        await fetch(`/api/reports/${encodeURIComponent(reportId)}/verify`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ officerNotes })
        });
      } catch (err) {
        console.warn('[RZIClient] Report verify post warning:', err);
      }

      return report || updates;
    }

    /**
     * Authority Action: Reject a Citizen Report
     */
    async rejectReport(reportId, reason = '') {
      if (this.role !== 'authority') {
        throw new Error('Forbidden: Authority clearance required to reject reports.');
      }

      const report = this.reports.find(r => r.id === reportId || r.reportId === reportId);
      const updates = {
        id: reportId,
        status: 'Rejected',
        verificationStatus: 'REJECTED',
        lifecycleStatus: 'REJECTED',
        rejectionReason: reason || 'Unsubstantiated / Outside AP boundary'
      };

      if (report) {
        Object.assign(report, updates);
        this.notifyReportListeners(this.reports, { updated: report });
      }

      if (this.meshChannel) {
        this.meshChannel.postMessage({ type: 'UPDATE_REPORT', payload: updates });
      }

      try {
        const headers = { 'Content-Type': 'application/json' };
        if (this.token) headers['Authorization'] = `Bearer ${this.token}`;
        await fetch(`/api/reports/${encodeURIComponent(reportId)}/reject`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ reason })
        });
      } catch (err) {}

      return report || updates;
    }

    /**
     * Authority Action: Broadcast Emergency Alert
     */
    async broadcastEmergencyAlert(alertData) {
      if (this.role !== 'authority') {
        throw new Error('Forbidden: Authority clearance required to broadcast alerts.');
      }

      const alertId = alertData.id || ('ALT-' + Date.now().toString().slice(-4));
      const fullAlert = {
        id: alertId,
        level: alertData.level || 'CRITICAL',
        type: alertData.type || 'Emergency Broadcast',
        title: alertData.title || 'REGIONAL EMERGENCY BROADCAST',
        message: alertData.message || alertData.desc || 'Immediate caution advised.',
        time: 'Just now',
        timestamp: alertData.timestamp || Date.now(),
        area: alertData.area || 'All Active Hazard Zones',
        confidence: alertData.confidence || 96,
        sources: alertData.sources || ['Authority Command Center'],
        active: true
      };

      this.alerts.unshift(fullAlert);
      this.notifyAlertListeners(this.alerts, { added: fullAlert });

      if (this.meshChannel) {
        this.meshChannel.postMessage({ type: 'authority_alert', alert: fullAlert });
      }

      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ action: 'broadcast_alert', alert: fullAlert }));
      }

      try {
        const headers = { 'Content-Type': 'application/json' };
        if (this.token) headers['Authorization'] = `Bearer ${this.token}`;
        await fetch('/api/alerts/broadcast', {
          method: 'POST',
          headers,
          body: JSON.stringify(fullAlert)
        });
      } catch (e) {}

      return fullAlert;
    }

    /**
     * Authority Action: Broadcast Zone Creation
     */
    async broadcastZoneCreation(zone) {
      if (!zone.id) zone.id = 'ZONE-' + Date.now();
      const idx = this.zones.findIndex(z => z.id === zone.id);
      if (idx >= 0) this.zones[idx] = zone;
      else this.zones.push(zone);

      this.notifyZoneListeners(this.zones);

      if (this.meshChannel) {
        this.meshChannel.postMessage({ type: 'NEW_ZONE', payload: zone });
      }

      if (this.ws && this.ws.readyState === WebSocket.OPEN && this.role === 'authority') {
        this.ws.send(JSON.stringify({ type: 'NEW_ZONE', payload: zone }));
      }

      try {
        const headers = { 'Content-Type': 'application/json' };
        if (this.token) headers['Authorization'] = `Bearer ${this.token}`;
        await fetch('/api/gis/zones', {
          method: 'POST',
          headers,
          body: JSON.stringify(zone)
        });
      } catch (e) {}
    }

    /**
     * Authority Action: Broadcast Zone Removal
     */
    async broadcastZoneRemoval(zoneId) {
      this.zones = this.zones.filter(z => z.id !== zoneId);
      this.notifyZoneListeners(this.zones);

      if (this.meshChannel) {
        this.meshChannel.postMessage({ type: 'REMOVE_ZONE', payload: { zoneId } });
      }

      if (this.ws && this.ws.readyState === WebSocket.OPEN && this.role === 'authority') {
        this.ws.send(JSON.stringify({ type: 'REMOVE_ZONE', payload: { zoneId } }));
      }

      try {
        const headers = {};
        if (this.token) headers['Authorization'] = `Bearer ${this.token}`;
        await fetch(`/api/gis/zones/${encodeURIComponent(zoneId)}`, {
          method: 'DELETE',
          headers
        });
      } catch (e) {}
    }

    // Redraw maps integration
    redrawAllMaps() {
      if (typeof window === 'undefined') return;
      if (window.mapApp && typeof window.mapApp.drawRiskZones === 'function') window.mapApp.drawRiskZones();
      if (window.authMapInstance && typeof window.authMapInstance.drawRiskZones === 'function') window.authMapInstance.drawRiskZones();
      if (window.disasterMap && typeof window.disasterMap.drawRiskZones === 'function') window.disasterMap.drawRiskZones();
    }
  }

  // Export Singleton & Backward-Compatible Aliases
  const client = new RZIClient();
  global.RZIClient = RZIClient;
  global.rziClient = client;

  // Backward-compatibility: window.firebaseLive maps to the unified client
  global.firebaseLive = client;

  // Dummy helper functions for any lingering legacy calls
  global.getFirebaseConfig = function() {
    return { projectId: 'risk2rescue-postgres-live', isCustom: false };
  };
  global.saveFirebaseConfig = function() {};

})(typeof window !== 'undefined' ? window : this);
