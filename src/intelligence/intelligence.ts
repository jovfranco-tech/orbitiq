// ============================================================
// OrbitIQ v0.3.0 — Orbital Intelligence Engine
//
// Pure analytical module. Reads from CatalogStore (CS) arrays
// and produces IntelligenceSummary. No React, no state mutations.
// Memoized with configurable TTL to avoid recomputing every tick.
// ============================================================
import { CS } from '../state/catalogStore';
import { REGIONS, matchRegion } from '../regions/regions';
import { GROUPS } from '../data/groups';
import { satelliteRelevance } from '../ai/agent';
import type {
  BandKey, GroupKey, CongestionLevel,
  BandIntelligence, RegionIntelligence, ConstellationIntelligence,
  IntelligenceSummary,
} from '../types';

// ---- Memoization -----------------------------------------------------------

const REFRESH_TTL_MS = 2000; // recompute at most every 2 s
let _cache: IntelligenceSummary | null = null;
let _lastCompute = 0;

/** Get the latest intelligence summary, recomputing if stale. */
export function getIntelligence(forceRefresh = false): IntelligenceSummary {
  const now = Date.now();
  if (!forceRefresh && _cache && now - _lastCompute < REFRESH_TTL_MS) return _cache;
  _cache = computeIntelligence();
  _lastCompute = now;
  return _cache;
}

/** Force-clear the cache (e.g. after catalog reload). */
export function invalidateIntelligence(): void {
  _cache = null;
  _lastCompute = 0;
}

// ---- Core computation ------------------------------------------------------

function computeIntelligence(): IntelligenceSummary {
  const bands = computeBandIntelligence();
  const regions = computeRegionIntelligence();
  const mostCrowdedBand = bands.reduce((a, b) => b.count > a.count ? b : a, bands[0]).band;
  const highestRegion = regions.reduce((a, b) => b.count > a.count ? b : a, regions[0]);
  const dominantGroup = findDominantGroup();
  const congestionScore = computeCongestionScore(bands, highestRegion);
  const congestionLevel = scoreToLevel(congestionScore);

  return {
    bands,
    mostCrowdedBand,
    regions,
    highestConcentrationRegion: highestRegion.key,
    dominantGroup,
    congestionScore,
    congestionLevel,
    timestamp: Date.now(),
  };
}

// ---- Band Intelligence -----------------------------------------------------

function computeBandIntelligence(): BandIntelligence[] {
  const BANDS: BandKey[] = ['LEO', 'MEO', 'GEO'];
  const counts: Record<BandKey, number> = { LEO: 0, MEO: 0, GEO: 0 };
  const altSums: Record<BandKey, number> = { LEO: 0, MEO: 0, GEO: 0 };
  const groupCountsPerBand: Record<BandKey, Record<string, number>> = {
    LEO: {}, MEO: {}, GEO: {},
  };

  let totalValid = 0;
  for (let i = 0; i < CS.N; i++) {
    if (CS.alt[i] < 0) continue;
    const b = CS.band[i];
    if (!b) continue;
    totalValid++;
    counts[b]++;
    altSums[b] += CS.alt[i];
    const g = CS.group[i];
    if (g) {
      groupCountsPerBand[b][g] = (groupCountsPerBand[b][g] ?? 0) + 1;
    }
  }

  return BANDS.map((band) => {
    const c = counts[band];
    const topGroups = Object.entries(groupCountsPerBand[band])
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([group, count]) => ({ group: group as GroupKey, count }));

    return {
      band,
      count: c,
      pct: totalValid > 0 ? Math.round((c / totalValid) * 100) : 0,
      avgAlt: c > 0 ? Math.round(altSums[band] / c) : 0,
      topGroups,
    };
  });
}

// ---- Region Intelligence ---------------------------------------------------

function computeRegionIntelligence(): RegionIntelligence[] {
  const regionKeys = Object.keys(REGIONS);
  const results: RegionIntelligence[] = [];

  for (const key of regionKeys) {
    const r = REGIONS[key];
    const bandCounts: Record<BandKey, number> = { LEO: 0, MEO: 0, GEO: 0 };
    const groupCounts: Record<string, number> = {};
    let total = 0;

    for (let i = 0; i < CS.N; i++) {
      if (CS.alt[i] < 0) continue;
      const b = CS.band[i];
      if (!b) continue;
      if (!matchRegion(CS.lat[i], CS.lon[i], key)) continue;
      total++;
      bandCounts[b]++;
      const g = CS.group[i];
      if (g) {
        groupCounts[g] = (groupCounts[g] ?? 0) + 1;
      }
    }

    const dominantBand = (Object.entries(bandCounts) as [BandKey, number][])
      .sort((a, b) => b[1] - a[1])[0][0];

    const topGroups = Object.entries(groupCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([group, count]) => ({ group: group as GroupKey, count }));

    results.push({
      key,
      label: r.label,
      count: total,
      dominantBand,
      topGroups,
    });
  }

  return results.sort((a, b) => b.count - a.count);
}

// ---- Constellation Intelligence -------------------------------------------

export function getConstellationIntelligence(group: GroupKey): ConstellationIntelligence {
  let count = 0;
  let altSum = 0;
  const bandCounts: Record<BandKey, number> = { LEO: 0, MEO: 0, GEO: 0 };
  const regionCounts: Record<string, number> = {};

  for (let i = 0; i < CS.N; i++) {
    if (CS.alt[i] < 0 || CS.group[i] !== group) continue;
    count++;
    altSum += CS.alt[i];
    const b = CS.band[i];
    if (b) bandCounts[b]++;
    for (const key of Object.keys(REGIONS)) {
      if (matchRegion(CS.lat[i], CS.lon[i], key)) {
        regionCounts[key] = (regionCounts[key] ?? 0) + 1;
        break; // first match only
      }
    }
  }

  const dominantBand = (Object.entries(bandCounts) as [BandKey, number][])
    .sort((a, b) => b[1] - a[1])[0][0];

  const topRegionKey = Object.entries(regionCounts)
    .sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
  const topRegion = REGIONS[topRegionKey]?.label ?? 'Global';

  return {
    group,
    count,
    dominantBand,
    avgAlt: count > 0 ? Math.round(altSum / count) : 0,
    topRegion,
    relevance: satelliteRelevance(group),
  };
}

// ---- Congestion Score ------------------------------------------------------
//
// Weighted composite (0–100):
//   40% — visible satellite density (rendered / total)
//   30% — band concentration (Herfindahl index)
//   20% — region concentration (regionCount / rendered, if region filtered)
//   10% — constellation dominance (top group share)
//
// This is a portfolio/demo analytical signal, NOT a flight-safety metric.
// ============================================================================

function computeCongestionScore(
  bands: BandIntelligence[],
  highestRegion: RegionIntelligence,
): number {
  const totalValid = bands.reduce((s, b) => s + b.count, 0);
  if (totalValid === 0) return 0;

  // 1. Density factor: how many are visible vs total catalog
  const densityFactor = CS.N > 0 ? Math.min(totalValid / CS.N, 1) : 0;

  // 2. Band concentration (Herfindahl index: sum of squared shares)
  //    HHI = 1.0 means all in one band (max concentration)
  //    HHI ≈ 0.33 means even split across 3 bands (min concentration)
  //    Normalize from [0.33, 1.0] to [0, 1]
  const hhi = bands.reduce((s, b) => s + (b.pct / 100) ** 2, 0);
  const bandConcentration = Math.min(Math.max((hhi - 0.33) / 0.67, 0), 1);

  // 3. Region concentration: highest region's share of total
  const regionConcentration = totalValid > 0
    ? Math.min(highestRegion.count / totalValid, 1)
    : 0;

  // 4. Constellation dominance: largest group's share
  const groupCounts: Record<string, number> = {};
  for (let i = 0; i < CS.N; i++) {
    if (CS.alt[i] < 0) continue;
    const g = CS.group[i];
    if (g) {
      groupCounts[g] = (groupCounts[g] ?? 0) + 1;
    }
  }
  const topGroupCount = Math.max(...Object.values(groupCounts), 0);
  const constellationDominance = totalValid > 0 ? topGroupCount / totalValid : 0;

  // Weighted composite
  const score =
    densityFactor * 40 +
    bandConcentration * 30 +
    regionConcentration * 20 +
    constellationDominance * 10;

  return Math.round(Math.min(score, 100));
}

function scoreToLevel(score: number): CongestionLevel {
  if (score <= 25) return 'low';
  if (score <= 50) return 'moderate';
  if (score <= 75) return 'elevated';
  return 'high';
}

// ---- Helpers ---------------------------------------------------------------

function findDominantGroup(): GroupKey {
  const counts: Record<string, number> = {};
  for (let i = 0; i < CS.N; i++) {
    if (CS.alt[i] < 0) continue;
    const g = CS.group[i];
    if (g) {
      counts[g] = (counts[g] ?? 0) + 1;
    }
  }
  let best: GroupKey = 'other';
  let bestN = 0;
  for (const [g, n] of Object.entries(counts)) {
    if (n > bestN) { best = g as GroupKey; bestN = n; }
  }
  return best;
}

// ---- Compare utilities (used by AI agent v2) --------------------------------

export function compareBands(a: BandKey, b: BandKey): string {
  const intel = getIntelligence();
  const ba = intel.bands.find((x) => x.band === a);
  const bb = intel.bands.find((x) => x.band === b);
  if (!ba || !bb) return `Cannot compare ${a} and ${b}.`;

  const winner = ba.count > bb.count ? a : b;
  return `${a}: ${ba.count.toLocaleString()} objects (${ba.pct}%), avg altitude ${ba.avgAlt.toLocaleString()} km. ` +
    `${b}: ${bb.count.toLocaleString()} objects (${bb.pct}%), avg altitude ${bb.avgAlt.toLocaleString()} km. ` +
    `${winner} has more objects. ` +
    `Top ${a} groups: ${ba.topGroups.slice(0, 3).map((g) => `${(GROUPS[g.group] ?? GROUPS['other']).label} (${g.count})`).join(', ')}. ` +
    `Top ${b} groups: ${bb.topGroups.slice(0, 3).map((g) => `${(GROUPS[g.group] ?? GROUPS['other']).label} (${g.count})`).join(', ')}.`;
}

export function compareGroups(a: GroupKey, b: GroupKey): string {
  const ca = getConstellationIntelligence(a);
  const cb = getConstellationIntelligence(b);
  const la = (GROUPS[a] ?? GROUPS['other']).label;
  const lb = (GROUPS[b] ?? GROUPS['other']).label;

  return `${la}: ${ca.count.toLocaleString()} objects, ${ca.dominantBand} band, avg altitude ${ca.avgAlt.toLocaleString()} km, top region: ${ca.topRegion}. ` +
    `${lb}: ${cb.count.toLocaleString()} objects, ${cb.dominantBand} band, avg altitude ${cb.avgAlt.toLocaleString()} km, top region: ${cb.topRegion}.`;
}
