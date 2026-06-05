// ============================================================
// OrbitIQ — deterministic AI command agent
//
// Returns the SAME structured contract a real LLM backend would,
// enabling a drop-in swap in v0.3.0 without touching the UI.
// ============================================================
import { REGIONS } from '../regions/regions';
import { GROUPS } from '../data/groups';
import type {
  AiAgentResponse, AgentActions, ExecutiveBrief, GroupKey, BandKey,
} from '../types';

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
});

// ---- Main parse -----------------------------------------------------------

export function parse(rawQuery: string, ctx: AgentContext): AiAgentResponse {
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
    return makeResponse(answer, intent, confidence, assumptions, a, ctx);
  }

  // ---- Most crowded band -------------------------------------------------
  if (/most crowded|busiest|densest|crowded/.test(q)) {
    intent = 'crowding'; confidence = 0.97;
    const leo = ctx.count((s) => s.band === 'LEO');
    const meo = ctx.count((s) => s.band === 'MEO');
    const geo = ctx.count((s) => s.band === 'GEO');
    const top: BandKey = leo >= meo && leo >= geo ? 'LEO' : meo >= geo ? 'MEO' : 'GEO';
    a.band = top;
    answer = `${top} is the most crowded band right now — LEO ${leo.toLocaleString()}, MEO ${meo.toLocaleString()}, GEO ${geo.toLocaleString()} objects. Filtering to ${top}.`;
    assumptions.push('Counts reflect objects currently propagated and visible.');
    return makeResponse(answer, intent, confidence, assumptions, a, ctx);
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
    return makeResponse(answer, intent, confidence, assumptions, a, ctx);
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

  confidence = 0.34;
  return {
    answer: "I couldn't map that to an action yet. Try a constellation (\"Starlink\"), " +
      'a region ("over Japan"), a band ("GEO"), an altitude ("below 600 km"), ' +
      'or ask for an executive brief.',
    intent: 'unknown', confidence, assumptions: [],
    actions: a, filtersApplied: {}, visibleCount: ctx.rendered, sourceMode: 'fallback',
  };
}

function makeResponse(
  answer: string, intent: string, confidence: number,
  assumptions: string[], actions: AgentActions, ctx: AgentContext
): AiAgentResponse {
  return {
    answer, intent, confidence, assumptions, actions,
    filtersApplied: buildFiltersApplied(actions),
    visibleCount: ctx.rendered,
    sourceMode: 'fallback',
  };
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

// ---- Executive brief -------------------------------------------------------

export function generateBrief(ctx: {
  total: number;
  rendered: number;
  groupCounts: Record<string, number>;
  bandCounts: { LEO: number; MEO: number; GEO: number };
  groupLabel: (g: GroupKey) => string;
}): ExecutiveBrief {
  const { rendered, total, groupCounts: g, bandCounts } = ctx;
  const pct = (n: number) => rendered ? Math.round((n / rendered) * 100) : 0;
  const topGroupEntry = Object.entries(g).sort((a, b) => b[1] - a[1])[0];

  return {
    headline: `${rendered.toLocaleString()} of ${total.toLocaleString()} tracked objects in view`,
    sections: [
      {
        title: 'Constellation activity',
        body: `Starlink dominates with ${(g['starlink'] ?? 0).toLocaleString()} objects (${pct(g['starlink'] ?? 0)}% of the view), reflecting ongoing commercial LEO broadband build-out. GNSS contributes ${(g['gnss'] ?? 0).toLocaleString()} navigation payloads across MEO, and ${(g['geo'] ?? 0).toLocaleString()} GEO communications assets hold the equatorial belt.`,
      },
      {
        title: 'Orbital band distribution',
        body: `LEO ${bandCounts.LEO.toLocaleString()} (${pct(bandCounts.LEO)}%), MEO ${bandCounts.MEO.toLocaleString()} (${pct(bandCounts.MEO)}%), GEO ${bandCounts.GEO.toLocaleString()} (${pct(bandCounts.GEO)}%). The picture is LEO-weighted — congestion, conjunction and debris risk concentrate below 2,000 km.`,
      },
      {
        title: 'Regional concentration',
        body: 'Coverage density follows population and economic centers; mid-latitude inclinations (~53°) cluster passes over North America, Europe and East Asia, while polar/sun-synchronous weather and imaging assets service the full latitude range.',
      },
      {
        title: 'Operational relevance',
        body: `The dominant operational theme is the largest population, ${topGroupEntry ? ctx.groupLabel(topGroupEntry[0] as GroupKey) : 'LEO'}. For an operator this view supports situational awareness, coverage planning and constellation benchmarking — not collision avoidance.`,
      },
      {
        title: 'Limitations of public TLE data',
        body: 'Positions derive from public two-line elements propagated with SGP4. Element sets age, maneuvers are not reflected, and accuracy degrades with time since epoch. This view is for portfolio, education and situational awareness only — never flight safety or operational conjunction assessment.',
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
