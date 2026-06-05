// ============================================================
// OrbitIQ — shared TypeScript types
// ============================================================

/** A raw satellite record from any data source. */
export interface SatelliteRecord {
  name: string;
  satnum: number;
  /** TLE line 1 */
  l1: string;
  /** TLE line 2 */
  l2: string;
  /** Group key, assigned by classifier */
  group: GroupKey;
  /** True = record originated from a public TLE source (CelesTrak); false = synthetic representative */
  isReal: boolean;
  /** Nominal altitude used for initial group classification before first propagation (km) */
  altNominal?: number;
}

/** Parsed satrec from satellite.js */
export interface SatRec {
  error: number;
  no: number;          // mean motion rad/min
  jdsatepoch: number;  // Julian date of epoch
  [key: string]: unknown;
}

export type GroupKey =
  | 'starlink'
  | 'stations'
  | 'leo'
  | 'meo'
  | 'geo'
  | 'gnss'
  | 'weather'
  | 'science'
  | 'other';

export type BandKey = 'LEO' | 'MEO' | 'GEO';

/** Data source / freshness mode reported in the UI. */
export type DataMode = 'live' | 'cached' | 'fallback' | 'mixed' | 'loading';

/** Metadata attached to a TLE dataset returned by /api/tle. */
export interface TleApiMeta {
  source: string;
  fetchTimestamp: string;     // ISO
  cacheTimestamp: string;     // ISO
  tleEpoch?: string;          // ISO of most recent TLE in set
  freshness: 'live' | 'cached' | 'fallback';
  dataMode: DataMode;
  count: number;
}

/** Full response from /api/tle. */
export interface TleApiResponse {
  meta: TleApiMeta;
  satellites: Array<{
    name: string;
    satnum: number;
    l1: string;
    l2: string;
    isReal: boolean;
  }>;
}

// ============================================================
// AI agent
// ============================================================

export interface AgentActions {
  groups: GroupKey[] | null;
  band: BandKey | null;
  region: string | null;
  altMax: number | null;
  altMin: number | null;
  focusSatnum: number | null;
  brief: boolean;
}

/** Formal output contract for the AI agent.
 *  Deterministic v1 emits the same shape a real LLM backend would,
 *  enabling a drop-in swap without touching the UI.
 */
export interface AiAgentResponse {
  answer: string;
  intent: string;
  confidence: number;
  assumptions: string[];
  actions: AgentActions;
  filtersApplied: Record<string, unknown>;
  visibleCount: number;
  sourceMode: DataMode;
}

// ============================================================
// Executive brief
// ============================================================

export interface BriefSection {
  title: string;
  body: string;
}

export interface ExecutiveBrief {
  headline: string;
  sections: BriefSection[];
}

// ============================================================
// App state
// ============================================================

export interface AppState {
  catalog: SatelliteRecord[];
  N: number;
  /** Float32 positions buffer, length N*3 */
  posBuf: Float32Array;
  lat: Float32Array;
  lon: Float32Array;
  alt: Float32Array;
  band: BandKey[];
  group: GroupKey[];
  colorBase: Float32Array;
  vis: Float32Array;
  activeGroups: Set<GroupKey>;
  filterBand: BandKey | null;
  filterRegion: string | null;
  altMin: number | null;
  altMax: number | null;
  search: string;
  selected: number;
  tracking: boolean;
  rendered: number;
  regionCount: number;
  ageDays: number;
  autoRotate: boolean;
  dataMode: DataMode;
  curRegionForCount: string | null;
}

// ============================================================
// Region
// ============================================================

export interface Region {
  label: string;
  box: [number, number, number, number]; // [latMin, latMax, lonMin, lonMax]
  center: [number, number];              // [lat, lon]
}

export type RegionMap = Record<string, Region>;

// ============================================================
// Group metadata
// ============================================================

export interface GroupMeta {
  label: string;
  color: string;
}

export type GroupMetaMap = Record<GroupKey, GroupMeta>;

// ============================================================
// Globe API (imperative, lives outside React)
// ============================================================

export interface GlobeApi {
  allocate(n: number): void;
  writePositions(posBuf: Float32Array): void;
  setColors(c: Float32Array): void;
  setVisible(v: Float32Array): void;
  getPos(i: number, out: { set(x: number, y: number, z: number): void }): void;
  setOrbit(arr: Float32Array | null): void;
  setSelected(i: number): void;
  setRegionMarker(lat: number | null, lon?: number): void;
  flyTo(p: { clone(): { x: number; y: number; z: number } }): void;
  setAutoRotate(v: boolean): void;
  setEarthRotation(gmst: number): void;
  onPick(cb: (i: number) => void): void;
  resize(): void;
  renderOnce(): void;
  resetView(): void;
  ready: Promise<void>;
}
