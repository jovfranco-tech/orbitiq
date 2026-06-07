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
export type VisualQuality = 'performance' | 'cinematic' | 'presentation';

/** API Health state */
export type ApiHealth = 'healthy' | 'degraded' | 'unavailable' | 'fallback';

/** Metadata attached to a TLE dataset returned by /api/tle. */
export interface TleApiMeta {
  source: string;
  sourceMode?: DataMode;
  fetchTimestamp: string;     // ISO
  fetchedAt?: string;         // ISO alias used by release metadata
  cacheTimestamp: string;     // ISO
  tleEpoch?: string;          // ISO of most recent TLE in set
  freshness: 'live' | 'cached' | 'fallback';
  dataMode: DataMode;
  count: number;
  recordCount?: number;
  sourceHealth?: ApiHealth;
  cacheAgeSeconds?: number;
  cacheTtlSeconds?: number;
  fallbackReason?: string;
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
  missionScenario: MissionScenarioType | null;
  showRiskLayer: boolean;
  timeAction: Extract<AgentAction, { type: 'set_time_mode' | 'set_time_speed' | 'jump_time' | 'reset_to_now' | 'pause_simulation' | 'resume_simulation' }> | null;
  watchlistAction?: 'add' | 'remove' | 'show' | null;
  savedViewAction?: { type: 'save' | 'load' | 'recommend'; payload?: string } | null;
  snapshotAction?: 'create' | 'export' | null;
  chartAction?: { type: 'bar' | 'pie'; dataKey: string; data: Record<string, number | string>[] } | null;
}

export type AgentAction =
  | { type: 'filter_by_group'; group: string }
  | { type: 'filter_by_region'; region: string }
  | { type: 'filter_by_band'; band: 'LEO' | 'MEO' | 'GEO' | 'OTHER' | 'UNKNOWN' }
  | { type: 'altitude_threshold'; operator: 'below' | 'above'; km: number }
  | { type: 'find_satellite'; query: string }
  | { type: 'compare_bands'; bands?: string[] }
  | { type: 'compare_groups'; groups?: string[] }
  | { type: 'congestion_summary' }
  | { type: 'executive_brief' }
  | { type: 'generate_mission_brief'; scenario: string }
  | { type: 'generate_simulation_brief' }
  | { type: 'select_mission_scenario'; scenario: string }
  | { type: 'show_risk_layer' }
  | { type: 'highlight_relevant_groups'; groups: string[] }
  | { type: 'highlight_relevant_region'; region: string }
  | { type: 'recommend_next_view' }
  | { type: 'reset_view' }
  | { type: 'set_time_mode'; mode: 'live' | 'paused' | 'simulating' }
  | { type: 'set_time_speed'; speed: number }
  | { type: 'jump_time'; offsetMs: number }
  | { type: 'reset_to_now' }
  | { type: 'pause_simulation' }
  | { type: 'resume_simulation' }
  | { type: 'add_to_watchlist' }
  | { type: 'remove_from_watchlist' }
  | { type: 'show_watchlist' }
  | { type: 'save_current_view'; name?: string }
  | { type: 'load_saved_view'; viewIdOrName?: string }
  | { type: 'create_snapshot' }
  | { type: 'export_snapshot' }
  | { type: 'recommend_saved_view' }
  | { type: 'render_chart'; chartType: 'bar' | 'pie'; dataKey: string; data: Record<string, number | string>[] }
  | { type: 'unknown_safe_fallback' };

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
  responseMode?: 'llm' | 'deterministic';
  safetyCaveat?: string;
  intelligence?: AiAgentIntelligence;
}

export interface LlmAgentResponse {
  answer: string;
  intent: string;
  confidence: number;
  assumptions: string[];
  actions: AgentAction[];
  filtersApplied: Record<string, unknown>;
  visibleCount?: number;
  sourceMode: 'live' | 'cached' | 'fallback' | 'mixed';
  safetyCaveat: string;
  language: 'en' | 'es';
}

// ============================================================
// v0.3.0 — Intelligence types
// ============================================================

export type CongestionLevel = 'low' | 'moderate' | 'elevated' | 'high';

export interface BandIntelligence {
  band: BandKey;
  count: number;
  pct: number;
  avgAlt: number;
  topGroups: { group: GroupKey; count: number }[];
}

export interface RegionIntelligence {
  key: string;
  label: string;
  count: number;
  dominantBand: BandKey;
  topGroups: { group: GroupKey; count: number }[];
}

export interface ConstellationIntelligence {
  group: GroupKey;
  count: number;
  dominantBand: BandKey;
  avgAlt: number;
  topRegion: string;
  relevance: string;
}

export interface IntelligenceSummary {
  bands: BandIntelligence[];
  mostCrowdedBand: BandKey;
  regions: RegionIntelligence[];
  highestConcentrationRegion: string;
  dominantGroup: GroupKey;
  congestionScore: number;
  congestionLevel: CongestionLevel;
  timestamp: number;
}

export interface AiAgentIntelligence {
  mostCrowdedBand?: string;
  highestConcentrationRegion?: string;
  dominantGroup?: string;
  congestionScore?: number;
  congestionLevel?: CongestionLevel;
  bandBreakdown?: Record<string, number>;
  regionBreakdown?: Record<string, number>;
}

// ============================================================
// v0.5.0 — Mission Briefs & Risk Layer
// ============================================================

export type RiskLevel = 'low' | 'moderate' | 'elevated' | 'high';
export type RiskCategoryType = 'Connectivity' | 'GNSS' | 'Weather' | 'GEO_Comms' | 'LEO_Density' | 'Regional';

export interface RiskSignal {
  category: RiskCategoryType;
  score: number;      // 0-100
  level: RiskLevel;
  explanation: string;
  assumptions: string[];
  recommendedAction: string;
  caveat: string;
}

export type MissionScenarioType = 
  | 'GNSS_Dependency'
  | 'LATAM_Connectivity'
  | 'Weather_Visibility'
  | 'GEO_Infrastructure'
  | 'LEO_Density'
  | 'Disaster_Response'
  | 'Executive_Snapshot';

export interface MissionScenario {
  id: MissionScenarioType;
  title: string;
  context: string;
  relevantGroups: GroupKey[];
  relevantBands: BandKey[];
  relevantRegions: string[];
  visibleCount: number;
  insight: string;
  operationalRelevance: string;
  caveat: string;
  recommendedAction: AgentAction;
  riskSignal?: RiskSignal;
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
// v0.7.0 — Local Persistence (Watchlists, Views, Snapshots)
// ============================================================

export interface WatchlistItem {
  name: string;
  satnum: number;
  group: string;
  band: string;
  alt: number;
  region: string;
  sourceMode: string;
  addedAt: number;
}

export interface SavedMissionView {
  id: string;
  name: string;
  description: string;
  filters: {
    groups: GroupKey[];
    band: BandKey | null;
    region: string | null;
    altMin: number | null;
    altMax: number | null;
  };
  simMode: 'live' | 'paused' | 'simulating';
  simOffsetMs: number;
  missionScenario: MissionScenarioType | null;
  showRiskLayer: boolean;
  lang: 'en' | 'es';
  createdAt: number;
}

export interface ExecutiveSnapshot {
  id: string;
  timestamp: number;
  simOffsetMs: number;
  sourceMode: string;
  totalLoaded: number;
  visibleCount: number;
  mostCrowdedBand: string;
  highestConcentrationRegion: string;
  dominantGroup: string;
  selectedSatellite: { name: string; satnum: number; lat: number; lon: number; alt: number } | null;
  executiveBrief: ExecutiveBrief | null;
  missionBrief: MissionScenario | null;
  riskLayerSummary: RiskSignal | null;
  caveats: string[];
}

export interface UserExportData {
  version: string;
  exportedAt: number;
  watchlists: WatchlistItem[];
  savedViews: SavedMissionView[];
  snapshots: ExecutiveSnapshot[];
}

export type CloudSyncStatus = 'disabled' | 'connecting' | 'syncing' | 'synced' | 'error';

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
  showMissionPanel: boolean;
  activeMissionScenario: MissionScenarioType | null;
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
  setSelected(i: number, name?: string, alt?: number): void;
  setRegionMarker(lat: number | null, lon?: number): void;
  flyTo(p: { clone(): { x: number; y: number; z: number } }): void;
  setVisualQuality(q: VisualQuality): void;
  setVisualContext(context: {
    activeBand: BandKey | null;
    activeGroups: GroupKey[];
    regionActive: boolean;
    missionActive: boolean;
  }): void;
  setAutoRotate(v: boolean): void;
  setEarthRotation(gmst: number): void;
  setSunTime(timestampMs: number): void;
  onPick(cb: (i: number) => void): void;
  resize(): void;
  renderOnce(): void;
  resetView(): void;
  ready: Promise<void>;
}
