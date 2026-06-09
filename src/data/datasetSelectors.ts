// ============================================================
// OrbitIQ — Dataset Selectors (v1.1.3)
//
// Single source of truth for mode-aware datasets.
// All components (globe, catalog, counters, legend) must use
// these selectors to determine which indices are active.
//
// Architecture:
//   The master catalog (CS) holds ALL objects (operational + risk overlay).
//   Mode selectors return index sets (not copies) for each view mode.
//   This avoids re-fetching on mode switch and guarantees consistency.
// ============================================================
import { CS } from '../state/catalogStore';
import { isOperationalClass } from './objectClass';
import type { ViewMode, ObjectClass, GroupKey, BandKey } from '../types';

// ---- Index-based dataset selectors ----

/**
 * Returns indices of operational objects in the master catalog.
 * Operational = objectClass is operational_satellite or active_payload.
 */
export function getOperationalIndices(): number[] {
  const indices: number[] = [];
  for (let i = 0; i < CS.N; i++) {
    if (isOperationalClass(CS.objectClass[i])) indices.push(i);
  }
  return indices;
}

/**
 * Returns indices of risk overlay objects (debris, rocket_body, inactive_payload, unknown_object).
 */
export function getRiskOverlayIndices(): number[] {
  const indices: number[] = [];
  for (let i = 0; i < CS.N; i++) {
    if (!isOperationalClass(CS.objectClass[i])) indices.push(i);
  }
  return indices;
}

/**
 * Returns indices for the expanded dataset (all objects = operational + risk overlay).
 */
export function getExpandedIndices(): number[] {
  const indices: number[] = [];
  for (let i = 0; i < CS.N; i++) {
    indices.push(i);
  }
  return indices;
}

/**
 * Returns indices for the debris/risk dataset (only non-operational objects).
 */
export function getDebrisRiskIndices(): number[] {
  return getRiskOverlayIndices();
}

/**
 * Master selector: returns the base index set for a given view mode.
 */
export function getModeBaseIndices(mode: ViewMode): number[] {
  switch (mode) {
    case 'operational': return getOperationalIndices();
    case 'expanded': return getExpandedIndices();
    case 'debris': return getDebrisRiskIndices();
  }
}

/**
 * Returns the total count for a mode (the "Total Loaded" header value).
 */
export function getModeTotal(mode: ViewMode): number {
  switch (mode) {
    case 'operational': {
      let n = 0;
      for (let i = 0; i < CS.N; i++) if (isOperationalClass(CS.objectClass[i])) n++;
      return n;
    }
    case 'expanded':
      return CS.N;
    case 'debris': {
      let n = 0;
      for (let i = 0; i < CS.N; i++) if (!isOperationalClass(CS.objectClass[i])) n++;
      return n;
    }
  }
}

// ---- Filtering ----

export interface FilterOptions {
  activeGroups: Set<GroupKey>;
  activeClasses: Set<ObjectClass>;
  filterBand: BandKey | null;
  filterRegion: string | null;
  altMin: number | null;
  altMax: number | null;
  search: string;
}

/**
 * Check if index i passes the user's active filters.
 * Does NOT check mode membership — that's handled by the base index set.
 * Does NOT gate on CS.alt[i] < 0 for catalog use (only for rendering).
 */
export function passesFilters(i: number, opts: FilterOptions, matchRegionFn: (lat: number, lon: number, key: string) => boolean): boolean {
  const { activeGroups, activeClasses, filterBand, filterRegion, altMin, altMax } = opts;
  if (activeGroups.size && !activeGroups.has(CS.group[i])) return false;
  if (activeClasses.size && !activeClasses.has(CS.objectClass[i])) return false;
  if (filterBand && CS.band[i] !== filterBand) return false;
  if (filterRegion && CS.alt[i] >= 0 && !matchRegionFn(CS.lat[i], CS.lon[i], filterRegion)) return false;
  if (altMax != null && CS.alt[i] >= 0 && CS.alt[i] > altMax) return false;
  if (altMin != null && CS.alt[i] >= 0 && CS.alt[i] < altMin) return false;
  return true;
}

/**
 * Check if a catalog entry matches a search query.
 */
export function passesSearch(i: number, query: string): boolean {
  if (!query) return true;
  const c = CS.catalog[i];
  if (!c) return false;
  return c.name.toLowerCase().includes(query) || String(c.satnum).includes(query);
}

// ---- Dataset counts ----

export interface ModeCounters {
  totalLoaded: number;
  operationalCount: number;
  riskOverlayCount: number;
}

export function getModeCounters(): ModeCounters {
  let operationalCount = 0;
  let riskOverlayCount = 0;
  for (let i = 0; i < CS.N; i++) {
    if (isOperationalClass(CS.objectClass[i])) operationalCount++;
    else riskOverlayCount++;
  }
  return {
    totalLoaded: CS.N,
    operationalCount,
    riskOverlayCount,
  };
}

// ---- Development assertions ----

export function validateDatasets(mode: ViewMode): string[] {
  if (import.meta.env?.PROD) return [];
  const warnings: string[] = [];
  const counters = getModeCounters();

  // Expanded must be >= operational
  if (CS.N < counters.operationalCount) {
    warnings.push(`[DatasetAssert] Expanded total (${CS.N}) < operational count (${counters.operationalCount})`);
  }

  // Debris dataset should not contain operational satellites (when in debris mode)
  if (mode === 'debris') {
    const debrisIndices = getDebrisRiskIndices();
    const starlinkInDebris = debrisIndices.filter(i => CS.catalog[i]?.name?.toUpperCase().includes('STARLINK'));
    if (starlinkInDebris.length > 0) {
      warnings.push(`[DatasetAssert] Debris dataset contains ${starlinkInDebris.length} Starlink objects`);
    }
  }

  return warnings;
}
