// ============================================================
// OrbitIQ Command Center v0.3.0 — App root
// ============================================================
import { lazy, Suspense, useRef, useCallback, useEffect, useState } from 'react';
import { SidePanelSkeleton, ModalSkeleton } from '../components/PanelSkeleton';
import { TopBar } from '../components/dashboard/TopBar';
import { Legend } from '../components/dashboard/Legend';
import { AgentPanel } from '../components/panels/AgentPanel';
import { CatalogPanel } from '../components/panels/CatalogPanel';
import { TimeControlsPanel } from '../components/panels/TimeControlsPanel';
import { BottomTabBar } from '../components/dashboard/BottomTabBar';
import { AttributionBadge } from '../components/dashboard/AttributionBadge';
import { CommandVisualLayer } from '../components/dashboard/CommandVisualLayer';
import { useStore } from '../state/store';
import { useUserStore } from '../state/userStore';
import { CS, initCatalogStore } from '../state/catalogStore';
import { loadSatellites } from '../data/client';
import { GROUPS, classifyGroup } from '../data/groups';
import { classifyObjectClass, isOperationalClass, OBJECT_CLASS_META, OBJECT_CLASS_ORDER } from '../data/objectClass';
import { buildRecords, dataAgeDays, sampleOrbitPath } from '../orbital/propagator';
import { matchRegion, REGIONS } from '../regions/regions';
import type { AgentContext } from '../ai/agent';
import { getLang, setLang, t } from '../i18n/i18n';
import { useLiveTelemetry } from '../hooks/useLiveTelemetry';
import { useURLSync } from '../hooks/useURLSync';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';
import { useMobile } from '../hooks/useMobile';
import { useFirebaseCloudSync } from '../hooks/useFirebaseCloudSync';
import type { GlobeApi, IntelligenceSummary } from '../types';
import type { AiAgentResponse, GroupKey, BandKey, ViewMode, ObjectClass } from '../types';
import type { ConversationMessage } from '../ai/agent';

const ViewModeSelector = lazy(() => import('../components/dashboard/ViewModeSelector').then((m) => ({ default: m.ViewModeSelector })));

const GlobeMount = lazy(() => import('../components/globe/GlobeMount').then((m) => ({ default: m.GlobeMount })));
const MissionPanel = lazy(() => import('../components/panels/MissionPanel').then((m) => ({ default: m.MissionPanel })));
const DetailPanel = lazy(() => import('../components/panels/DetailPanel').then((m) => ({ default: m.DetailPanel })));
const BriefModal = lazy(() => import('../components/panels/BriefModal').then((m) => ({ default: m.BriefModal })));
const TourModal = lazy(() => import('../components/panels/TourModal').then((m) => ({ default: m.TourModal })));
const OrbitalIntelligencePanel = lazy(() => import('../components/panels/OrbitalIntelligencePanel').then((m) => ({ default: m.OrbitalIntelligencePanel })));
const WatchlistPanel = lazy(() => import('../components/panels/WatchlistPanel').then((m) => ({ default: m.WatchlistPanel })));
const SavedViewsPanel = lazy(() => import('../components/panels/SavedViewsPanel').then((m) => ({ default: m.SavedViewsPanel })));
const SnapshotPanel = lazy(() => import('../components/panels/SnapshotPanel').then((m) => ({ default: m.SnapshotPanel })));
const DataHealthPanel = lazy(() => import('../components/panels/DataHealthPanel').then((m) => ({ default: m.DataHealthPanel })));
const MissionCinematicCue = lazy(() => import('../components/dashboard/MissionCinematicCue').then((m) => ({ default: m.MissionCinematicCue })));

// ---- Hex color → [r,g,b] 0–1 ----------------------------------------
function hexToRGB(h: string): [number, number, number] {
  const n = parseInt(h.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

// Precomputed object-class RGB for the expanded / debris visual language.
const CLASS_RGB = Object.fromEntries(
  OBJECT_CLASS_ORDER.map((c) => [c, hexToRGB(OBJECT_CLASS_META[c].color)]),
) as Record<ObjectClass, [number, number, number]>;

/**
 * Repaint CS.colorBase for the given view mode.
 * Operational mode keeps the established constellation/group palette (clean,
 * impressive default). Expanded / debris modes color by object class so
 * operational satellites, rocket bodies and debris are visually distinct.
 */
function paintColorBase(mode: ViewMode): void {
  const groupCache: Record<string, [number, number, number]> = {};
  for (let i = 0; i < CS.N; i++) {
    let c: [number, number, number];
    if (mode === 'operational') {
      const g = CS.group[i];
      c = (groupCache[g] ??= hexToRGB((GROUPS[g] ?? GROUPS['other']).color));
    } else {
      c = CLASS_RGB[CS.objectClass[i]] ?? CLASS_RGB['active_payload'];
    }
    CS.colorBase[i * 3] = c[0];
    CS.colorBase[i * 3 + 1] = c[1];
    CS.colorBase[i * 3 + 2] = c[2];
  }
}

const TICK_MS = 900;
const INTEL_REFRESH_MS = 2000;
const MAX_AGENT_TIME_JUMP_MS = 7 * 24 * 60 * 60 * 1000;
const MIN_AGENT_SPEED = 0.25;
const MAX_AGENT_SPEED = 360;

class FlyVector {
  x = 0;
  y = 0;
  z = 0;

  set(x: number, y: number, z: number): void {
    this.x = x;
    this.y = y;
    this.z = z;
  }

  clone(): FlyVector {
    const next = new FlyVector();
    next.set(this.x, this.y, this.z);
    return next;
  }

  lengthSq(): number {
    return this.x * this.x + this.y * this.y + this.z * this.z;
  }

  length(): number {
    return Math.sqrt(this.lengthSq());
  }

  normalize(): FlyVector {
    const len = this.length();
    if (len > 0) this.multiplyScalar(1 / len);
    return this;
  }

  multiplyScalar(scale: number): FlyVector {
    this.x *= scale;
    this.y *= scale;
    this.z *= scale;
    return this;
  }
}

export function App() {
  const globeRef  = useRef<GlobeApi | null>(null);
  const tickRef   = useRef<ReturnType<typeof setInterval> | null>(null);
  const intelRef  = useRef<ReturnType<typeof setInterval> | null>(null);
  const pendingSatRef = useRef<number | null>(null);
  const intelligenceRuntimeRef = useRef<Promise<typeof import('../intelligence/runtime')> | null>(null);
  const isMountedRef = useRef(true);
  const lastTickTimeRef = useRef<number>(performance.now());
  // Stable Vector3 reused for fly-to — avoids creating objects each pick
  const flyVec    = useRef(new FlyVector());

  const workerRef = useRef<Worker | null>(null);
  const workerReadyRef = useRef(false);
  const isWorkerBusyRef = useRef(false);
  // Late-bound so runAgent (declared earlier) can trigger a mode switch.
  const setViewModeRef = useRef<(m: ViewMode) => void>(() => {});

  const [agentResult, setAgentResult] = useState<AiAgentResponse | null>(null);
  const [isThinking, setIsThinking]   = useState(false);
  const agentInputRef = useRef<HTMLInputElement | null>(null);
  const { tickerMsg } = useLiveTelemetry();
  const [intelligence, setIntelligence] = useState<IntelligenceSummary | null>(null);

  const store = useStore();
  const userStore = useUserStore();
  const isMobile = useMobile();
  useFirebaseCloudSync();

  const loadIntelligenceRuntime = useCallback(() => {
    intelligenceRuntimeRef.current ??= import('../intelligence/runtime');
    return intelligenceRuntimeRef.current;
  }, []);

  // ---- Intelligence refresh (decoupled from tick) -----------------------
  const refreshIntel = useCallback(() => {
    if (CS.N === 0) return;
    void loadIntelligenceRuntime().then(({ getIntelligence }) => {
      if (isMountedRef.current && CS.N > 0) setIntelligence(getIntelligence());
    });
  }, [loadIntelligenceRuntime]);

  // ---- Filter pass (hot path) ------------------------------------------
  const MOBILE_MAX_RENDER = 600;
  const applyFilter = useCallback(() => {
    if (!globeRef.current) return;
    const globe = globeRef.current;
    const { activeGroups, activeClasses, filterBand, filterRegion, altMin, altMax, selected, viewMode } = useStore.getState();
    const hasLayerFilter = !!activeGroups.size || !!activeClasses.size || !!filterBand || !!filterRegion || altMin != null || altMax != null;
    // Debris & Collision Risk emphasis: active infrastructure becomes faint
    // context so debris / rocket bodies stand out (unless the user filtered by class).
    const debrisEmphasis = viewMode === 'debris' && activeClasses.size === 0;
    const mobile = window.innerWidth < 768;
    let rendered = 0, regionCount = 0;
    // First pass: collect matching indices
    const matches: boolean[] = new Array(CS.N).fill(false);
    for (let i = 0; i < CS.N; i++) {
      if (CS.alt[i] < 0) continue;
      if (activeGroups.size && !activeGroups.has(CS.group[i])) continue;
      if (activeClasses.size && !activeClasses.has(CS.objectClass[i])) continue;
      if (filterBand && CS.band[i] !== filterBand) continue;
      if (altMax != null && CS.alt[i] > altMax) continue;
      if (altMin != null && CS.alt[i] < altMin) continue;
      if (filterRegion && !matchRegion(CS.lat[i], CS.lon[i], filterRegion)) continue;
      if (debrisEmphasis && isOperationalClass(CS.objectClass[i])) continue;
      matches[i] = true;
      rendered++;
      if (filterRegion) regionCount++;
    }
    // On mobile, thin out to MOBILE_MAX_RENDER via deterministic sampling
    const sampleRate = mobile && rendered > MOBILE_MAX_RENDER ? MOBILE_MAX_RENDER / rendered : 1;
    let kept = 0;
    for (let i = 0; i < CS.N; i++) {
      if (matches[i]) {
        const show = sampleRate >= 1 || (i % Math.ceil(1 / sampleRate) === 0);
        CS.vis[i] = show ? 1 : hasLayerFilter ? 0.075 : 0;
        if (show) kept++;
      } else if (debrisEmphasis && CS.alt[i] >= 0 && isOperationalClass(CS.objectClass[i])) {
        CS.vis[i] = 0.12; // faint active-infrastructure context behind debris
      } else {
        CS.vis[i] = hasLayerFilter && CS.alt[i] >= 0 ? 0.075 : 0;
      }
    }
    if (selected >= 0 && selected < CS.N) CS.vis[selected] = 1;
    globe.setVisible(CS.vis);
    useStore.getState().setCounts(CS.N, mobile ? kept : rendered, regionCount);
  }, []);

  // ---- Propagation tick (offloaded to Web Worker) -----------------------
  const tick = useCallback(() => {
    if (!globeRef.current || CS.N === 0) return;
    if (!workerRef.current || !workerReadyRef.current || isWorkerBusyRef.current) return;
    
    const nowPerf = performance.now();
    const dt = nowPerf - lastTickTimeRef.current;
    lastTickTimeRef.current = nowPerf;
    
    const storeState = useStore.getState();
    if (storeState.simMode === 'live') {
      CS.simTimestampMs = Date.now();
    } else if (storeState.simMode === 'simulating') {
      CS.simTimestampMs += dt * storeState.simSpeed;
    }
    
    isWorkerBusyRef.current = true;
    workerRef.current.postMessage({
      type: 'TICK',
      payload: { timestampMs: CS.simTimestampMs, selectedIdx: useStore.getState().selected },
    });
  }, []);

  // ---- Load catalog into GPU buffers -----------------------------------
  const loadCatalog = useCallback((globe: GlobeApi, catalog: typeof CS.catalog) => {
    const cleanCatalog = (catalog || []).filter(Boolean);
    CS.catalog = cleanCatalog;
    CS.recs    = buildRecords(cleanCatalog);
    initCatalogStore(cleanCatalog.length);

    for (let i = 0; i < CS.N; i++) {
      const rec = cleanCatalog[i];
      const g = rec.group ?? classifyGroup(rec.name, rec.altNominal ?? 600);
      CS.group[i] = g;
      CS.objectClass[i] = rec.objectClass ?? classifyObjectClass(rec.name, g, rec.isReal);
    }
    paintColorBase(useStore.getState().viewMode);

    globe.allocate(CS.N);
    globe.setColors(CS.colorBase);

    workerRef.current?.postMessage({ type: 'INIT', payload: { catalog } });

    const validRec = CS.recs.find((r) => r && !r.error);
    if (validRec) useStore.getState().setAgeDays(dataAgeDays(validRec, new Date()));
    void loadIntelligenceRuntime().then(({ invalidateIntelligence }) => invalidateIntelligence());
  }, [loadIntelligenceRuntime]);

  // ---- Globe ready (called once after mount) ---------------------------
  const onGlobeReady = useCallback(async (globe: GlobeApi) => {
    globeRef.current = globe;
    globe.setAutoRotate(true);
    globe.setVisualQuality(useStore.getState().visualQuality);
    globe.onPick((i) => { if (i >= 0) selectSat(globe, i, true); });

    const reveal = () => {
      document.getElementById('loading')?.classList.add('gone');
      setTimeout(() => {
        const l = document.getElementById('loading');
        if (l) l.style.display = 'none';
      }, 800);
    };
    globe.ready.then(reveal);
    setTimeout(reveal, 4500);

    const result = await loadSatellites();
    loadCatalog(globe, result.catalog);
    
    const sStore = useStore.getState();
    sStore.setDataMode(result.dataMode);
    sStore.setLoading(false);
    
    if (result.meta) {
      sStore.setTleMeta(result.meta);
      if (result.meta.sourceHealth) {
        sStore.setTleHealth(result.meta.sourceHealth);
      }
    }

    // Restore satellite selection from URL (needs catalog to be loaded first)
    if (pendingSatRef.current != null) {
      const satnum = pendingSatRef.current;
      pendingSatRef.current = null;
      const idx = CS.catalog.findIndex((c) => c && c.satnum === satnum);
      if (idx >= 0) selectSat(globe, idx, true);
    }

    tick();
    refreshIntel();

    tickRef.current = setInterval(tick, TICK_MS);
    intelRef.current = setInterval(refreshIntel, INTEL_REFRESH_MS);
  }, [loadCatalog, tick, refreshIntel]);

  // ---- Worker setup & cleanup (StrictMode double-mount safe) ---------------
  useEffect(() => {
    const w = new Worker(
      new URL('../workers/sgp4.worker.ts', import.meta.url),
      { type: 'module' }
    );
    workerRef.current = w;
    w.onmessage = (e: MessageEvent) => {
      const globe = globeRef.current;
      if (e.data.type === 'READY') {
        workerReadyRef.current = true;
        tick();
      } else if (e.data.type === 'TICK_RESULT') {
        isWorkerBusyRef.current = false;
        if (!globe) return;
        const { timestampMs, gmst, posBuf, lat, lon, alt, band, proximity } = e.data.payload;
        // Guard against a stale tick that was in flight while the catalog was
        // swapped for a new view mode (buffer sizes no longer match).
        if (posBuf.length !== CS.N * 3) return;
        if (proximity) CS.proximity = proximity;
        
        CS.posBuf = posBuf;
        CS.lat = lat;
        CS.lon = lon;
        CS.alt = alt;
        const BAND_MAP = ['LEO', 'MEO', 'GEO', 'LEO'] as const;
        for (let i = 0; i < CS.N; i++) CS.band[i] = BAND_MAP[band[i]] as BandKey;

        globe.setEarthRotation(gmst);
        globe.setSunTime(timestampMs);
        globe.writePositions(CS.posBuf);
        applyFilter();
        globe.renderOnce();

        const sel = useStore.getState().selected;
        if (sel >= 0) globe.setSelected(sel, CS.catalog[sel]?.name, CS.alt[sel]);
      }
    };

    // Race-condition guard: if the catalog mounted first (child runs mounting effects before parent), 
    // we initialize the worker immediately.
    if (CS.catalog && CS.catalog.length > 0) {
      w.postMessage({ type: 'INIT', payload: { catalog: CS.catalog } });
    }

    return () => {
      if (tickRef.current) { clearInterval(tickRef.current); tickRef.current = null; }
      if (intelRef.current) { clearInterval(intelRef.current); intelRef.current = null; }
      w.terminate();
    };
  }, [applyFilter]);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // ---- URL sync (init from hash + write on filter changes) ---------------
  useURLSync(pendingSatRef);

  // ---- React to filter changes instantly -------------------------------
  useEffect(() => {
    applyFilter();
    globeRef.current?.renderOnce();
  }, [
    applyFilter,
    store.filterBand,
    store.filterRegion,
    store.activeGroups,
    store.altMin,
    store.altMax,
    store.selected
  ]);

  // ---- Satellite selection ---------------------------------------------
  const selectSat = useCallback((globe: GlobeApi, i: number, fly: boolean) => {
    if (i < 0 || i >= CS.N) return;
    useStore.getState().setSelected(i);
    useStore.getState().setTracking(true); // Auto-track on select
    globe.setSelected(i, CS.catalog[i]?.name, CS.alt[i]);
    
    // Auto-draw orbit path
    const rec = CS.recs[i];
    if (rec && !rec.error) {
      const path = sampleOrbitPath(rec, new Date(CS.simTimestampMs || Date.now()), 200);
      globe.setOrbit(path);
    } else {
      globe.setOrbit(null);
    }
    
    if (fly) {
      globe.getPos(i, flyVec.current);
      if (flyVec.current.lengthSq() > 0.01) globe.flyTo(flyVec.current);
    }
  }, []);

  const clearSelection = useCallback(() => {
    useStore.getState().setSelected(-1);
    useStore.getState().setTracking(false);
    globeRef.current?.setSelected(-1);
    globeRef.current?.setOrbit(null);
  }, []);

  const toggleTrack = useCallback(() => {
    const { selected, tracking } = useStore.getState();
    if (selected < 0 || selected >= CS.N) return;
    const next = !tracking;
    useStore.getState().setTracking(next);
    if (next) {
      const rec = CS.recs[selected];
      if (rec && !rec.error) {
        const path = sampleOrbitPath(rec, new Date(CS.simTimestampMs || Date.now()), 200);
        globeRef.current?.setOrbit(path);
      }
    } else {
      globeRef.current?.setOrbit(null);
    }
  }, []);



  // ---- AI agent helpers ------------------------------------------------
  const countWhere = useCallback((fn: (s: { group: GroupKey; band: BandKey; alt: number; lat: number; lon: number }) => boolean) => {
    let n = 0;
    for (let i = 0; i < CS.N; i++) {
      if (CS.alt[i] < 0) continue;
      if (fn({ group: CS.group[i], band: CS.band[i], alt: CS.alt[i], lat: CS.lat[i], lon: CS.lon[i] })) n++;
    }
    return n;
  }, []);

  const findSat = useCallback((query: string) => {
    const q = query.toLowerCase().trim();
    if (!q) return null;
    for (let i = 0; i < CS.N; i++) {
      const c = CS.catalog[i];
      if (!c) continue;
      if (c.name.toLowerCase() === q || String(c.satnum) === q) return { satnum: c.satnum, name: c.name };
    }
    // Partial match fallback
    for (let i = 0; i < CS.N; i++) {
      const c = CS.catalog[i];
      if (!c) continue;
      if (c.name.toLowerCase().includes(q)) return { satnum: c.satnum, name: c.name };
    }
    return null;
  }, []);

  const regionCountFor = useCallback((key: string, groups?: GroupKey[] | null) => {
    let n = 0;
    for (let i = 0; i < CS.N; i++) {
      if (CS.alt[i] < 0) continue;
      if (groups && !groups.includes(CS.group[i])) continue;
      if (matchRegion(CS.lat[i], CS.lon[i], key)) n++;
    }
    return n;
  }, []);

  const createExecutiveSnapshot = useCallback(async (sourceMode?: string) => {
    const sState = useStore.getState();
    const { getIntelligence, getMissionScenarios } = await loadIntelligenceRuntime();
    const intel = getIntelligence();
    const selectedSat = sState.selected >= 0 ? CS.catalog[sState.selected] : null;
    const missionMap = getMissionScenarios(getLang());
    const missionBrief = sState.activeMissionScenario ? missionMap[sState.activeMissionScenario] ?? null : null;

    useUserStore.getState().createSnapshot({
      simOffsetMs: sState.simMode === 'live' ? 0 : CS.simTimestampMs - Date.now(),
      sourceMode: sourceMode ?? sState.dataMode,
      totalLoaded: CS.N,
      visibleCount: sState.renderedCount,
      mostCrowdedBand: intel.mostCrowdedBand,
      highestConcentrationRegion: intel.highestConcentrationRegion,
      dominantGroup: intel.dominantGroup,
      selectedSatellite: selectedSat ? {
        name: selectedSat.name,
        satnum: selectedSat.satnum,
        lat: CS.lat[sState.selected],
        lon: CS.lon[sState.selected],
        alt: CS.alt[sState.selected],
      } : null,
      executiveBrief: null,
      missionBrief,
      riskLayerSummary: missionBrief?.riskSignal ?? null,
      caveats: ['Public TLE/SGP4-based orbital visualization. Not for flight safety or conjunction assessment.'],
    });
    useUserStore.getState().setShowSnapshotPanel(true);
    store.triggerCommandPulse('create_snapshot');
  }, [store, loadIntelligenceRuntime]);

  // ---- Run AI agent command --------------------------------------------
  const runAgent = useCallback(async (query: string, history: ConversationMessage[] = []) => {
    if (!query.trim()) return;
    setIsThinking(true);

    try {
      const state = useStore.getState();
      const groupCounts: Record<string, number> = {};
      const bandCounts = { LEO: 0, MEO: 0, GEO: 0 };
      for (let i = 0; i < CS.N; i++) {
        if (CS.alt[i] < 0) continue;
        groupCounts[CS.group[i]] = (groupCounts[CS.group[i]] ?? 0) + 1;
        if (CS.band[i] in bandCounts) bandCounts[CS.band[i] as keyof typeof bandCounts]++;
      }

      const ctx: AgentContext = {
        count: countWhere,
        find: findSat,
        groupLabel: (g: GroupKey) => (GROUPS[g] ?? GROUPS['other']).label,
        regionCount: regionCountFor,
        total: CS.N,
        rendered: state.renderedCount,
        groupCounts,
        bandCounts,
        activeRegion: state.filterRegion,
        activeBand: state.filterBand,
        activeMission: state.activeMissionScenario,
        timeOffsetMs: state.simMode === 'live' ? 0 : CS.simTimestampMs - Date.now(),
      };

      const { executeAgentCommand } = await import('../ai/agent');
      const res = await executeAgentCommand(query, ctx, getLang(), history);
      // Use the latest state since the await could take a few seconds
      const latestState = useStore.getState();
      res.sourceMode = latestState.dataMode === 'loading' ? 'fallback' : latestState.dataMode;
      res.visibleCount = latestState.renderedCount;
      setAgentResult(res);
      store.triggerCommandPulse(res.intent);

      // Apply declarative actions to store
      const a = res.actions;
      if (res.intent === 'reset') {
        store.resetFilters();
        globeRef.current?.setRegionMarker(null);
      } else {
        const hasFilter = a.groups || a.band || a.region || a.altMax != null || a.altMin != null;
        if (hasFilter) {
          store.resetFilters();
          if (a.groups && a.groups.length > 0) {
            useStore.setState({ activeGroups: new Set(a.groups) });
          }
          if (a.band) store.setFilterBand(a.band);
          if (a.altMax != null || a.altMin != null) {
            store.setAltFilter(a.altMin, a.altMax);
          }
          if (a.region) {
            store.setFilterRegion(a.region);
            const c = REGIONS[a.region]?.center;
            if (c) globeRef.current?.setRegionMarker(c[0], c[1]);
          }
        }
        if (a.viewMode && a.viewMode !== useStore.getState().viewMode) {
          setViewModeRef.current(a.viewMode);
        }
        if (a.classFilter && a.classFilter.length > 0) {
          const requested = new Set<ObjectClass>(a.classFilter);
          const next = a.excludeClasses
            ? new Set<ObjectClass>(OBJECT_CLASS_ORDER.filter((c) => !requested.has(c)))
            : requested;
          store.setActiveClasses(next);
        }
        if (a.brief) store.setShowBrief(true);
        if (a.missionScenario) {
          store.setShowMissionPanel(true);
          store.setActiveMissionScenario(a.missionScenario);
        }
        if (a.showRiskLayer) {
          store.setShowMissionPanel(true);
        }
        if (a.focusSatnum != null) {
          const idx = CS.catalog.findIndex((c) => c?.satnum === a.focusSatnum);
          if (idx >= 0 && globeRef.current) {
            selectSat(globeRef.current, idx, true);
          }
        }
        if (a.timeAction) {
          const t = a.timeAction;
          if (t.type === 'jump_time' && Number.isFinite(t.offsetMs)) {
            const offsetMs = Math.max(-MAX_AGENT_TIME_JUMP_MS, Math.min(MAX_AGENT_TIME_JUMP_MS, t.offsetMs));
            store.jumpTime(offsetMs);
          }
          if (t.type === 'set_time_speed' && Number.isFinite(t.speed)) {
            const speed = Math.max(MIN_AGENT_SPEED, Math.min(MAX_AGENT_SPEED, t.speed));
            store.setSimSpeed(speed);
          }
          if (t.type === 'set_time_mode') store.setSimMode(t.mode);
          if (t.type === 'reset_to_now') store.resetTime();
          if (t.type === 'pause_simulation') store.setSimMode('paused');
          if (t.type === 'resume_simulation') store.setSimMode('simulating');
        }
        if (a.watchlistAction) {
          const uStore = useUserStore.getState();
          if (a.watchlistAction === 'show') {
            uStore.setShowWatchlistPanel(true);
          } else if (a.watchlistAction === 'add') {
            const { selected } = useStore.getState();
            if (selected >= 0 && CS.catalog[selected]) {
              const s = CS.catalog[selected];
              uStore.addToWatchlist({
                name: s.name,
                satnum: s.satnum,
                group: CS.group[selected],
                band: CS.band[selected],
                alt: CS.alt[selected],
                region: 'Unknown',
                sourceMode: res.sourceMode,
              });
              uStore.setShowWatchlistPanel(true);
            }
          } else if (a.watchlistAction === 'remove') {
            const { selected } = useStore.getState();
            if (selected >= 0 && CS.catalog[selected]) {
              uStore.removeFromWatchlist(CS.catalog[selected].satnum);
            }
          }
        }
      
        if (a.savedViewAction) {
          const uStore = useUserStore.getState();
          if (a.savedViewAction.type === 'load' || a.savedViewAction.type === 'recommend') {
            uStore.setShowSavedViewsPanel(true);
          } else if (a.savedViewAction.type === 'save') {
            const sState = useStore.getState();
            uStore.saveView({
              name: a.savedViewAction.payload || `View ${new Date().toLocaleTimeString()}`,
              description: 'Saved by AI Command Agent',
              filters: {
                groups: Array.from(sState.activeGroups),
                band: sState.filterBand,
                region: sState.filterRegion,
                altMin: sState.altMin,
                altMax: sState.altMax,
              },
              simMode: sState.simMode,
              simOffsetMs: sState.simMode === 'live' ? 0 : CS.simTimestampMs - Date.now(),
              missionScenario: sState.activeMissionScenario,
              showRiskLayer: sState.showRiskLayer,
              lang: getLang(),
            });
            uStore.setShowSavedViewsPanel(true);
          }
        }

        if (a.snapshotAction) {
          const uStore = useUserStore.getState();
          if (a.snapshotAction === 'export') {
            uStore.setShowSnapshotPanel(true);
          } else if (a.snapshotAction === 'create') {
            await createExecutiveSnapshot(res.sourceMode);
          }
        }
      }
      // Re-apply filters explicitly to get fresh counts
      applyFilter();
    } catch (err) {
      const latestState = useStore.getState();
      console.error('Agent command failed:', err);
      latestState.setAgentHealth('fallback');
      setAgentResult({
        answer: getLang() === 'es'
          ? 'No pude completar ese comando. El agente local sigue disponible; intenta una consulta más específica.'
          : 'I could not complete that command. The local agent remains available; try a more specific query.',
        intent: 'agent_error',
        confidence: 0,
        assumptions: [],
        actions: {
          groups: null, band: null, region: null,
          altMax: null, altMin: null, focusSatnum: null, brief: false,
          missionScenario: null, showRiskLayer: false,
          timeAction: null,
        },
        filtersApplied: {},
        visibleCount: latestState.renderedCount,
        sourceMode: latestState.dataMode === 'loading' ? 'fallback' : latestState.dataMode,
        responseMode: 'deterministic',
        safetyCaveat: getLang() === 'es'
          ? 'Fallo controlado del agente. No se aplicaron acciones nuevas.'
          : 'Controlled agent failure. No new actions were applied.',
      });
    } finally {
      setIsThinking(false);
    }

  }, [countWhere, findSat, regionCountFor, store, selectSat, applyFilter, createExecutiveSnapshot]); // history passed as arg, not dep

  // ---- Catalog view mode switch (Expanded Orbital Environment) ----------
  const handleSetViewMode = useCallback(async (mode: ViewMode) => {
    const globe = globeRef.current;
    if (!globe) return;
    if (useStore.getState().viewMode === mode && CS.N > 0) return;

    const s = useStore.getState();
    s.setViewMode(mode);
    s.resetFilters();
    s.setModeLoading(true);
    clearSelection();
    store.triggerCommandPulse(`view_mode_${mode}`);

    try {
      const result = await loadSatellites(mode);
      if (!isMountedRef.current) return;
      loadCatalog(globe, result.catalog);
      const st = useStore.getState();
      st.setDataMode(result.dataMode);
      if (result.meta) {
        st.setTleMeta(result.meta);
        if (result.meta.sourceHealth) st.setTleHealth(result.meta.sourceHealth);
      }
      refreshIntel();
      applyFilter();
      globe.renderOnce();
    } catch (err) {
      console.error('View mode switch failed:', err);
    } finally {
      useStore.getState().setModeLoading(false);
    }
  }, [store, loadCatalog, clearSelection, refreshIntel, applyFilter]);

  useEffect(() => { setViewModeRef.current = handleSetViewMode; }, [handleSetViewMode]);

  // ---- Language switch -------------------------------------------------
  const handleSetLang = useCallback((l: 'en' | 'es') => {
    setLang(l);
    store.setLang(l);
  }, [store]);

  // ---- Intelligence toggle ---------------------------------------------
  const handleToggleIntel = useCallback(() => {
    store.setShowIntelligence(!store.showIntelligence);
  }, [store]);

  const handleToggleMission = useCallback(() => {
    const next = !useStore.getState().showMissionPanel;
    store.setShowMissionPanel(next);
    if (next) {
      store.setShowRiskLayer(true);
      store.setVisualQuality('presentation');
      globeRef.current?.resetView();
    } else {
      store.setShowRiskLayer(false);
    }
  }, [store]);

  const handleToggleCinematic = useCallback(() => {
    const next = !useStore.getState().cinematicMode;
    store.setCinematicMode(next);
    if (next) {
      store.setAutoRotate(true);
      store.setVisualQuality('presentation');
      globeRef.current?.setAutoRotate(true);
      globeRef.current?.resetView();
    }
  }, [store]);

  // Mobile: downgrade quality and cap rendered points
  useEffect(() => {
    if (isMobile && useStore.getState().visualQuality === 'cinematic') {
      store.setVisualQuality('performance');
    }
  }, [isMobile, store]);

  useEffect(() => {
    globeRef.current?.setVisualQuality(store.visualQuality);
  }, [store.visualQuality]);

  useEffect(() => {
    globeRef.current?.setVisualContext({
      activeBand: store.filterBand,
      activeGroups: Array.from(store.activeGroups),
      regionActive: !!store.filterRegion,
      missionActive: store.showMissionPanel || store.showRiskLayer || !!store.activeMissionScenario,
    });
  }, [store.filterBand, store.activeGroups, store.filterRegion, store.showMissionPanel, store.showRiskLayer, store.activeMissionScenario]);

  // ---- Keyboard shortcuts (expanded) ----------------------------------
  useKeyboardShortcuts({
    onResetView: () => globeRef.current?.resetView(),
    onClearSelection: clearSelection,
    onFocusAgent: () => {
      const el = document.getElementById('agentInput') as HTMLInputElement | null;
      el?.focus();
      agentInputRef.current = el;
    },
  });

  // ---- Sync filterRegion → globe region marker (on filter panel changes) --
  useEffect(() => {
    const unsub = useStore.subscribe((state, prev) => {
      if (state.filterRegion !== prev.filterRegion) {
        if (state.filterRegion) {
          const c = REGIONS[state.filterRegion]?.center;
          if (c) globeRef.current?.setRegionMarker(c[0], c[1]);
        } else {
          globeRef.current?.setRegionMarker(null);
        }
      }
      if (state.autoRotate !== prev.autoRotate) {
        globeRef.current?.setAutoRotate(state.autoRotate);
      }
    });
    return unsub;
  }, []);

  const { showBrief, showIntelligence, isLoading, selected, activeMobileTab, cinematicMode, showMissionPanel } = store;
  const missionOpen = showMissionPanel || activeMobileTab === 'mission';

  return (
    <>
      {/* Globe canvas — imperative Three.js, behind the UI */}
      <Suspense fallback={null}>
        <GlobeMount onReady={onGlobeReady} onError={() => useStore.getState().setLoading(false)} />
      </Suspense>

      {/* Loading veil */}
      {isLoading && (
        <div id="loading" className="loading" role="status" aria-live="polite">
          <div className="loading-orbit"><div className="loading-core" /></div>
          <div className="loading-brand">OrbitIQ</div>
          <div className="loading-tag">{t('tagline')}</div>
          <div className="loading-status">
            <i />{t('loading_elements')}
          </div>
        </div>
      )}
      <Suspense fallback={null}>
        <TourModal />
      </Suspense>
      <CommandVisualLayer />
      {missionOpen && (
        <Suspense fallback={null}>
          <MissionCinematicCue missionOpen={missionOpen} activeMissionScenario={store.activeMissionScenario} lang={store.lang} />
        </Suspense>
      )}

      {/* UI overlay */}
      <div id="ui" className={`ui mobile-tab-${activeMobileTab}${cinematicMode ? ' cinematic' : ''}${missionOpen ? ' mission-open' : ''}${userStore.showSnapshotPanel ? ' snapshot-open' : ''}`}>
        <main id="main-content" className="sr-only" aria-label="OrbitIQ main content" tabIndex={-1} />
        <TopBar
          onOpenBrief={() => store.setShowBrief(true)}
          onResetView={() => globeRef.current?.resetView()}
          onToggleRotate={() => store.setAutoRotate(!store.autoRotate)}
          onSetLang={handleSetLang}
          onToggleIntel={handleToggleIntel}
          onToggleMission={handleToggleMission}
          onToggleCinematic={handleToggleCinematic}
          intelligence={intelligence}
        />

        <Suspense fallback={null}>
          <ViewModeSelector
            mode={store.viewMode}
            loading={store.modeLoading}
            meta={store.tleMeta}
            onSetMode={handleSetViewMode}
          />
        </Suspense>

        {store.showDataHealthPanel && (
          <Suspense fallback={null}>
            <DataHealthPanel />
          </Suspense>
        )}

        <aside className="left">
          <AgentPanel onRun={runAgent} lastResult={agentResult} isThinking={isThinking} agentInputRef={agentInputRef} />
          <CatalogPanel onSelectSat={(i) => globeRef.current && selectSat(globeRef.current, i, true)} />
        </aside>

        {selected >= 0 && CS.catalog[selected] && (
          <Suspense fallback={<SidePanelSkeleton />}>
            <DetailPanel onClose={clearSelection} onToggleTrack={toggleTrack} />
          </Suspense>
        )}

        {/* Intelligence panel — only when no detail panel and toggle is on (or mobile tab is active) */}
        {(showIntelligence && selected < 0 || activeMobileTab === 'intel') && (
          <Suspense fallback={<SidePanelSkeleton />}>
            <OrbitalIntelligencePanel
              intelligence={intelligence}
              onClose={() => {
                store.setShowIntelligence(false);
                if (activeMobileTab === 'intel') store.setActiveMobileTab('globe');
              }}
            />
          </Suspense>
        )}

        {missionOpen && (
          <Suspense fallback={<SidePanelSkeleton />}>
            <MissionPanel />
          </Suspense>
        )}

        {userStore.showWatchlistPanel && (
          <Suspense fallback={<SidePanelSkeleton />}>
            <WatchlistPanel
              onClose={() => userStore.setShowWatchlistPanel(false)}
              onSelectSatnum={(s) => {
                const idx = CS.catalog.findIndex(c => c && c.satnum === s);
                if (idx >= 0 && globeRef.current) selectSat(globeRef.current, idx, true);
              }}
            />
          </Suspense>
        )}
        {userStore.showSavedViewsPanel && (
          <Suspense fallback={<SidePanelSkeleton />}>
            <SavedViewsPanel onClose={() => userStore.setShowSavedViewsPanel(false)} />
          </Suspense>
        )}
        {userStore.showSnapshotPanel && (
          <Suspense fallback={<SidePanelSkeleton />}>
            <SnapshotPanel onClose={() => userStore.setShowSnapshotPanel(false)} />
          </Suspense>
        )}

        <TimeControlsPanel />
        <BottomTabBar />

        {/* Live Telemetry Ticker */}
        <div className="telemetry-ticker" style={{
          position: 'fixed', bottom: 285, left: '50%', transform: 'translateX(-50%)',
          color: '#4cc9f0', fontSize: '10px', fontFamily: '"IBM Plex Mono", monospace',
          opacity: 0.55, whiteSpace: 'nowrap', letterSpacing: '0.5px',
          textShadow: '0 0 8px rgba(76,201,240,0.3)',
        }}>
          ● {tickerMsg}
        </div>

        <Legend />

        <footer className="disclaimer" role="contentinfo">
          {t('disclaimer')}
        </footer>
        <AttributionBadge />

        {showBrief && (
          <Suspense fallback={<ModalSkeleton />}>
            <BriefModal onClose={() => store.setShowBrief(false)} />
          </Suspense>
        )}
      </div>
    </>
  );
}
