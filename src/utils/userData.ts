import type { ExecutiveSnapshot, SavedMissionView, UserExportData, WatchlistItem } from '../types';

const MAX_WATCHLIST_ITEMS = 500;
const MAX_SAVED_VIEWS = 100;
const MAX_SNAPSHOTS = 100;
const MAX_SIM_OFFSET_MS = 604800000;

interface ValidateUserDataOptions {
  requireVersion?: boolean;
}

export function validateUserExportData(value: unknown, options: ValidateUserDataOptions = {}): UserExportData {
  const { requireVersion = true } = options;

  if (!isRecord(value)) throw new Error('Not a valid JSON object.');
  if (requireVersion && typeof value.version !== 'string') throw new Error('Missing schema version.');
  if (!Array.isArray(value.watchlists) || !Array.isArray(value.savedViews) || !Array.isArray(value.snapshots)) {
    throw new Error('Invalid export format. Missing arrays.');
  }
  if (
    value.watchlists.length > MAX_WATCHLIST_ITEMS ||
    value.savedViews.length > MAX_SAVED_VIEWS ||
    value.snapshots.length > MAX_SNAPSHOTS
  ) {
    throw new Error('Import exceeds safe item limits.');
  }

  return {
    version: typeof value.version === 'string' ? value.version : '1.0.0',
    exportedAt: typeof value.exportedAt === 'number' ? value.exportedAt : Date.now(),
    watchlists: value.watchlists.map(parseWatchlistItem),
    savedViews: value.savedViews.map(parseSavedView),
    snapshots: value.snapshots.map(parseSnapshot),
  };
}

function parseWatchlistItem(value: unknown): WatchlistItem {
  if (!isRecord(value)) throw new Error('Invalid watchlist item.');
  return {
    name: safeString(value.name, 120),
    satnum: safeNumber(value.satnum),
    group: safeString(value.group, 40),
    band: safeString(value.band, 20),
    alt: safeNumber(value.alt),
    region: safeString(value.region, 80),
    sourceMode: safeString(value.sourceMode, 20),
    addedAt: safeNumber(value.addedAt),
  };
}

function parseSavedView(value: unknown): SavedMissionView {
  if (!isRecord(value) || !isRecord(value.filters)) throw new Error('Invalid saved view.');
  return {
    id: safeString(value.id, 80),
    name: safeString(value.name, 80),
    description: safeString(value.description, 200),
    filters: {
      groups: Array.isArray(value.filters.groups)
        ? value.filters.groups.map((g) => safeString(g, 40) as SavedMissionView['filters']['groups'][number])
        : [],
      band: value.filters.band === 'LEO' || value.filters.band === 'MEO' || value.filters.band === 'GEO'
        ? value.filters.band
        : null,
      region: value.filters.region == null ? null : safeString(value.filters.region, 80),
      altMin: value.filters.altMin == null ? null : safeNumber(value.filters.altMin),
      altMax: value.filters.altMax == null ? null : safeNumber(value.filters.altMax),
    },
    simMode: value.simMode === 'paused' || value.simMode === 'simulating' ? value.simMode : 'live',
    simOffsetMs: clampNumber(value.simOffsetMs, -MAX_SIM_OFFSET_MS, MAX_SIM_OFFSET_MS),
    missionScenario: typeof value.missionScenario === 'string' ? value.missionScenario as SavedMissionView['missionScenario'] : null,
    showRiskLayer: value.showRiskLayer === true,
    lang: value.lang === 'es' ? 'es' : 'en',
    createdAt: safeNumber(value.createdAt),
  };
}

function parseSnapshot(value: unknown): ExecutiveSnapshot {
  if (!isRecord(value)) throw new Error('Invalid snapshot.');
  return {
    id: safeString(value.id, 80),
    timestamp: safeNumber(value.timestamp),
    simOffsetMs: clampNumber(value.simOffsetMs, -MAX_SIM_OFFSET_MS, MAX_SIM_OFFSET_MS),
    sourceMode: safeString(value.sourceMode, 20),
    totalLoaded: safeNumber(value.totalLoaded),
    visibleCount: safeNumber(value.visibleCount),
    mostCrowdedBand: safeString(value.mostCrowdedBand, 20),
    highestConcentrationRegion: safeString(value.highestConcentrationRegion, 80),
    dominantGroup: safeString(value.dominantGroup, 40),
    selectedSatellite: null,
    executiveBrief: null,
    missionBrief: null,
    riskLayerSummary: null,
    caveats: Array.isArray(value.caveats) ? value.caveats.map((c) => safeString(c, 240)).slice(0, 10) : [],
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function safeString(value: unknown, max: number): string {
  if (typeof value !== 'string') throw new Error('Invalid string field.');
  return value.slice(0, max);
}

function safeNumber(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error('Invalid number field.');
  return value;
}

function clampNumber(value: unknown, min: number, max: number): number {
  return Math.max(min, Math.min(max, safeNumber(value)));
}
