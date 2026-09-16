// ================================================================
// REPORTS.JS — Citizen Disaster Reporting & Human Verification
// ================================================================

class CitizenReportManager {
  constructor() {
    this._reports = [];
    this.reputationDB = {
      '+91-**-****-3421': { score: 92, verifiedCount: 5, falseAlarms: 0 },
      '+91-**-****-8821': { score: 78, verifiedCount: 2, falseAlarms: 0 },
      '+91-**-****-5541': { score: 65, verifiedCount: 1, falseAlarms: 0 },
      '+91-**-****-9921': { score: 50, verifiedCount: 0, falseAlarms: 0 },
      '+91-**-****-1141': { score: 96, verifiedCount: 8, falseAlarms: 0 }
    };
  }

  get reports() {
    if (this._reports && this._reports.length > 0) {
      return this._reports;
    }
    if (typeof window !== 'undefined' && window.APP_DATA && window.APP_DATA.live && Array.isArray(window.APP_DATA.live.citizenReports)) {
      return window.APP_DATA.live.citizenReports;
    }
    if (typeof window !== 'undefined' && window.firebaseLive && Array.isArray(window.firebaseLive.reports)) {
      return window.firebaseLive.reports;
    }
    return this._reports || [];
  }

  set reports(val) {
    this._reports = Array.isArray(val) ? val : [];
    if (typeof window !== 'undefined' && window.APP_DATA && window.APP_DATA.live) {
      window.APP_DATA.live.citizenReports = this._reports;
    }
  }

  getPendingReports() {
    return this.reports.filter(r => {
      if (!r) return false;
      if (r.status === 'Verified' || r.status === 'Dismissed' || r.status === 'Rejected' || r.status === 'Resolved' || r.lifecycleStatus === 'RESOLVED' || r.lifecycleStatus === 'REJECTED') return false;
      if (r.isDrill || r.isSimulated || r.tier === 'SIMULATED' || r.role === 'DRILL') return false;
      return r.status === 'Pending' || r.status === 'Submitted' || r.status === 'Reviewing' || r.status === 'HIGH_PRIORITY_URGENT' || r.status === 'Escalated' || r.isSos || (r.type && r.type.toUpperCase().includes('SOS'));
    });
  }

  getReportById(id) {
    return this.reports.find(r => r.id === id) || null;
  }

  verifyReport(id, officerNotes, verifiedBy) {
    // 1. Sync via Firebase Live Service
    if (typeof window !== 'undefined' && window.firebaseLive && typeof window.firebaseLive.verifyReport === 'function') {
      window.firebaseLive.verifyReport(id, officerNotes);
    }

    const report = this.reports.find(r => r.id === id);
    if (!report) return null;
    report.status = 'Verified';
    report.verificationStatus = 'VERIFIED';
    report.lifecycleStatus = 'VERIFIED';
    report.officerNotes = officerNotes || 'Confirmed by district field inspection team.';
    report.verifiedBy = verifiedBy || report.verifiedBy || 'Incident Commander';
    report.verifiedAt = new Date().toISOString();
    report.verifiedTimestamp = Date.now();

    // Update reputation
    if (report.phone && this.reputationDB[report.phone]) {
      this.reputationDB[report.phone].verifiedCount += 1;
      this.reputationDB[report.phone].score = Math.min(100, this.reputationDB[report.phone].score + 4);
    }

    // Trigger Regional Alert Broadcast
    this.broadcastRegionalAlert(report);
    return report;
  }

  rejectReport(id, reason, rejectedBy) {
    if (typeof window !== 'undefined' && window.firebaseLive && typeof window.firebaseLive.rejectReport === 'function') {
      window.firebaseLive.rejectReport(id, reason);
    }

    const report = this.reports.find(r => r.id === id);
    if (!report) return null;
    report.status = 'Rejected';
    report.verificationStatus = 'REJECTED';
    report.lifecycleStatus = 'REJECTED';
    report.rejectionReason = reason || 'Unsubstantiated or localized non-critical condition.';
    report.rejectedBy = rejectedBy || 'Incident Commander';
    report.rejectedAt = new Date().toISOString();
    report.rejectedTimestamp = Date.now();

    // Adjust reputation
    if (report.phone && this.reputationDB[report.phone]) {
      this.reputationDB[report.phone].falseAlarms += 1;
      this.reputationDB[report.phone].score = Math.max(10, this.reputationDB[report.phone].score - 10);
    }
    return report;
  }

  resolveReport(id, notes, resolvedBy) {
    const report = this.reports.find(r => r.id === id);
    if (!report) return null;
    report.status = 'Resolved';
    report.lifecycleStatus = 'RESOLVED';
    report.resolutionNotes = notes || 'Incident resolved and area secured.';
    report.resolvedBy = resolvedBy || 'Incident Commander';
    report.resolvedAt = new Date().toISOString();
    report.resolvedTimestamp = Date.now();
    return report;
  }

  escalateReport(id, notes, escalatedBy) {
    const report = this.reports.find(r => r.id === id);
    if (!report) return null;
    report.status = 'Escalated';
    report.lifecycleStatus = 'ESCALATED';
    report.escalationNotes = notes || 'Priority elevated to state emergency response.';
    report.escalatedBy = escalatedBy || 'Incident Commander';
    report.escalatedAt = new Date().toISOString();
    report.escalatedTimestamp = Date.now();
    return report;
  }

  broadcastRegionalAlert(report) {
    const hasCoords = (report.lat !== null && report.lat !== undefined && report.lng !== null && report.lng !== undefined);
    const newAlert = {
      id: 'ALT-' + Date.now().toString().slice(-4),
      level: report.severity === 'Critical' ? 'CRITICAL' : 'HIGH',
      type: report.type || 'Citizen Alert',
      title: `VERIFIED CITIZEN ALERT: ${report.type || 'Incident'} at ${(report.desc || report.message || report.location || '').slice(0, 30)}...`,
      time: 'Just now',
      timestamp: Date.now(),
      area: hasCoords ? `Vicinity coordinates [${Number(report.lat).toFixed(2)}, ${Number(report.lng).toFixed(2)}]` : (report.location || 'Reported Incident Area'),
      confidence: 94,
      sources: ['Citizen Verified', 'Officer Dispatch'],
      active: true
    };
    if (typeof APP_DATA !== 'undefined' && APP_DATA.alerts) {
      APP_DATA.alerts.unshift(newAlert);
    }
  }
}

const reportManager = new CitizenReportManager();
if (typeof window !== 'undefined') {
  window.reportManager = reportManager;
  window.CitizenReportManager = CitizenReportManager;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    CitizenReportManager,
    reportManager
  };
}
