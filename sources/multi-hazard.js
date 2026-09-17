const { safeText } = require('../js/redact.js');
/**
 * RISK2RESCUE — MULTI-HAZARD OPERATIONAL CORRELATOR (sources/multi-hazard.js)
 * 
 * Correlates multiple concurrent hazards (cyclone, storm, flood, seismic, landslide, fire)
 * based strictly on verified spatial proximity and temporal overlap.
 * 
 * CRITICAL OPERATIONAL TRUTH RULE:
 * Correlation != Causation.
 * Co-occurring hazards are labeled as 'CORRELATED CO-OCCURRENCE' with isCausal: false.
 * Causation is NEVER inferred unless an authoritative source explicitly establishes it.
 */

function haversineDistKm(lat1, lon1, lat2, lon2) {
  if (lat1 === null || lon1 === null || lat2 === null || lon2 === null) return null;
  if (isNaN(lat1) || isNaN(lon1) || isNaN(lat2) || isNaN(lon2)) return null;
  const R = 6371; // Earth radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 10) / 10;
}

const CAUSAL_PHRASES = [
  'caused by',
  'induced by',
  'triggered by',
  'resulting from',
  'due to landfall of',
  'in the wake of'
];

/**
 * Check if source descriptions contain explicit authoritative causal statement
 */
function detectAuthoritativeCausation(textA = '', textB = '') {
  const combined = (String(textA) + ' ' + String(textB)).toLowerCase();
  for (const phrase of CAUSAL_PHRASES) {
    if (combined.includes(phrase)) {
      return { isCausal: true, causalPhrase: phrase };
    }
  }
  return { isCausal: false, causalPhrase: null };
}

/**
 * Correlates a set of active operational hazards
 * 
 * @param {Array} hazards - List of active hazard/alert objects
 * @param {Object} options - Configuration overrides (spatialDistThresholdKm, temporalWindowHours)
 * @returns {Array} List of correlated hazard relationships
 */
function correlateMultiHazards(hazards = [], options = {}) {
  if (!Array.isArray(hazards) || hazards.length < 2) {
    return [];
  }

  const spatialDistThresholdKm = options.spatialDistThresholdKm || 60; // 60km spatial correlation threshold
  const temporalWindowMs = (options.temporalWindowHours || 24) * 60 * 60 * 1000; // 24-hour temporal window
  const now = options.nowMs || Date.now();

  const correlations = [];
  const visitedPairs = new Set();

  for (let i = 0; i < hazards.length; i++) {
    for (let j = i + 1; j < hazards.length; j++) {
      const hA = hazards[i];
      const hB = hazards[j];

      // Exclude expired or archived or drill records from live correlation
      if (hA.operationalState === 'EXPIRED' || hB.operationalState === 'EXPIRED') continue;
      if (hA.operationalState === 'ARCHIVED' || hB.operationalState === 'ARCHIVED') continue;
      if (hA.status === 'EXPIRED' || hB.status === 'EXPIRED') continue;
      if (hA.status === 'ARCHIVED' || hB.status === 'ARCHIVED') continue;
      if (hA.isDrill || hB.isDrill || hA.tier === 'SIMULATED' || hB.tier === 'SIMULATED') continue;

      const idA = hA.id || hA.alertId || `HAZ_${i}`;
      const idB = hB.id || hB.alertId || `HAZ_${j}`;
      const pairKey = [idA, idB].sort().join('::');
      if (visitedPairs.has(pairKey)) continue;
      visitedPairs.add(pairKey);

      // 1. Spatial Relationship Check
      let isSpatialMatch = false;
      let spatialDistanceKm = null;
      let spatialMethod = 'NONE';

      const latA = hA.lat !== undefined ? hA.lat : (hA.latitude ?? null);
      const lngA = hA.lng !== undefined ? hA.lng : (hA.longitude ?? (hA.lon ?? null));
      const latB = hB.lat !== undefined ? hB.lat : (hB.latitude ?? null);
      const lngB = hB.lng !== undefined ? hB.lng : (hB.longitude ?? (hB.lon ?? null));

      if (latA !== null && lngA !== null && latB !== null && lngB !== null) {
        spatialDistanceKm = haversineDistKm(latA, lngA, latB, lngB);
        if (spatialDistanceKm !== null && spatialDistanceKm <= spatialDistThresholdKm) {
          isSpatialMatch = true;
          spatialMethod = 'PROXIMITY';
        }
      }

      // Secondary geographic metadata check (district / mandal text match)
      const areaA = (hA.area || hA.areaDesc || hA.district || '').toLowerCase();
      const areaB = (hB.area || hB.areaDesc || hB.district || '').toLowerCase();
      if (!isSpatialMatch && areaA && areaB && areaA === areaB && areaA !== 'andhra pradesh') {
        isSpatialMatch = true;
        spatialMethod = 'DISTRICT_MATCH';
      }

      // 2. Temporal Relationship Check
      let isTemporalMatch = false;
      let temporalMethod = 'NONE';

      const timeA = new Date(hA.effectiveAt || hA.effective || hA.issuedAt || hA.timestamp || now).getTime();
      const timeB = new Date(hB.effectiveAt || hB.effective || hB.issuedAt || hB.timestamp || now).getTime();

      const expA = (hA.expiresAt || hA.expires) ? new Date(hA.expiresAt || hA.expires).getTime() : (timeA + temporalWindowMs);
      const expB = (hB.expiresAt || hB.expires) ? new Date(hB.expiresAt || hB.expires).getTime() : (timeB + temporalWindowMs);

      // Overlap of [timeA, expA] and [timeB, expB]
      if (timeA <= expB && timeB <= expA) {
        isTemporalMatch = true;
        temporalMethod = 'OVERLAPPING_WINDOW';
      } else if (Math.abs(timeA - timeB) <= temporalWindowMs) {
        isTemporalMatch = true;
        temporalMethod = 'CO_OCCURRENCE_WINDOW';
      }

      // Both spatial and temporal must align to form an authentic correlation
      if (isSpatialMatch && isTemporalMatch) {
        const hazardTypeA = hA.hazardType || hA.hazard_type || hA.type || hA.event || 'Hazard A';
        const hazardTypeB = hB.hazardType || hB.hazard_type || hB.type || hB.event || 'Hazard B';

        // Check if authoritative source explicitly establishes causation
        const descA = hA.description || hA.desc || '';
        const descB = hB.description || hB.desc || '';
        const causalCheck = detectAuthoritativeCausation(descA, descB);

        correlations.push({
          correlationId: `CORR_${idA}_${idB}`,
          primaryAlertId: idA,
          secondaryAlertId: idB,
          hazards: [hazardTypeA, hazardTypeB],
          hazardTypes: Array.from(new Set([hazardTypeA, hazardTypeB])),
          spatialRelationship: {
            method: spatialMethod,
            distanceKm: spatialDistanceKm,
            areaA: hA.area || hA.areaDesc || null,
            areaB: hB.area || hB.areaDesc || null
          },
          temporalRelationship: {
            method: temporalMethod,
            timeA: new Date(timeA).toISOString(),
            timeB: new Date(timeB).toISOString()
          },
          correlationType: 'SPATIO_TEMPORAL_CO_OCCURRENCE',
          isCausal: causalCheck.isCausal,
          causalPhrase: causalCheck.causalPhrase,
          disclaimer: causalCheck.isCausal
            ? `Authoritative source indicates causal link (${causalCheck.causalPhrase}).`
            : 'Spatiotemporally correlated co-occurring hazards. No physical causal link established by primary sources.',
          evaluatedAt: new Date(now).toISOString()
        });
      }
    }
  }

  return correlations;
}

module.exports = {
  correlateMultiHazards,
  haversineDistKm,
  detectAuthoritativeCausation
};
