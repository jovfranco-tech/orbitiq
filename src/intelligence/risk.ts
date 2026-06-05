// ============================================================
// OrbitIQ v0.5.0 — Mission Briefs & Space Infrastructure Risk Layer
// ============================================================
import { CS } from '../state/catalogStore';
import { REGIONS } from '../regions/regions';
import type { 
  GroupKey, BandKey, RiskSignal, RiskLevel, 
  MissionScenario
} from '../types';
import { getIntelligence } from './intelligence';

let cachedScenarios: Record<string, MissionScenario> | null = null;
let lastRiskUpdate = 0;
const RISK_TTL = 2000;

export function invalidateRisk(): void {
  cachedScenarios = null;
  lastRiskUpdate = 0;
}

function getLevel(score: number): RiskLevel {
  if (score < 25) return 'low';
  if (score < 50) return 'moderate';
  if (score < 75) return 'elevated';
  return 'high';
}

function countSatellites(groups: GroupKey[], bands: BandKey[], regionIds: string[]): number {
  if (CS.N === 0) return 0;
  
  let count = 0;
  for (let i = 0; i < CS.N; i++) {
    if (CS.alt[i] < 0) continue; // Below horizon / unpropagatable
    
    // Check group
    if (groups.length > 0 && !groups.includes(CS.group[i])) continue;
    // Check band
    if (bands.length > 0 && !bands.includes(CS.band[i])) continue;
    
    // Check region
    if (regionIds.length > 0) {
      let inRegion = false;
      const lat = CS.lat[i];
      const lon = CS.lon[i];
      for (const rid of regionIds) {
        const box = REGIONS[rid]?.box;
        if (box && lat >= box[0] && lat <= box[1] && lon >= box[2] && lon <= box[3]) {
          inRegion = true;
          break;
        }
      }
      if (!inRegion) continue;
    }
    
    count++;
  }
  return count;
}

export function getMissionScenarios(): Record<string, MissionScenario> {
  const now = performance.now();
  if (cachedScenarios && (now - lastRiskUpdate < RISK_TTL)) {
    return cachedScenarios;
  }
  
  const N = CS.N;
  if (N === 0) return {};
  
  let simNote = '';
  if (CS.liveSnapshot) {
    const live = CS.liveSnapshot;
    const intel = getIntelligence();
    const simTotal = CS.N;
    const simTopRegion = intel.highestConcentrationRegion;
    const simTopGroup = intel.regions[0]?.topGroups[0]?.group || 'other';
    const simLeo = intel.bands.find(b => b.band === 'LEO')?.count || 0;
    
    simNote = `\n[SIMULATED SCENARIO ACTIVE]
    • Visible Count: Live (${live.total.toLocaleString()}) vs Sim (${simTotal.toLocaleString()})
    • LEO Density: Live (${live.bands.LEO.toLocaleString()}) vs Sim (${simLeo.toLocaleString()})
    • Top Region: Live (${REGIONS[live.topRegion]?.label || live.topRegion}) vs Sim (${REGIONS[simTopRegion]?.label || simTopRegion})
    • Dominant Group: Live (${live.topGroup.toUpperCase()}) vs Sim (${simTopGroup.toUpperCase()})`;
  }

  // GNSS Dependency
  const gnssCount = countSatellites(['gnss'], ['MEO'], []);
  const gnssScore = Math.min(100, Math.round((gnssCount / 100) * 100)); // normalized against typical GNSS active counts

  const gnssRisk: RiskSignal = {
    category: 'GNSS',
    score: gnssScore,
    level: getLevel(100 - gnssScore), // Inverse: low count = high risk of degraded service
    explanation: `Currently tracking ${gnssCount} GNSS satellites visible overhead. A low count indicates potential degradation in precise positioning and timing services.`,
    assumptions: ['Assumes standard MEO constellation distribution.', 'Counts only propagated public TLE objects above horizon.'],
    recommendedAction: 'Filter by GNSS group to verify regional coverage gaps.',
    caveat: 'Analytical scenario indicator, not operational aerospace risk assessment.'
  };

  const gnssScenario: MissionScenario = {
    id: 'GNSS_Dependency',
    title: 'GNSS Dependency Brief',
    context: 'Assessing global visibility and reliance on precise positioning, navigation, and timing (PNT) infrastructure.',
    relevantGroups: ['gnss'],
    relevantBands: ['MEO'],
    relevantRegions: [],
    visibleCount: gnssCount,
    insight: `GNSS visibility is currently ${getLevel(gnssScore)} with ${gnssCount} active signals detected.`,
    operationalRelevance: 'Critical for financial markets, logistics, and power grid synchronization.',
    caveat: 'Deterministic portfolio intelligence based on public TLEs. Not for operational aerospace decisions.',
    recommendedAction: { type: 'filter_by_group', group: 'GNSS' },
    riskSignal: gnssRisk
  };

  // LATAM Connectivity
  const latamCommsCount = countSatellites(['geo', 'starlink'], [], ['sa', 'ca']);
  const latamScore = Math.min(100, Math.round((latamCommsCount / 200) * 100));

  const latamScenario: MissionScenario = {
    id: 'LATAM_Connectivity',
    title: 'LATAM Connectivity Resilience',
    context: 'Monitoring space-enabled communication infrastructure over Latin America (GEO broadband and LEO mega-constellations).',
    relevantGroups: ['geo', 'starlink'],
    relevantBands: ['GEO', 'LEO'],
    relevantRegions: ['sa', 'ca'],
    visibleCount: latamCommsCount,
    insight: `Detected ${latamCommsCount} communications satellites servicing LATAM. Resilience is ${getLevel(latamScore)}.`,
    operationalRelevance: 'Rural broadband penetration and disaster recovery communications reliance.',
    caveat: 'Regional overflight is approximate and based on propagated subpoints.',
    recommendedAction: { type: 'highlight_relevant_region', region: 'sa' },
    riskSignal: {
      category: 'Connectivity',
      score: latamScore,
      level: getLevel(100 - latamScore), // High count = low risk
      explanation: `Regional connectivity dependency relies on ${latamCommsCount} visible assets over South/Central America.`,
      assumptions: ['Includes Starlink and GEO groups.', 'Regional bounds are approximate.'],
      recommendedAction: 'Inspect Starlink density over the SA region.',
      caveat: 'Analytical scenario indicator, not an operational aerospace risk assessment.'
    }
  };

  // Weather Visibility
  const weatherCount = countSatellites(['weather'], [], []);
  const weatherScenario: MissionScenario = {
    id: 'Weather_Visibility',
    title: 'Weather Satellite Visibility',
    context: 'Tracking meteorological and Earth observation assets for global weather monitoring.',
    relevantGroups: ['weather'],
    relevantBands: ['LEO', 'GEO'],
    relevantRegions: [],
    visibleCount: weatherCount,
    insight: `${weatherCount} meteorological satellites currently tracked.`,
    operationalRelevance: 'Essential for severe weather prediction, agriculture, and maritime routing.',
    caveat: 'Deterministic portfolio intelligence based on public TLEs.',
    recommendedAction: { type: 'filter_by_group', group: 'Weather' },
    riskSignal: {
      category: 'Weather',
      score: Math.min(100, weatherCount * 2),
      level: getLevel(100 - (weatherCount * 2)),
      explanation: `Meteorological coverage indicator based on ${weatherCount} tracked assets.`,
      assumptions: ['Includes NOAA, GOES, Meteosat, Himawari equivalents.'],
      recommendedAction: 'Filter by weather group.',
      caveat: 'Not for operational aerospace risk assessment.'
    }
  };

  // Disaster Response
  const disasterCount = countSatellites(['science', 'weather'], ['LEO'], []);
  const disasterScenario: MissionScenario = {
    id: 'Disaster_Response',
    title: 'Disaster Response Awareness',
    context: 'Evaluating Earth observation and SAR satellite passes for rapid damage assessment capabilities.',
    relevantGroups: ['science', 'weather'],
    relevantBands: ['LEO'],
    relevantRegions: [],
    visibleCount: disasterCount,
    insight: `${disasterCount} science/EO satellites currently in low Earth orbit capable of rapid revisit.`,
    operationalRelevance: 'Critical for flood mapping, wildfire tracking, and earthquake damage assessment.',
    caveat: 'Deterministic portfolio intelligence based on public TLEs.',
    recommendedAction: { type: 'filter_by_band', band: 'LEO' }
  };

  // LEO Density
  const leoCount = countSatellites([], ['LEO'], []);
  const leoDensityScore = Math.min(100, Math.round((leoCount / N) * 100)); // % of catalog in LEO
  const leoScenario: MissionScenario = {
    id: 'LEO_Density',
    title: 'LEO Constellation Density',
    context: 'Analyzing orbital crowding and mega-constellation density in Low Earth Orbit.',
    relevantGroups: ['starlink', 'leo'],
    relevantBands: ['LEO'],
    relevantRegions: [],
    visibleCount: leoCount,
    insight: `LEO accounts for ${leoDensityScore}% of the currently visible catalog.`,
    operationalRelevance: 'High density increases conjunction rates and optical astronomy interference.',
    caveat: 'Density indicators are analytical portfolio signals, not flight-safety metrics.',
    recommendedAction: { type: 'filter_by_band', band: 'LEO' },
    riskSignal: {
      category: 'LEO_Density',
      score: leoDensityScore,
      level: getLevel(leoDensityScore), // High % = high density pressure
      explanation: `${leoCount} objects in LEO creating significant orbital density pressure.`,
      assumptions: ['Counts all objects with altitude < 2000km.'],
      recommendedAction: 'Investigate LEO band density.',
      caveat: 'Not for conjunction assessment, flight safety or operational aerospace decisions.'
    }
  };

  // Executive Snapshot
  const execScenario: MissionScenario = {
    id: 'Executive_Snapshot',
    title: 'Executive Space Infrastructure Snapshot',
    context: 'High-level aggregated overview of current global space infrastructure operations.',
    relevantGroups: [],
    relevantBands: [],
    relevantRegions: [],
    visibleCount: CS.N,
    insight: `Tracking ${CS.N.toLocaleString()} total space objects across all regimes.` + simNote,
    operationalRelevance: 'Baseline situational awareness of humanity’s active orbital infrastructure.',
    caveat: 'Near-real-time public orbital data where available; representative fallback catalog may be active.',
    recommendedAction: { type: 'executive_brief' }
  };

  if (simNote) {
    [gnssScenario, latamScenario, weatherScenario, disasterScenario, leoScenario].forEach(s => {
      s.insight += simNote;
      s.caveat = 'Scenario simulation active. Accuracy may degrade away from TLE epoch. ' + s.caveat;
    });
  }

  cachedScenarios = {
    GNSS_Dependency: gnssScenario,
    LATAM_Connectivity: latamScenario,
    Weather_Visibility: weatherScenario,
    Disaster_Response: disasterScenario,
    LEO_Density: leoScenario,
    Executive_Snapshot: execScenario
  };
  
  lastRiskUpdate = now;
  return cachedScenarios;
}
