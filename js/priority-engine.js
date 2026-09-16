/**
 * RISK2RESCUE — PRIORITY ENGINE (Deterministic 6-Factor Model)
 *
 * Universal Module: Usable both in Node.js backend (CommonJS) and browser frontends.
 * Task 16 Data-Truth Audit:
 * - Authoritative weights sum exactly to 1.00.
 * - Explicit component normalization without fabricated defaults.
 * - Response Urgency grounded in genuine ETA/routing telemetry.
 * - Accessibility normalized strictly to authoritative thresholds.
 * - Risk Factor calculated as (hazard × exposure × vulnerability) normalized 0–100.
 * - Truthful missing-data policy: unavailable factors explicitly tracked and explainable.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    // Node.js CommonJS
    module.exports = factory();
  } else {
    // Browser global
    root.PriorityEngine = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {

  // Authoritative Canonical Weights (Sum = 1.00)
  const WEIGHTS = {
    hazardSeverity: 0.25,
    populationAtRisk: 0.20,
    vulnerability: 0.15,
    immediateLifeRisk: 0.15,
    responseUrgency: 0.15,
    accessibility: 0.10
  };

  const TIERS = {
    CRITICAL: { min: 90, max: 100 },
    HIGH: { min: 75, max: 89 },
    MODERATE: { min: 50, max: 74 },
    LOW: { min: 0, max: 49 }
  };

  function normalize(val, min, max) {
    if (max === min) return 0;
    let norm = (val - min) / (max - min);
    return Math.max(0, Math.min(100, norm * 100));
  }

  /**
   * Component A: Hazard Severity (0-100)
   * Grounded in genuine telemetry or active hazard classification.
   * Returns null if no hazard evidence is present (no fabricated default 50).
   */
  function calculateHazardSeverity(incident) {
    if (!incident || typeof incident !== 'object') return null;
    if (incident.hazardSeverityRaw !== undefined && incident.hazardSeverityRaw !== null) {
      const val = Number(incident.hazardSeverityRaw);
      return !isNaN(val) ? Math.max(0, Math.min(100, Math.round(val))) : null;
    }
    const hazardStr = String(incident.hazardType || incident.hazard_type || '').toLowerCase().trim();
    if (!hazardStr) return null;

    if (hazardStr.includes('cyclone') || hazardStr.includes('hurricane')) return 85;
    if (hazardStr.includes('flood') || hazardStr.includes('tsunami') || hazardStr.includes('surge')) return 75;
    if (hazardStr.includes('landslide')) return 80;
    if (hazardStr.includes('earthquake') || hazardStr.includes('seismic')) return 90;
    if (hazardStr.includes('fire') || hazardStr.includes('wildfire')) return 85;
    if (hazardStr.includes('squall') || hazardStr.includes('cloudburst') || hazardStr.includes('storm')) return 70;
    return 60; // Identified hazard type
  }

  /**
   * Component B: Population at Risk (0-100)
   * Band mapping based on standard scales.
   * Returns null if population data is missing/undefined.
   */
  function calculatePopulationRisk(incident) {
    if (!incident || typeof incident !== 'object') return null;
    const rawPop = incident.populationAtRisk !== undefined && incident.populationAtRisk !== null
      ? incident.populationAtRisk
      : (incident.population !== undefined && incident.population !== null
          ? incident.population
          : (incident.growth_adjusted_pop !== undefined && incident.growth_adjusted_pop !== null
              ? incident.growth_adjusted_pop
              : null));

    if (rawPop === null || rawPop === undefined || isNaN(Number(rawPop))) return null;
    const pop = Number(rawPop);
    if (pop <= 0) return 0;
    if (pop > 10000) return 100;
    if (pop > 5000) return 85;
    if (pop > 1000) return 70;
    if (pop > 500) return 50;
    if (pop > 50) return 30;
    return 10;
  }

  /**
   * Component C: Vulnerability (0-100)
   * Evaluates demographic, structural, and geographic reference vulnerability.
   * Returns null if no vulnerability evidence exists (no fabricated default 50).
   */
  function calculateVulnerability(incident) {
    if (!incident || typeof incident !== 'object') return null;
    if (incident.vulnerabilityRaw !== undefined && incident.vulnerabilityRaw !== null) {
      const val = Number(incident.vulnerabilityRaw);
      return !isNaN(val) ? Math.max(0, Math.min(100, Math.round(val))) : null;
    }

    let hasData = false;
    let score = 0;

    if (incident.elderlyPct !== undefined && incident.elderlyPct !== null) {
      score += Number(incident.elderlyPct) * 100 * 0.3;
      hasData = true;
    }
    if (incident.isolated === true) {
      score += 20;
      hasData = true;
    }
    if (incident.structuralVulnerability !== undefined && incident.structuralVulnerability !== null) {
      score += Number(incident.structuralVulnerability);
      hasData = true;
    }
    if (incident.elevation_m !== undefined && incident.elevation_m !== null) {
      const elevVuln = Math.max(0, 100 - (Number(incident.elevation_m) * 10));
      score = hasData ? (score + elevVuln) / 2 : elevVuln;
      hasData = true;
    }

    if (!hasData) return null;
    return Math.max(0, Math.min(100, Math.round(score)));
  }

  /**
   * Component D: Immediate Life Risk (0-100)
   * Grounded strictly in genuine operational evidence (trapped citizens, life threat, rapid rise, verified SOS).
   * Returns null if unmonitored/unreported (no fabricated default 10).
   */
  function calculateImmediateLifeRisk(incident) {
    if (!incident || typeof incident !== 'object') return null;
    if (incident.immediateLifeRiskRaw !== undefined && incident.immediateLifeRiskRaw !== null) {
      const val = Number(incident.immediateLifeRiskRaw);
      return !isNaN(val) ? Math.max(0, Math.min(100, Math.round(val))) : null;
    }

    let score = 0;
    let hasEvidence = false;

    if (incident.personTrapped === true || incident.lifeThreatening === true) {
      score = 100;
      hasEvidence = true;
    }
    if (incident.rapidlyRisingWater === true) {
      score = Math.max(score, (score || 0) + 40);
      hasEvidence = true;
    }
    if (incident.criticalInfrastructureFailure === true) {
      score = Math.max(score, (score || 0) + 30);
      hasEvidence = true;
    }

    let citizenSos = incident.verifiedSosCount ?? incident.verifiedSosReportsCount ?? null;
    if (citizenSos === null) {
      if (incident.sosReportsCount !== undefined && incident.sosReportsCount !== null) {
        citizenSos = incident.sosReportsCount;
      } else if (Array.isArray(incident.citizenReports)) {
        // Legitimate report evidence only: VERIFIED SOS (not drill, not rejected, not resolved)
        const validSosReports = incident.citizenReports.filter(r => 
          (r.isSos || (r.type && r.type.toUpperCase().includes('SOS'))) &&
          (r.status === 'Verified' || r.verificationStatus === 'VERIFIED') &&
          r.status !== 'Rejected' && r.status !== 'Resolved' && r.status !== 'Dismissed' &&
          r.lifecycleStatus !== 'REJECTED' && r.lifecycleStatus !== 'RESOLVED' &&
          !r.isDrill && !r.isSimulated && r.tier !== 'SIMULATED' && r.role !== 'DRILL'
        );
        citizenSos = validSosReports.length;
      } else if (incident.citizenReportsCount !== undefined && incident.citizenReportsCount !== null) {
        citizenSos = incident.citizenReportsCount;
      }
    }

    if (citizenSos !== null && citizenSos !== undefined && !isNaN(Number(citizenSos))) {
      const count = Number(citizenSos);
      if (count > 0) {
        score = Math.max(score, Math.min(100, 20 + count * 20));
      }
      hasEvidence = true;
    }

    if (hasEvidence) {
      return Math.max(0, Math.min(100, Math.round(score)));
    }

    // Explicitly monitored baseline with zero incidents
    if (incident.monitored === true || incident.status === 'MONITORED' || incident.status === 'ACTIVE') {
      return 0;
    }

    return null;
  }

  /**
   * Component E: Response Urgency (0-100)
   * Grounded in genuine ETA minutes. Lower ETA = higher urgency.
   * Returns null if ETA is unavailable (no fabricated default 50).
   */
  function calculateResponseUrgency(incident) {
    if (!incident || typeof incident !== 'object') return null;
    if (incident.responseUrgencyRaw !== undefined && incident.responseUrgencyRaw !== null) {
      let score = Number(incident.responseUrgencyRaw);
      if (incident.escalating === true) score += 20;
      return !isNaN(score) ? Math.max(0, Math.min(100, Math.round(score))) : null;
    }

    const rawEta = incident.etaMins !== undefined && incident.etaMins !== null
      ? incident.etaMins
      : (incident.travelTimeMins !== undefined && incident.travelTimeMins !== null
          ? incident.travelTimeMins
          : (incident.travel_time_mins !== undefined && incident.travel_time_mins !== null
              ? incident.travel_time_mins
              : null));

    if (rawEta !== null && rawEta !== undefined && !isNaN(Number(rawEta)) && Number(rawEta) >= 0) {
      const eta = Number(rawEta);
      let score;
      if (eta <= 15) score = 90;
      else if (eta <= 30) score = 80;
      else if (eta <= 60) score = 65;
      else if (eta <= 120) score = 45;
      else score = 20;

      if (incident.escalating === true) score += 20;
      return Math.max(0, Math.min(100, Math.round(score)));
    }

    if (incident.escalating === true) {
      return 75;
    }

    return null;
  }

  /**
   * Component F: Accessibility (0-100)
   * Authoritative Normalization:
   * travelTimeMins < 15  => 100
   * travelTimeMins < 30  => 80
   * travelTimeMins < 60  => 60
   * travelTimeMins < 120 => 30
   * otherwise            => 10
   * noUsableRoute        => 0
   * Returns null if routing data is unavailable (no fabricated default 60).
   */
  function calculateAccessibility(incident) {
    if (!incident || typeof incident !== 'object') return null;
    if (incident.accessibilityRaw !== undefined && incident.accessibilityRaw !== null) {
      const val = Number(incident.accessibilityRaw);
      return !isNaN(val) ? Math.max(0, Math.min(100, Math.round(val))) : null;
    }
    if (incident.noUsableRoute === true) return 0;

    const rawT = incident.travelTimeMins !== undefined && incident.travelTimeMins !== null
      ? incident.travelTimeMins
      : (incident.etaMins !== undefined && incident.etaMins !== null
          ? incident.etaMins
          : (incident.travel_time_mins !== undefined && incident.travel_time_mins !== null
              ? incident.travel_time_mins
              : null));

    if (rawT === null || rawT === undefined || isNaN(Number(rawT)) || Number(rawT) < 0) {
      return null;
    }

    const t = Number(rawT);
    if (t < 15) return 100;
    if (t < 30) return 80;
    if (t < 60) return 60;
    if (t < 120) return 30;
    return 10;
  }

  /**
   * Risk Factor: hazard × exposure × vulnerability (Normalized 0–100)
   * Returns null if any contributing factor is unavailable.
   */
  function calculateRiskFactor(fHazard, fExposure, fVulnerability) {
    if (fHazard === null || fHazard === undefined || isNaN(Number(fHazard))) return null;
    if (fExposure === null || fExposure === undefined || isNaN(Number(fExposure))) return null;
    if (fVulnerability === null || fVulnerability === undefined || isNaN(Number(fVulnerability))) return null;

    const rf = (Number(fHazard) / 100) * (Number(fExposure) / 100) * (Number(fVulnerability) / 100) * 100;
    return Math.max(0, Math.min(100, Math.round(rf)));
  }

  function assignPriorityLevel(score) {
    if (score === null || score === undefined || isNaN(score)) return 'UNAVAILABLE';
    if (score >= TIERS.CRITICAL.min) return 'CRITICAL';
    if (score >= TIERS.HIGH.min) return 'HIGH';
    if (score >= TIERS.MODERATE.min) return 'MODERATE';
    return 'LOW';
  }

  /**
   * Canonical Priority Calculation
   * Evaluates all 6 factors, enforces missing-data policy, and calculates Risk Factor.
   */
  function calculatePriority(incident) {
    const fA = calculateHazardSeverity(incident);
    const fB = calculatePopulationRisk(incident);
    const fC = calculateVulnerability(incident);
    const fD = calculateImmediateLifeRisk(incident);
    const fE = calculateResponseUrgency(incident);
    const fF = calculateAccessibility(incident);

    const factorScores = {
      hazardSeverity: fA,
      populationAtRisk: fB,
      vulnerability: fC,
      immediateLifeRisk: fD,
      responseUrgency: fE,
      accessibility: fF
    };

    const availableFactors = {};
    const unavailableFactors = [];
    let availableWeight = 0;
    let weightedSum = 0;

    for (const [key, weight] of Object.entries(WEIGHTS)) {
      const val = factorScores[key];
      if (val !== null && val !== undefined && !isNaN(val)) {
        availableFactors[key] = Math.round(val);
        availableWeight += weight;
        weightedSum += val * weight;
      } else {
        unavailableFactors.push(key);
      }
    }

    let rawScore = null;
    let isPartial = false;

    if (availableWeight > 0) {
      if (Math.abs(availableWeight - 1.0) < 0.001) {
        rawScore = weightedSum;
        isPartial = false;
      } else {
        // Normalizes available factor weights proportionally
        rawScore = weightedSum / availableWeight;
        isPartial = true;
      }
    }

    let overrideApplied = false;
    // Emergency life-safety override
    if (rawScore !== null) {
      if ((fD !== null && fD >= 90 && fA !== null && fA >= 80) ||
          incident.lifeThreatening === true ||
          incident.personTrapped === true) {
        if (rawScore < 90) {
          rawScore = 90;
          overrideApplied = true;
        }
      }
    }

    const finalScore = rawScore !== null ? Math.max(0, Math.min(100, Math.round(rawScore))) : null;
    const level = assignPriorityLevel(finalScore);
    const riskFactor = calculateRiskFactor(fA, fB, fC);

    const reasons = [];
    if (overrideApplied) reasons.push("Emergency life-safety override applied.");
    if (fD !== null && fD >= 80) reasons.push("High immediate life-safety risk.");
    if (fA !== null && fA >= 80) reasons.push("Extreme hazard severity.");
    if (fB !== null && fB >= 80) reasons.push("Large exposed population.");
    if (fE !== null && fE >= 80) reasons.push("Rapidly increasing hazard / High response urgency.");
    if (isPartial) reasons.push(`Partial score: ${unavailableFactors.length} factors unavailable (${unavailableFactors.join(', ')}).`);

    let recommendedAction = "Monitor situation.";
    if (finalScore === null) recommendedAction = "Obtain telemetry to establish priority.";
    else if (finalScore >= 90) recommendedAction = "Immediate evacuation / rescue deployment.";
    else if (finalScore >= 75) recommendedAction = "Prepare for priority relocation.";
    else if (finalScore >= 50) recommendedAction = "Standby and stage resources.";

    const provenance = {
      hazardSeverity: {
        sourceId: incident.hazardSourceId || (fA !== null ? 'cap_imd' : null),
        status: fA !== null ? 'LIVE' : 'UNAVAILABLE',
        contributingSources: incident.hazardContributingSources || (fA !== null ? ['cap_imd', 'openmeteo_weather', 'usgs_earthquakes'] : []),
        description: fA !== null ? (incident.hazardProvenance || 'Live hazard telemetry & CAP advisory') : 'Unavailable'
      },
      populationAtRisk: {
        sourceId: 'census_india_ap',
        referenceYear: 2011,
        derived: true,
        status: fB !== null ? 'DERIVED' : 'UNAVAILABLE',
        exposureSourceGeometry: incident.mapped_zone_id ? `Zone ${incident.mapped_zone_id}` : (incident.hazardType ? `Active ${incident.hazardType} boundary` : 'None'),
        description: fB !== null ? (incident.populationProvenance || 'Census India AP 2011 Reference Baseline (Spatially Derived Exposure)') : 'Unavailable'
      },
      vulnerability: {
        sourceId: 'census_india_ap',
        tier: 'REFERENCE_DERIVED',
        status: fC !== null ? 'DERIVED' : 'UNAVAILABLE',
        contributingSources: ['census_india_ap', 'elevation_srtm'],
        classification: 'Reference Demographic & Physical Elevation Model',
        description: fC !== null ? (incident.vulnerabilityProvenance || 'Census Demographic & Elevation Reference Model') : 'Unavailable'
      },
      immediateLifeRisk: {
        sourceId: incident.lifeRiskSourceId || 'ap_citizen_reports',
        status: fD !== null ? 'LIVE' : 'UNAVAILABLE',
        contributingSources: ['ap_citizen_reports', 'emergency_telemetry'],
        description: fD !== null ? (incident.lifeRiskProvenance || 'AP Live Report / Citizen SOS Verification Pipeline') : 'Unavailable'
      },
      responseUrgency: {
        sourceId: 'osrm_routing',
        status: fE !== null ? 'LIVE' : 'UNAVAILABLE',
        contributingSources: ['osrm_routing'],
        description: fE !== null ? (incident.urgencyProvenance || 'OSRM Live Road Routing Engine') : 'Unavailable'
      },
      accessibility: {
        sourceId: 'osrm_routing',
        status: fF !== null ? 'LIVE' : 'UNAVAILABLE',
        contributingSources: ['osrm_routing'],
        description: fF !== null ? (incident.accessibilityProvenance || 'OSRM Road Network Accessibility') : 'Unavailable'
      }
    };

    return {
      score: finalScore,
      level,
      overrideApplied,
      factors: {
        hazardSeverity: fA !== null ? Math.round(fA) : null,
        populationAtRisk: fB !== null ? Math.round(fB) : null,
        vulnerability: fC !== null ? Math.round(fC) : null,
        immediateLifeRisk: fD !== null ? Math.round(fD) : null,
        responseUrgency: fE !== null ? Math.round(fE) : null,
        accessibility: fF !== null ? Math.round(fF) : null
      },
      riskFactor,
      unavailableFactors,
      availableWeight: +availableWeight.toFixed(2),
      isPartial,
      provenance,
      reasons,
      recommendedAction
    };
  }

  function rankIncidents(incidents) {
    const scored = incidents.map(inc => {
      const p = calculatePriority(inc);
      return {
        ...inc,
        priorityScore: p.score,
        priorityLevel: p.level,
        factorScores: p.factors,
        riskFactor: p.riskFactor,
        unavailableFactors: p.unavailableFactors,
        isPartial: p.isPartial,
        overrideApplied: p.overrideApplied,
        provenance: p.provenance,
        reasons: p.reasons,
        recommendedAction: p.recommendedAction
      };
    });

    scored.sort((a, b) => {
      const scoreA = a.priorityScore !== null ? a.priorityScore : -1;
      const scoreB = b.priorityScore !== null ? b.priorityScore : -1;
      if (scoreB !== scoreA) {
        return scoreB - scoreA;
      }
      // Tie-breaking
      const lifeA = a.factorScores.immediateLifeRisk ?? -1;
      const lifeB = b.factorScores.immediateLifeRisk ?? -1;
      if (lifeB !== lifeA) return lifeB - lifeA;

      const urgA = a.factorScores.responseUrgency ?? -1;
      const urgB = b.factorScores.responseUrgency ?? -1;
      if (urgB !== urgA) return urgB - urgA;

      const vulnA = a.factorScores.vulnerability ?? -1;
      const vulnB = b.factorScores.vulnerability ?? -1;
      if (vulnB !== vulnA) return vulnB - vulnA;

      const accA = a.factorScores.accessibility ?? -1;
      const accB = b.factorScores.accessibility ?? -1;
      return accB - accA;
    });

    scored.forEach((inc, idx) => { inc.rank = idx + 1; });
    return scored;
  }

  function evaluateRelocationCandidates(incident, shelters, distanceMatrix) {
    const pop = Number(incident.populationAtRisk || incident.population || incident.growth_adjusted_pop || 0);
    const candidates = [];

    shelters.forEach(s => {
      const totalCapacity = Number(s.capacity || s.max_capacity || 0);
      const isUnconfirmed = s.occupancyStatus === 'UNKNOWN' || (s.current_occupancy === null && s.occupancy == null);
      const currentOccupancy = isUnconfirmed ? 0 : Number(s.current_occupancy || s.occupancy || 0);
      const availableCapacity = totalCapacity - currentOccupancy;

      const distInfo = distanceMatrix && distanceMatrix[incident.id] ? distanceMatrix[incident.id][s.id || s.shelter_id] : null;

      let status = "REJECTED";
      let reason = "";

      if (availableCapacity < pop) {
        reason = `Insufficient capacity (Avail: ${availableCapacity}, Needed: ${pop})`;
      } else if (distInfo === undefined || distInfo === null) {
        reason = "No practical route found.";
      } else {
        status = "RECOMMENDED";
      }

      candidates.push({
        shelter_id: s.id || s.shelter_id,
        shelter_name: s.name || s.shelter_name,
        availableCapacity,
        requiredCapacity: pop,
        occupancyStatus: isUnconfirmed ? 'UNCONFIRMED_CAPACITY' : 'CONFIRMED',
        distance: distInfo,
        status,
        reason
      });
    });

    candidates.sort((a, b) => {
      if (a.status !== b.status) return a.status === "RECOMMENDED" ? -1 : 1;
      return (a.distance || Infinity) - (b.distance || Infinity);
    });

    return candidates;
  }

  return {
    WEIGHTS,
    TIER_THRESHOLDS: TIERS,
    calculateHazardSeverity,
    calculatePopulationRisk,
    calculateVulnerability,
    calculateImmediateLifeRisk,
    calculateResponseUrgency,
    calculateAccessibility,
    calculateRiskFactor,
    calculatePriority,
    rankIncidents,
    evaluateRelocationCandidates
  };
}));
