// ============================================================
// OrbitIQ v0.3.0 — deterministic AI command agent
//
// Returns the SAME structured contract a real LLM backend would,
// enabling a drop-in swap without touching the UI.
// ============================================================
import { REGIONS } from '../regions/regions';
import { GROUPS } from '../data/groups';
import {
  getIntelligence, getConstellationIntelligence,
  compareBands, compareGroups,
} from '../intelligence/intelligence';
import type {
  AiAgentResponse, AgentActions, ExecutiveBrief, GroupKey, BandKey,
  DataMode, IntelligenceSummary, AiAgentIntelligence, LlmAgentResponse, MissionScenarioType
} from '../types';
import { CS } from '../state/catalogStore';

// ---- Helpers ---------------------------------------------------------------

interface SatSnapshot {
  group: GroupKey;
  band: BandKey;
  alt: number;
  lat: number;
  lon: number;
}

export interface AgentContext {
  count: (fn: (s: SatSnapshot) => boolean) => number;
  find: (query: string) => { satnum: number; name: string } | null;
  groupLabel: (g: GroupKey) => string;
  regionCount: (key: string, groups?: GroupKey[] | null) => number;
  total: number;
  rendered: number;
  groupCounts: Record<string, number>;
  bandCounts: { LEO: number; MEO: number; GEO: number };
}

const GROUP_WORDS: Record<string, string[]> = {
  starlink: ['starlink'],
  stations: ['station', 'iss', 'tiangong', 'css', 'crew'],
  gnss:     ['gnss', 'gps', 'galileo', 'glonass', 'beidou', 'navigation', 'nav'],
  weather:  ['weather', 'noaa', 'goes', 'metop', 'meteorolog'],
  science:  ['science', 'hubble', 'landsat', 'sentinel', 'earth observation', 'imaging'],
  geo:      ['geo', 'geostationary', 'geosynchronous'],
  meo:      ['meo'],
  leo:      ['leo', 'low earth'],
};

function detectGroups(q: string): GroupKey[] {
  const hits: GroupKey[] = [];
  for (const [g, words] of Object.entries(GROUP_WORDS)) {
    if (words.some((w) => q.includes(w))) hits.push(g as GroupKey);
  }
  return hits;
}

function detectRegion(q: string): string | null {
  const map: Record<string, string[]> = {
    japan:         ['japan', 'tokyo'],
    latam:         ['latam', 'latin america', 'south america'],
    usa:           ['usa', 'united states', 'america', 'u.s.'],
    europe:        ['europe', 'eu'],
    africa:        ['africa'],
    middle_east:   ['middle east', 'gulf'],
    south_asia:    ['india', 'south asia'],
    east_asia:     ['china', 'east asia', 'korea'],
    sea:           ['southeast asia'],
    oceania:       ['australia', 'oceania', 'pacific'],
    arctic:        ['arctic', 'pole'],
    equator:       ['equator', 'equatorial'],
    north_america: ['north america'],
  };
  for (const [key, words] of Object.entries(map)) {
    if (words.some((w) => q.includes(w))) return key;
  }
  return null;
}

function detectAltitude(q: string): { altMin: number | null; altMax: number | null } {
  const m = q.match(/(below|under|less than|lower than|above|over|higher than|greater than)\s*(\d{2,6})\s*(km)?/);
  if (!m) return { altMin: null, altMax: null };
  const v = +m[2];
  if (/below|under|less|lower/.test(m[1])) return { altMin: null, altMax: v };
  return { altMin: v, altMax: null };
}

const blankActions = (): AgentActions => ({
  groups: null, band: null, region: null,
  altMax: null, altMin: null, focusSatnum: null, brief: false,
  missionScenario: null, showRiskLayer: false,
  timeAction: null,
});

/** Build intelligence attachment for the response. */
function buildIntelAttachment(intel: IntelligenceSummary): AiAgentIntelligence {
  const bandBreakdown: Record<string, number> = {};
  for (const b of intel.bands) bandBreakdown[b.band] = b.count;
  const regionBreakdown: Record<string, number> = {};
  for (const r of intel.regions.slice(0, 6)) regionBreakdown[r.label] = r.count;

  return {
    mostCrowdedBand: intel.mostCrowdedBand,
    highestConcentrationRegion: intel.highestConcentrationRegion,
    dominantGroup: intel.dominantGroup,
    congestionScore: intel.congestionScore,
    congestionLevel: intel.congestionLevel,
    bandBreakdown,
    regionBreakdown,
  };
}

// ---- Main deterministic parse -----------------------------------------------

export function deterministicParse(rawQuery: string, ctx: AgentContext): AiAgentResponse {
  const q = (rawQuery ?? '').toLowerCase().trim();
  const a = blankActions();
  let intent = 'unknown';
  let answer = '';
  let confidence = 0.94;
  const assumptions: string[] = ['Interpreted from current propagated snapshot (live SGP4 positions).'];

  if (!q) {
    return {
      answer: 'Ask me to filter, locate or brief the orbital picture.',
      intent: 'idle', confidence: 0, assumptions: [],
      actions: a, filtersApplied: {}, visibleCount: ctx.rendered, sourceMode: 'fallback',
    };
  }

  // ---- Executive brief ---------------------------------------------------
  if (/\bbrief\b|executive|summary|overview|picture|situation/.test(q) && !/which|where|over/.test(q)) {
    a.brief = true; intent = 'executive_brief'; confidence = 0.99;
    answer = 'Opening the executive brief of the current orbital picture.';
    return makeResponse(answer, intent, confidence, assumptions, a, ctx, true);
  }

  // ---- Congestion / density query ----------------------------------------
  if (/congestion|density|how crowded|crowded is|concentration level|orbital density/.test(q) && !/most crowded/.test(q)) {
    intent = 'congestion_summary'; confidence = 0.96;
    const intel = getIntelligence();
    answer = `Current orbital congestion score: ${intel.congestionScore}/100 (${intel.congestionLevel}). ` +
      `${intel.mostCrowdedBand} is the most populated band with ${intel.bands.find((b) => b.band === intel.mostCrowdedBand)?.count.toLocaleString() ?? '?'} objects. ` +
      `Highest regional concentration: ${REGIONS[intel.highestConcentrationRegion]?.label ?? intel.highestConcentrationRegion}. ` +
      'This is an analytical portfolio signal, not a flight-safety metric.';
    assumptions.push('Congestion score is a weighted composite of density, band concentration, region concentration, and constellation dominance.');
    return makeResponse(answer, intent, confidence, assumptions, a, ctx, true);
  }

  // ---- Time Controls & Simulation ----------------------------------------
  if (/simulation brief|what changes/i.test(q)) {
    const match = q.match(/(\d+)\s+(hour|minute|min|hr|h|m)/i);
    if (match) {
      const amt = parseInt(match[1], 10);
      const isHour = match[2].toLowerCase().startsWith('h');
      const offsetMs = isHour ? amt * 3600000 : amt * 60000;
      a.timeAction = { type: 'jump_time', offsetMs };
    }
    
    if (/latam|latin america/.test(q)) {
      a.missionScenario = 'LATAM_Connectivity';
    } else {
      a.brief = true;
    }
    intent = 'generate_simulation_brief'; confidence = 0.98;
    answer = 'Generating simulation brief...';
    return makeResponse(answer, intent, confidence, assumptions, a, ctx, true);
  }
  
  if (/(fast forward|jump ahead|skip ahead|jump|forward|ahead)\s+(\d+)\s+(hour|minute|min|hr|h|m)/i.test(q)) {
    const match = q.match(/(fast forward|jump ahead|skip ahead|jump|forward|ahead)\s+(\d+)\s+(hour|minute|min|hr|h|m)/i);
    if (match) {
      const amt = parseInt(match[2], 10);
      const isHour = match[3].toLowerCase().startsWith('h');
      const offsetMs = isHour ? amt * 3600000 : amt * 60000;
      a.timeAction = { type: 'jump_time', offsetMs };
      intent = 'jump_time'; confidence = 0.98;
      answer = `Jumping simulation forward by ${amt} ${isHour ? 'hours' : 'minutes'}.`;
      return makeResponse(answer, intent, confidence, assumptions, a, ctx, false);
    }
  }
  if (/(rewind|jump back|go back|back)\s+(\d+)\s+(hour|minute|min|hr|h|m)/i.test(q)) {
    const match = q.match(/(rewind|jump back|go back|back)\s+(\d+)\s+(hour|minute|min|hr|h|m)/i);
    if (match) {
      const amt = parseInt(match[2], 10);
      const isHour = match[3].toLowerCase().startsWith('h');
      const offsetMs = -(isHour ? amt * 3600000 : amt * 60000);
      a.timeAction = { type: 'jump_time', offsetMs };
      intent = 'jump_time'; confidence = 0.98;
      answer = `Jumping simulation backward by ${amt} ${isHour ? 'hours' : 'minutes'}.`;
      return makeResponse(answer, intent, confidence, assumptions, a, ctx, false);
    }
  }
  if (/pause|stop|halt/i.test(q) && /simulation|time/i.test(q)) {
    a.timeAction = { type: 'pause_simulation' };
    intent = 'pause_simulation'; confidence = 0.95;
    answer = 'Pausing orbital simulation.';
    return makeResponse(answer, intent, confidence, assumptions, a, ctx, false);
  }
  if (/resume|play|continue/i.test(q) && /simulation|time/i.test(q)) {
    a.timeAction = { type: 'resume_simulation' };
    intent = 'resume_simulation'; confidence = 0.95;
    answer = 'Resuming orbital simulation.';
    return makeResponse(answer, intent, confidence, assumptions, a, ctx, false);
  }
  if (/reset|real time|live|now/i.test(q) && !/reset view|clear/.test(q)) {
    a.timeAction = { type: 'reset_to_now' };
    intent = 'reset_to_now'; confidence = 0.95;
    answer = 'Resetting simulation to live real-time state.';
    return makeResponse(answer, intent, confidence, assumptions, a, ctx, false);
  }

  // ---- Mission Scenarios & Risk ------------------------------------------
  if (/gnss dependency|gnss brief|pnt/.test(q)) {
    a.missionScenario = 'GNSS_Dependency'; intent = 'generate_mission_brief'; confidence = 0.95;
    answer = 'Loading GNSS Dependency Mission Brief.';
    return makeResponse(answer, intent, confidence, assumptions, a, ctx, false);
  }
  if (/latam|latin america/.test(q) && /connectivity|resilience|brief/.test(q)) {
    a.missionScenario = 'LATAM_Connectivity'; intent = 'generate_mission_brief'; confidence = 0.95;
    answer = 'Loading LATAM Connectivity Resilience Brief.';
    return makeResponse(answer, intent, confidence, assumptions, a, ctx, false);
  }
  if (/weather|meteorological/.test(q) && /brief|scenario/.test(q)) {
    a.missionScenario = 'Weather_Visibility'; intent = 'generate_mission_brief'; confidence = 0.95;
    answer = 'Loading Weather Satellite Visibility Brief.';
    return makeResponse(answer, intent, confidence, assumptions, a, ctx, false);
  }
  if (/disaster|sar|earth observation/.test(q) && /brief|scenario/.test(q)) {
    a.missionScenario = 'Disaster_Response'; intent = 'generate_mission_brief'; confidence = 0.95;
    answer = 'Loading Disaster Response Awareness Brief.';
    return makeResponse(answer, intent, confidence, assumptions, a, ctx, false);
  }
  if (/risk|infrastructure risk|space infrastructure/.test(q)) {
    a.showRiskLayer = true; intent = 'show_risk_layer'; confidence = 0.92;
    answer = 'Opening the Space Infrastructure Risk Layer. These are deterministic scenario indicators, not operational flight-safety metrics.';
    return makeResponse(answer, intent, confidence, assumptions, a, ctx, false);
  }

  // ---- Compare bands -----------------------------------------------------
  if (/compare|vs\.?|versus/.test(q) && /\bleo\b|\bmeo\b|\bgeo\b/.test(q)) {
    const bandMatches: BandKey[] = [];
    if (/\bleo\b|low earth/.test(q)) bandMatches.push('LEO');
    if (/\bmeo\b/.test(q)) bandMatches.push('MEO');
    if (/\bgeo\b|geostationary/.test(q)) bandMatches.push('GEO');

    // Check if groups are also being compared
    const groups = detectGroups(q).filter((g) => !['leo', 'meo', 'geo'].includes(g));
    if (groups.length >= 2) {
      intent = 'compare_groups'; confidence = 0.95;
      answer = compareGroups(groups[0], groups[1]);
      assumptions.push('Comparison based on current propagated snapshot.');
      return makeResponse(answer, intent, confidence, assumptions, a, ctx, true);
    }

    if (bandMatches.length >= 2) {
      intent = 'compare_bands'; confidence = 0.96;
      answer = compareBands(bandMatches[0], bandMatches[1]);
      assumptions.push('Comparison based on current propagated snapshot.');
      return makeResponse(answer, intent, confidence, assumptions, a, ctx, true);
    }
  }

  // ---- Compare groups (without bands) ------------------------------------
  if (/compare|vs\.?|versus/.test(q)) {
    const groups = detectGroups(q);
    if (groups.length >= 2) {
      intent = 'compare_groups'; confidence = 0.95;
      answer = compareGroups(groups[0], groups[1]);
      assumptions.push('Comparison based on current propagated snapshot.');
      return makeResponse(answer, intent, confidence, assumptions, a, ctx, true);
    }
  }

  // ---- Most crowded band -------------------------------------------------
  if (/most crowded|busiest|densest|crowded/.test(q)) {
    intent = 'crowding'; confidence = 0.97;
    const intel = getIntelligence();
    const b = intel.bands;
    a.band = intel.mostCrowdedBand;
    answer = `${intel.mostCrowdedBand} is the most crowded band right now — ` +
      b.map((x) => `${x.band} ${x.count.toLocaleString()}`).join(', ') +
      ` objects. Filtering to ${intel.mostCrowdedBand}.`;
    assumptions.push('Counts reflect objects currently propagated and visible.');
    return makeResponse(answer, intent, confidence, assumptions, a, ctx, true);
  }

  // ---- Highest concentration region --------------------------------------
  if (/which region|highest.*concentration|most.*satellites.*region|busiest region/.test(q)) {
    intent = 'highest_concentration_region'; confidence = 0.95;
    const intel = getIntelligence();
    const top = intel.regions[0]; // already sorted by count
    a.region = top.key;
    answer = `${top.label} has the highest satellite concentration with ${top.count.toLocaleString()} objects currently overhead. ` +
      `Dominant band: ${top.dominantBand}. ` +
      `Top constellations: ${top.topGroups.slice(0, 3).map((g) => `${(GROUPS[g.group] ?? GROUPS['other']).label} (${g.count})`).join(', ')}.`;
    assumptions.push('Based on sub-satellite point inside region bounding box at this instant.');
    return makeResponse(answer, intent, confidence, assumptions, a, ctx, true);
  }

  // ---- Constellation intelligence ----------------------------------------
  if (/summarize|coverage|intelligence|insight|analyze|analyz/.test(q)) {
    const groups = detectGroups(q);
    if (groups.length === 1) {
      intent = 'constellation_intelligence'; confidence = 0.95;
      const ci = getConstellationIntelligence(groups[0]);
      const label = (GROUPS[groups[0]] ?? GROUPS['other']).label;
      answer = `${label}: ${ci.count.toLocaleString()} objects, primarily in ${ci.dominantBand} band at avg altitude ${ci.avgAlt.toLocaleString()} km. ` +
        `Highest concentration region: ${ci.topRegion}. ${ci.relevance}`;
      return makeResponse(answer, intent, confidence, assumptions, a, ctx, true);
    }
  }

  // ---- Locate satellite --------------------------------------------------
  if (/\bfind\b|locate|where is|show me the\b/.test(q) || /\biss\b/.test(q)) {
    const searchTerm = q.replace(/find|locate|where is|show me the|the/g, '').trim();
    const hit = ctx.find(searchTerm) ?? (/\biss\b/.test(q) ? ctx.find('iss') : null);
    if (hit) {
      a.focusSatnum = hit.satnum; intent = 'locate_satellite'; confidence = 0.99;
      answer = `Located ${hit.name} (NORAD ${hit.satnum}). Flying to it and drawing its orbit.`;
      assumptions.length = 0; assumptions.push('Match by name/ID against the loaded catalog.');
      return makeResponse(answer, intent, confidence, assumptions, a, ctx);
    }
  }

  // ---- Region query -------------------------------------------------------
  const region = detectRegion(q);
  if (region && /over|above|which|where|near|across/.test(q)) {
    a.region = region;
    const groups = detectGroups(q);
    if (groups.length) a.groups = groups;
    intent = 'region_query'; confidence = 0.95;
    const n = ctx.regionCount(region, a.groups);
    const lbl = REGIONS[region]?.label ?? region;
    answer = `${n.toLocaleString()} satellites are currently over ${lbl}` +
      (groups.length ? ` in ${groups.map(ctx.groupLabel).join(', ')}` : '') +
      '. Highlighting them and marking the region.';
    assumptions.push('Sub-satellite point inside region bounding box at this instant.');
    return makeResponse(answer, intent, confidence, assumptions, a, ctx, true);
  }

  // ---- Region intelligence (without "over/which") -------------------------
  if (region && /intelligence|insight|about|info/.test(q)) {
    intent = 'region_intelligence'; confidence = 0.93;
    const intel = getIntelligence();
    const ri = intel.regions.find((r) => r.key === region);
    if (ri) {
      a.region = region;
      answer = `${ri.label}: ${ri.count.toLocaleString()} satellites currently overhead. ` +
        `Dominant band: ${ri.dominantBand}. ` +
        `Top groups: ${ri.topGroups.map((g) => `${(GROUPS[g.group] ?? GROUPS['other']).label} (${g.count})`).join(', ')}.`;
      return makeResponse(answer, intent, confidence, assumptions, a, ctx, true);
    }
  }

  // ---- Altitude filter ----------------------------------------------------
  const alt = detectAltitude(q);
  if (alt.altMax != null || alt.altMin != null) {
    a.altMax = alt.altMax; a.altMin = alt.altMin;
    const groups = detectGroups(q);
    if (groups.length) a.groups = groups;
    intent = 'altitude_filter'; confidence = 0.96;
    const n = ctx.count((s) =>
      (alt.altMax == null || s.alt <= alt.altMax) &&
      (alt.altMin == null || s.alt >= alt.altMin) &&
      (!a.groups || a.groups.includes(s.group)));
    answer = `${n.toLocaleString()} satellites match ` +
      (alt.altMax != null ? `altitude below ${alt.altMax} km` : `altitude above ${alt.altMin} km`) + '. Filtering the view.';
    assumptions.push('Altitude is instantaneous geodetic height from SGP4.');
    return makeResponse(answer, intent, confidence, assumptions, a, ctx);
  }

  // ---- Band filter --------------------------------------------------------
  if (/\bgeo\b|geostationary/.test(q)) { a.band = 'GEO'; intent = 'band_filter'; }
  else if (/\bmeo\b/.test(q))          { a.band = 'MEO'; intent = 'band_filter'; }
  else if (/\bleo\b|low earth/.test(q)){ a.band = 'LEO'; intent = 'band_filter'; }
  if (a.band) {
    const groups = detectGroups(q).filter((g) => !['leo', 'meo', 'geo'].includes(g));
    if (groups.length) a.groups = groups;
    const n = ctx.count((s) => s.band === a.band && (!a.groups || a.groups.includes(s.group)));
    answer = `Showing ${n.toLocaleString()} ${a.band} objects.`;
    return makeResponse(answer, intent, confidence, assumptions, a, ctx);
  }

  // ---- Group filter -------------------------------------------------------
  const groups = detectGroups(q);
  if (groups.length) {
    a.groups = groups; intent = 'group_filter';
    const n = ctx.count((s) => (a.groups ?? []).includes(s.group));
    answer = `Showing ${n.toLocaleString()} ${groups.map(ctx.groupLabel).join(', ')} satellites.`;
    return makeResponse(answer, intent, confidence, assumptions, a, ctx);
  }

  // ---- Reset --------------------------------------------------------------
  if (/reset|clear|show all|everything|all satellites/.test(q)) {
    intent = 'reset'; confidence = 0.99;
    answer = 'Cleared all filters — showing the full loaded catalog.';
    return makeResponse(answer, intent, confidence, assumptions, a, ctx);
  }

  // ---- Safe fallback ------------------------------------------------------
  confidence = 0.34;
  return {
    answer: "I couldn't map that to an action yet. Try asking about a constellation ('Starlink'), " +
      "a region ('over Japan'), a band ('GEO'), an altitude ('below 600 km'), " +
      "density ('show congestion'), a comparison ('compare LEO vs GEO'), " +
      "or request an executive brief.",
    intent: 'unknown_safe_fallback', confidence, assumptions: [],
    actions: a, filtersApplied: {}, visibleCount: ctx.rendered, sourceMode: 'fallback',
  };
}

function makeResponse(
  answer: string, intent: string, confidence: number,
  assumptions: string[], actions: AgentActions, ctx: AgentContext,
  attachIntel = false,
): AiAgentResponse {
  const resp: AiAgentResponse = {
    answer, intent, confidence, assumptions, actions,
    filtersApplied: buildFiltersApplied(actions),
    visibleCount: ctx.rendered,
    sourceMode: 'fallback',
  };
  if (attachIntel) {
    resp.intelligence = buildIntelAttachment(getIntelligence());
  }
  return resp;
}

function buildFiltersApplied(a: AgentActions): Record<string, unknown> {
  const f: Record<string, unknown> = {};
  if (a.groups)             f.groups = a.groups;
  if (a.band)               f.band = a.band;
  if (a.region)             f.region = a.region;
  if (a.altMax != null)     f.altMax = a.altMax;
  if (a.altMin != null)     f.altMin = a.altMin;
  if (a.focusSatnum != null)f.focusSatnum = a.focusSatnum;
  if (a.brief)              f.brief = true;
  return f;
}

// ---- LLM execute wrapper ---------------------------------------------------

export async function executeAgentCommand(rawQuery: string, ctx: AgentContext, lang: 'en' | 'es'): Promise<AiAgentResponse> {
  if (!rawQuery.trim()) {
    return { ...deterministicParse(rawQuery, ctx), responseMode: 'deterministic' };
  }

  try {
    const intel = getIntelligence();
    const payload = {
      query: rawQuery,
      context: {
        language: lang,
        total: ctx.total,
        rendered: ctx.rendered,
        groupCounts: ctx.groupCounts,
        bandCounts: ctx.bandCounts,
        intelligenceSummary: buildIntelAttachment(intel),
      }
    };

    const res = await fetch('/api/agent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10_000)
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }

    const llmResp: LlmAgentResponse = await res.json();
    
    // Map LlmAgentResponse to AiAgentResponse
    const a = blankActions();
    for (const action of llmResp.actions) {
      if (action.type === 'filter_by_group') {
        const groups = detectGroups(action.group);
        if (groups.length) a.groups = [...(a.groups || []), ...groups];
      }
      else if (action.type === 'filter_by_region') {
        const region = detectRegion(action.region);
        if (region) a.region = region;
      }
      else if (action.type === 'filter_by_band') {
        if (action.band !== 'OTHER' && action.band !== 'UNKNOWN') {
          a.band = action.band;
        }
      }
      else if (action.type === 'altitude_threshold') {
        if (action.operator === 'below') a.altMax = action.km;
        if (action.operator === 'above') a.altMin = action.km;
      }
      else if (action.type === 'find_satellite') {
        const hit = ctx.find(action.query);
        if (hit) a.focusSatnum = hit.satnum;
      }
      else if (action.type === 'executive_brief') {
        a.brief = true;
      }
      else if (action.type === 'reset_view') {
        // blankActions handles reset
      }
      else if (action.type === 'congestion_summary' || action.type === 'compare_bands' || action.type === 'compare_groups') {
        // these are informational intents, they don't apply filters (except maybe highest region or most crowded band)
        // If LLM wants to filter, it explicitly returned a filter action
      }
      else if (action.type === 'generate_mission_brief' || action.type === 'select_mission_scenario') {
        a.missionScenario = action.scenario as MissionScenarioType;
      }
      else if (action.type === 'show_risk_layer') {
        a.showRiskLayer = true;
      }
      else if (action.type === 'highlight_relevant_groups') {
        a.groups = action.groups as GroupKey[];
      }
      else if (action.type === 'highlight_relevant_region') {
        a.region = action.region;
      }
      else if (['set_time_mode', 'set_time_speed', 'jump_time', 'reset_to_now', 'pause_simulation', 'resume_simulation'].includes(action.type)) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        a.timeAction = action as any;
      }
      else if (action.type === 'recommend_next_view') {
        // LLM decided to recommend a view, just handled as an answer
      }
    }

    const finalRes: AiAgentResponse = {
      answer: llmResp.answer,
      intent: llmResp.intent,
      confidence: llmResp.confidence,
      assumptions: llmResp.assumptions,
      actions: a,
      filtersApplied: buildFiltersApplied(a),
      visibleCount: llmResp.visibleCount || ctx.rendered,
      sourceMode: llmResp.sourceMode as DataMode,
      responseMode: 'llm',
      safetyCaveat: llmResp.safetyCaveat,
      intelligence: buildIntelAttachment(intel),
    };

    return finalRes;
  } catch (error) {
    console.error('LLM agent failed, falling back to deterministic router:', error);
    const fallbackRes = deterministicParse(rawQuery, ctx);
    fallbackRes.responseMode = 'deterministic';
    
    // Import DICT to safely grab the string without risking React context issues
    // Actually we can just hardcode a generic fallback caveat here, or if DICT is available:
    fallbackRes.safetyCaveat = lang === 'es' ? 'Error de red — reintentando localmente' : 'Request failed — retrying locally';
    
    return fallbackRes;
  }
}

import { getMissionScenarios } from '../intelligence/risk';

// ---- Executive brief v3 ----------------------------------------------------

export function generateBrief(ctx: {
  total: number;
  rendered: number;
  groupCounts: Record<string, number>;
  bandCounts: { LEO: number; MEO: number; GEO: number };
  groupLabel: (g: GroupKey) => string;
  dataMode: DataMode;
  intelligence: IntelligenceSummary;
}): ExecutiveBrief {
  const { rendered, total, groupCounts: g, bandCounts, intelligence: intel, dataMode } = ctx;
  const pct = (n: number) => rendered ? Math.round((n / rendered) * 100) : 0;
  const topGroupEntry = Object.entries(g).sort((a, b) => b[1] - a[1])[0];
  const topRegion = intel.regions[0];

  const scenarios = Object.values(getMissionScenarios());
  // Find highest risk signal
  let highestRisk = null;
  for (const s of scenarios) {
    if (s.riskSignal) {
      if (!highestRisk || s.riskSignal.score > highestRisk.score) {
        highestRisk = s.riskSignal;
      }
    }
  }

  const sourceLabel = dataMode === 'live' ? 'Live CelesTrak public TLE data'
    : dataMode === 'cached' ? 'Cached CelesTrak public TLE data'
    : 'Representative demo catalog';

  const isSimulated = CS.liveSnapshot != null;
  const simOffsetHours = isSimulated ? ((CS.simTimestampMs - Date.now()) / 3600000).toFixed(1) : '0';
  const pictureTitle = isSimulated ? 'Simulated orbital picture' : 'Current orbital picture';
  const pictureBody = isSimulated 
    ? `Source: ${sourceLabel}. ${total.toLocaleString()} objects loaded, ${rendered.toLocaleString()} rendered. SIMULATION MODE ACTIVE: Time offset is ${simOffsetHours} hours from live.`
    : `Source: ${sourceLabel}. ${total.toLocaleString()} objects loaded, ${rendered.toLocaleString()} currently rendered and propagated in near-real-time via SGP4.`;

  return {
    headline: `${rendered.toLocaleString()} of ${total.toLocaleString()} tracked objects in view`,
    sections: [
      {
        title: pictureTitle,
        body: pictureBody,
      },
      {
        title: 'Key concentration',
        body: `${intel.mostCrowdedBand} is the most crowded band with ${intel.bands.find((b) => b.band === intel.mostCrowdedBand)?.count.toLocaleString() ?? '?'} objects ` +
          `(${intel.bands.find((b) => b.band === intel.mostCrowdedBand)?.pct ?? 0}% of visible). ` +
          `Band distribution: LEO ${bandCounts.LEO.toLocaleString()} (${pct(bandCounts.LEO)}%), ` +
          `MEO ${bandCounts.MEO.toLocaleString()} (${pct(bandCounts.MEO)}%), ` +
          `GEO ${bandCounts.GEO.toLocaleString()} (${pct(bandCounts.GEO)}%).`,
      },
      {
        title: 'Regional hotspot',
        body: topRegion
          ? `${topRegion.label} shows the highest satellite concentration with ${topRegion.count.toLocaleString()} objects currently overhead. ` +
            `Dominant band: ${topRegion.dominantBand}. Top groups: ${topRegion.topGroups.slice(0, 3).map((tg) => `${ctx.groupLabel(tg.group)} (${tg.count})`).join(', ')}.`
          : 'No regional data available.',
      },
      {
        title: 'Infrastructure relevance',
        body: `The dominant operational constellation is ${topGroupEntry ? ctx.groupLabel(topGroupEntry[0] as GroupKey) : 'LEO'} with ` +
          `${topGroupEntry ? topGroupEntry[1].toLocaleString() : '?'} objects (${topGroupEntry ? pct(topGroupEntry[1]) : 0}% of visible). ` +
          `Starlink drives ${pct(g['starlink'] ?? 0)}% of the view, reflecting ongoing commercial LEO build-out. ` +
          `GNSS contributes ${(g['gnss'] ?? 0).toLocaleString()} navigation payloads and ${(g['geo'] ?? 0).toLocaleString()} GEO assets hold the equatorial belt.`,
      },
      {
        title: 'Congestion assessment',
        body: `Orbital congestion score: ${intel.congestionScore}/100 — ${intel.congestionLevel.charAt(0).toUpperCase() + intel.congestionLevel.slice(1)}. ` +
          'This composite score reflects visible satellite density, band concentration, regional clustering and constellation dominance. ' +
          'It is an analytical portfolio signal for situational awareness, not a flight-safety metric or conjunction assessment.',
      },
      {
        title: 'Infrastructure risk signal',
        body: highestRisk 
          ? `Highest risk area detected: ${highestRisk.category.replace('_', ' ')} (${highestRisk.level.toUpperCase()}). ${highestRisk.explanation} ${highestRisk.caveat}`
          : 'No elevated infrastructure risks detected.',
      },
      {
        title: 'Data caveat',
        body: 'Positions derive from public two-line elements propagated with SGP4. Element sets age, maneuvers are not reflected, and accuracy degrades with time since epoch. ' +
          (isSimulated ? 'SCENARIO SIMULATION ACTIVE: Predictive accuracy decays significantly for time offsets > 24 hours. ' : '') +
          'This view is for portfolio, education and situational awareness only — never flight safety or operational conjunction assessment.',
      },
      {
        title: 'Recommended next action',
        body: highestRisk
          ? `${highestRisk.recommendedAction} Use the AI agent to "Show the risk layer" or "Generate an executive snapshot" to dig deeper into the space infrastructure portfolio.`
          : `Explore band-level analytics or regional overflight intelligence for deeper situational awareness. Use the AI agent to "Show the risk layer" or compare specific constellations.`,
      },
    ],
  };
}

// ---- Satellite AI relevance blurb -----------------------------------------

const RELEVANCE: Record<string, string> = {
  starlink:  'Commercial LEO broadband node — part of the largest active constellation; drives congestion and conjunction load in the 540–570 km shells.',
  stations:  'Crewed orbital platform — high public-interest asset under continuous tracking and debris-avoidance watch.',
  gnss:      'Positioning, navigation & timing payload — critical infrastructure underpinning finance, logistics and defense timing.',
  weather:   'Environmental monitoring asset — feeds meteorology, climate and early-warning systems.',
  science:   'Earth-observation / science platform — imaging, mapping and research utility.',
  geo:       'Geostationary communications asset — fixed over its sub-longitude for broadcast, data relay and backhaul.',
  meo:       'Medium-orbit communications / navigation asset.',
  leo:       'Low-Earth-orbit object — short revisit time, part of the most crowded operational band.',
  other:     'Tracked orbital object.',
};

export function satelliteRelevance(group: GroupKey): string {
  return RELEVANCE[group] ?? RELEVANCE['other'];
}

// ---- Capability groupLabel helper for use outside the agent ---------------
export function groupLabel(g: GroupKey): string {
  return (GROUPS[g] ?? GROUPS['other']).label;
}
