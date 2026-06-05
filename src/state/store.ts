// ============================================================
// OrbitIQ — app state (Zustand)
//
// Rendering-critical hot arrays (posBuf, lat, lon, alt, vis, colorBase)
// live outside React state to avoid triggering re-renders on every
// propagation tick. Only UI-driving state goes here.
// ============================================================
import { create } from 'zustand';
import type { DataMode, GroupKey, BandKey, MissionScenarioType } from '../types';

export interface UIState {
  // data / loading
  dataMode: DataMode;
  totalCount: number;
  renderedCount: number;
  regionCount: number;
  ageDays: number;
  isLoading: boolean;

  // filters
  activeGroups: Set<GroupKey>;
  filterBand: BandKey | null;
  filterRegion: string | null;
  altMin: number | null;
  altMax: number | null;
  search: string;

  // selection
  selected: number;         // -1 = none
  tracking: boolean;

  // UI visibility
  showBrief: boolean;
  showIntelligence: boolean;
  lang: 'en' | 'es';
  autoRotate: boolean;
  curRegionForCount: string | null;
  showMissionPanel: boolean;
  activeMissionScenario: MissionScenarioType | null;
}

export interface UIActions {
  setDataMode(mode: DataMode): void;
  setCounts(total: number, rendered: number, region: number): void;
  setAgeDays(d: number): void;
  setLoading(v: boolean): void;

  toggleGroup(g: GroupKey): void;
  setFilterBand(b: BandKey | null): void;
  setFilterRegion(r: string | null): void;
  setAltFilter(min: number | null, max: number | null): void;
  setSearch(s: string): void;
  resetFilters(): void;

  setSelected(i: number): void;
  setTracking(v: boolean): void;

  setShowBrief(v: boolean): void;
  setShowIntelligence(v: boolean): void;
  setLang(l: 'en' | 'es'): void;
  setAutoRotate(v: boolean): void;
  setCurRegion(key: string | null): void;
  setShowMissionPanel(v: boolean): void;
  setActiveMissionScenario(s: MissionScenarioType | null): void;
}

const ALL_GROUPS: GroupKey[] = ['starlink', 'leo', 'meo', 'geo', 'gnss', 'weather', 'stations', 'science'];

export const useStore = create<UIState & UIActions>((set, get) => ({
  // --- initial state ---
  dataMode: 'loading',
  totalCount: 0,
  renderedCount: 0,
  regionCount: 0,
  ageDays: 0,
  isLoading: true,
  activeGroups: new Set<GroupKey>(),
  filterBand: null,
  filterRegion: null,
  altMin: null,
  altMax: null,
  search: '',
  selected: -1,
  tracking: false,
  showBrief: false,
  showIntelligence: false,
  lang: 'en',
  autoRotate: true,
  curRegionForCount: null,
  showMissionPanel: false,
  activeMissionScenario: null,

  // --- actions ---
  setDataMode: (mode) => set({ dataMode: mode }),
  setCounts:   (total, rendered, region) => set({ totalCount: total, renderedCount: rendered, regionCount: region }),
  setAgeDays:  (d) => set({ ageDays: d }),
  setLoading:  (v) => set({ isLoading: v }),

  toggleGroup(g) {
    const cur = get().activeGroups;
    const next = new Set(cur.size ? cur : ALL_GROUPS); // materialise "all"
    if (next.has(g)) next.delete(g); else next.add(g);
    if (next.size === ALL_GROUPS.length) next.clear(); // back to "all = unrestricted"
    set({ activeGroups: next });
  },

  setFilterBand:   (b) => set({ filterBand: b }),
  setFilterRegion: (r) => set({ filterRegion: r }),
  setAltFilter:    (min, max) => set({ altMin: min, altMax: max }),
  setSearch:       (s) => set({ search: s }),

  resetFilters: () => set({
    activeGroups: new Set<GroupKey>(),
    filterBand: null, filterRegion: null,
    altMin: null, altMax: null, search: '',
    curRegionForCount: null,
  }),

  setSelected: (i) => set({ selected: i }),
  setTracking: (v) => set({ tracking: v }),

  setShowBrief: (v) => set({ showBrief: v }),
  setShowIntelligence: (v) => set({ showIntelligence: v }),
  setLang:      (l) => set({ lang: l }),
  setAutoRotate:(v) => set({ autoRotate: v }),
  setCurRegion: (k) => set({ curRegionForCount: k }),
  setShowMissionPanel: (v) => set({ showMissionPanel: v }),
  setActiveMissionScenario: (s) => set({ activeMissionScenario: s }),
}));
