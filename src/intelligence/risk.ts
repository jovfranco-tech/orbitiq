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
import { t } from '../i18n/i18n';

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

export function getMissionScenarios(lang: 'en' | 'es' = 'en'): Record<string, MissionScenario> {
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
    
    simNote = lang === 'es'
      ? `\n[ESCENARIO SIMULADO ACTIVO]
    • Conteo Visible: En vivo (${live.total.toLocaleString()}) vs Sim (${simTotal.toLocaleString()})
    • Densidad LEO: En vivo (${live.bands.LEO.toLocaleString()}) vs Sim (${simLeo.toLocaleString()})
    • Región Principal: En vivo (${t('region_' + live.topRegion) || live.topRegion}) vs Sim (${t('region_' + simTopRegion) || simTopRegion})
    • Grupo Dominante: En vivo (${live.topGroup.toUpperCase()}) vs Sim (${simTopGroup.toUpperCase()})`
      : `\n[SIMULATED SCENARIO ACTIVE]
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
    explanation: lang === 'es'
      ? `Actualmente se realiza el seguimiento de ${gnssCount} satélites GNSS visibles. Un recuento bajo indica una degradación potencial en los servicios de posicionamiento y sincronización de precisión.`
      : `Currently tracking ${gnssCount} GNSS satellites visible overhead. A low count indicates potential degradation in precise positioning and timing services.`,
    assumptions: lang === 'es'
      ? ['Asume una distribución estándar de la constelación MEO.', 'Solo cuenta objetos TLE públicos propagados sobre el horizonte.']
      : ['Assumes standard MEO constellation distribution.', 'Counts only propagated public TLE objects above horizon.'],
    recommendedAction: lang === 'es'
      ? 'Filtrar por el grupo GNSS para verificar brechas de cobertura regional.'
      : 'Filter by GNSS group to verify regional coverage gaps.',
    caveat: lang === 'es'
      ? 'Indicador analítico de escenario, no una evaluación operacional del riesgo aeroespacial.'
      : 'Analytical scenario indicator, not operational aerospace risk assessment.'
  };

  const gnssScenario: MissionScenario = {
    id: 'GNSS_Dependency',
    title: lang === 'es' ? 'Informe de Dependencia GNSS' : 'GNSS Dependency Brief',
    context: lang === 'es'
      ? 'Evaluación de la visibilidad global y la dependencia de la infraestructura de posicionamiento, navegación y sincronización (PNT).'
      : 'Assessing global visibility and reliance on precise positioning, navigation, and timing (PNT) infrastructure.',
    relevantGroups: ['gnss'],
    relevantBands: ['MEO'],
    relevantRegions: [],
    visibleCount: gnssCount,
    insight: lang === 'es'
      ? `La visibilidad de GNSS es actualmente ${t('risk_' + getLevel(gnssScore)) || getLevel(gnssScore)} con ${gnssCount} señales activas detectadas.`
      : `GNSS visibility is currently ${getLevel(gnssScore)} with ${gnssCount} active signals detected.`,
    operationalRelevance: lang === 'es'
      ? 'Crítico para mercados financieros, logística y sincronización de redes eléctricas.'
      : 'Critical for financial markets, logistics, and power grid synchronization.',
    caveat: lang === 'es'
      ? 'Inteligencia de portafolio determinista basada en TLE públicos. No apto para decisiones aeroespaciales.'
      : 'Deterministic portfolio intelligence based on public TLEs. Not for operational aerospace decisions.',
    recommendedAction: { type: 'filter_by_group', group: 'GNSS' },
    riskSignal: gnssRisk
  };

  // LATAM Connectivity
  const latamCommsCount = countSatellites(['geo', 'starlink'], [], ['sa', 'ca']);
  const latamScore = Math.min(100, Math.round((latamCommsCount / 200) * 100));

  const latamScenario: MissionScenario = {
    id: 'LATAM_Connectivity',
    title: lang === 'es' ? 'Resiliencia de Conectividad LATAM' : 'LATAM Connectivity Resilience',
    context: lang === 'es'
      ? 'Monitoreo de la infraestructura de comunicaciones espaciales sobre América Latina (banda ancha GEO y mega-constelaciones LEO).'
      : 'Monitoring space-enabled communication infrastructure over Latin America (GEO broadband and LEO mega-constellations).',
    relevantGroups: ['geo', 'starlink'],
    relevantBands: ['GEO', 'LEO'],
    relevantRegions: ['sa', 'ca'],
    visibleCount: latamCommsCount,
    insight: lang === 'es'
      ? `Se detectaron ${latamCommsCount} satélites de comunicaciones brindando servicio a LATAM. La resiliencia es ${t('risk_' + getLevel(latamScore)) || getLevel(latamScore)}.`
      : `Detected ${latamCommsCount} communications satellites servicing LATAM. Resilience is ${getLevel(latamScore)}.`,
    operationalRelevance: lang === 'es'
      ? 'Penetración de banda ancha rural y confiabilidad de comunicaciones en recuperación de desastres.'
      : 'Rural broadband penetration and disaster recovery communications reliance.',
    caveat: lang === 'es'
      ? 'El sobrevuelo regional es aproximado y se basa en subpuntos propagados.'
      : 'Regional overflight is approximate and based on propagated subpoints.',
    recommendedAction: { type: 'highlight_relevant_region', region: 'sa' },
    riskSignal: {
      category: 'Connectivity',
      score: latamScore,
      level: getLevel(100 - latamScore), // High count = low risk
      explanation: lang === 'es'
        ? `La dependencia de conectividad regional se basa en ${latamCommsCount} activos visibles sobre América del Sur y Central.`
        : `Regional connectivity dependency relies on ${latamCommsCount} visible assets over South/Central America.`,
      assumptions: lang === 'es'
        ? ['Incluye los grupos Starlink y GEO.', 'Los límites regionales son aproximados.']
        : ['Includes Starlink and GEO groups.', 'Regional bounds are approximate.'],
      recommendedAction: lang === 'es'
        ? 'Inspeccionar la densidad de Starlink sobre la región de América del Sur.'
        : 'Inspect Starlink density over the SA region.',
      caveat: lang === 'es'
        ? 'Indicador analítico de escenario, no una evaluación operacional del riesgo aeroespacial.'
        : 'Analytical scenario indicator, not an operational aerospace risk assessment.'
    }
  };

  // Weather Visibility
  const weatherCount = countSatellites(['weather'], [], []);
  const weatherScenario: MissionScenario = {
    id: 'Weather_Visibility',
    title: lang === 'es' ? 'Visibilidad de Satélites Meteorológicos' : 'Weather Satellite Visibility',
    context: lang === 'es'
      ? 'Seguimiento de activos meteorológicos y de observación terrestre para el monitoreo del clima global.'
      : 'Tracking meteorological and Earth observation assets for global weather monitoring.',
    relevantGroups: ['weather'],
    relevantBands: ['LEO', 'GEO'],
    relevantRegions: [],
    visibleCount: weatherCount,
    insight: lang === 'es'
      ? `Actualmente se realiza el seguimiento de ${weatherCount} satélites meteorológicos.`
      : `${weatherCount} meteorological satellites currently tracked.`,
    operationalRelevance: lang === 'es'
      ? 'Esencial para la predicción de clima severo, agricultura y rutas marítimas.'
      : 'Essential for severe weather prediction, agriculture, and maritime routing.',
    caveat: lang === 'es'
      ? 'Inteligencia de portafolio determinista basada en TLE públicos.'
      : 'Deterministic portfolio intelligence based on public TLEs.',
    recommendedAction: { type: 'filter_by_group', group: 'Weather' },
    riskSignal: {
      category: 'Weather',
      score: Math.min(100, weatherCount * 2),
      level: getLevel(100 - (weatherCount * 2)),
      explanation: lang === 'es'
        ? `Indicador de cobertura meteorológica basado en ${weatherCount} activos rastreados.`
        : `Meteorological coverage indicator based on ${weatherCount} tracked assets.`,
      assumptions: lang === 'es'
        ? ['Incluye equivalentes de NOAA, GOES, Meteosat, Himawari.']
        : ['Includes NOAA, GOES, Meteosat, Himawari equivalents.'],
      recommendedAction: lang === 'es' ? 'Filtrar por el grupo de clima.' : 'Filter by weather group.',
      caveat: lang === 'es' ? 'No apto para evaluación operacional del riesgo aeroespacial.' : 'Not for operational aerospace risk assessment.'
    }
  };

  // Disaster Response
  const disasterCount = countSatellites(['science', 'weather'], ['LEO'], []);
  const disasterScenario: MissionScenario = {
    id: 'Disaster_Response',
    title: lang === 'es' ? 'Conciencia de Respuesta a Desastres' : 'Disaster Response Awareness',
    context: lang === 'es'
      ? 'Evaluación de pasos de satélites de observación terrestre y SAR para capacidades rápidas de evaluación de daños.'
      : 'Evaluating Earth observation and SAR satellite passes for rapid damage assessment capabilities.',
    relevantGroups: ['science', 'weather'],
    relevantBands: ['LEO'],
    relevantRegions: [],
    visibleCount: disasterCount,
    insight: lang === 'es'
      ? `${disasterCount} satélites científicos/EO actualmente en órbita terrestre baja capaces de revisión rápida.`
      : `${disasterCount} science/EO satellites currently in low Earth orbit capable of rapid revisit.`,
    operationalRelevance: lang === 'es'
      ? 'Relevante para portafolios de mapeo de inundaciones, seguimiento de incendios forestales y evaluación de daños por terremotos.'
      : 'Relevant to flood mapping, wildfire tracking, and earthquake damage-assessment portfolios.',
    caveat: lang === 'es'
      ? 'Inteligencia de portafolio determinista basada en TLE públicos.'
      : 'Deterministic portfolio intelligence based on public TLEs.',
    recommendedAction: { type: 'filter_by_band', band: 'LEO' }
  };

  // LEO Density
  const leoCount = countSatellites([], ['LEO'], []);
  const leoDensityScore = Math.min(100, Math.round((leoCount / N) * 100)); // % of catalog in LEO
  const leoScenario: MissionScenario = {
    id: 'LEO_Density',
    title: lang === 'es' ? 'Densidad de Constelaciones LEO' : 'LEO Constellation Density',
    context: lang === 'es'
      ? 'Análisis del hacinamiento orbital y la densidad de mega-constelaciones en la órbita terrestre baja.'
      : 'Analyzing orbital crowding and mega-constellation density in Low Earth Orbit.',
    relevantGroups: ['starlink', 'leo'],
    relevantBands: ['LEO'],
    relevantRegions: [],
    visibleCount: leoCount,
    insight: lang === 'es'
      ? `LEO representa el ${leoDensityScore}% del catálogo visible actualmente.`
      : `LEO accounts for ${leoDensityScore}% of the currently visible catalog.`,
    operationalRelevance: lang === 'es'
      ? 'La alta densidad pública en LEO aumenta la presión analítica de portafolio y la interferencia potencial en astronomía óptica.'
      : 'High public LEO density increases analytical portfolio pressure and potential optical astronomy interference.',
    caveat: lang === 'es'
      ? 'Los indicadores de densidad son señales analíticas de portafolio, no métricas de seguridad de vuelo.'
      : 'Density indicators are analytical portfolio signals, not flight-safety metrics.',
    recommendedAction: { type: 'filter_by_band', band: 'LEO' },
    riskSignal: {
      category: 'LEO_Density',
      score: leoDensityScore,
      level: getLevel(leoDensityScore), // High % = high density pressure
      explanation: lang === 'es'
        ? `${leoCount} objetos en LEO creando una presión de densidad orbital significativa.`
        : `${leoCount} objects in LEO creating significant orbital density pressure.`,
      assumptions: lang === 'es'
        ? ['Cuenta todos los objetos con altitud < 2000 km.']
        : ['Counts all objects with altitude < 2000km.'],
      recommendedAction: lang === 'es' ? 'Investigar la densidad en la banda LEO.' : 'Investigate LEO band density.',
      caveat: lang === 'es' ? 'No para evaluación de conjunciones, seguridad de vuelo ni decisiones operacionales aeroespaciales.' : 'Not for conjunction assessment, flight safety or operational aerospace decisions.'
    }
  };

  // Executive Snapshot
  const execScenario: MissionScenario = {
    id: 'Executive_Snapshot',
    title: lang === 'es' ? 'Resumen Ejecutivo de Infraestructura Espacial' : 'Executive Space Infrastructure Snapshot',
    context: lang === 'es'
      ? 'Descripción general agregada de alto nivel de la infraestructura espacial pública observada.'
      : 'High-level aggregated overview of observed public space infrastructure.',
    relevantGroups: [],
    relevantBands: [],
    relevantRegions: [],
    visibleCount: CS.N,
    insight: lang === 'es'
      ? `Rastreando un total de ${CS.N.toLocaleString()} objetos espaciales en todos los regímenes.` + simNote
      : `Tracking ${CS.N.toLocaleString()} total space objects across all regimes.` + simNote,
    operationalRelevance: lang === 'es'
      ? 'Conciencia situacional de portafolio sobre infraestructura orbital pública activa.'
      : 'Portfolio situational awareness of active public orbital infrastructure.',
    caveat: lang === 'es'
      ? 'Datos orbitales públicos en tiempo casi real donde estén disponibles; el catálogo representativo puede estar activo.'
      : 'Near-real-time public orbital data where available; representative fallback catalog may be active.',
    recommendedAction: { type: 'executive_brief' }
  };

  if (simNote) {
    [gnssScenario, latamScenario, weatherScenario, disasterScenario, leoScenario].forEach(s => {
      s.insight += simNote;
      s.caveat = lang === 'es'
        ? 'Simulación de escenario activa. La precisión puede degradarse lejos de la época TLE. ' + s.caveat
        : 'Scenario simulation active. Accuracy may degrade away from TLE epoch. ' + s.caveat;
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
