// ============================================================
// OrbitIQ Command Center v0.3.0 — App root
// ============================================================
import { useRef, useCallback, useEffect, useState } from 'react';
import { GlobeMount } from '../components/globe/GlobeMount';
import { TopBar } from '../components/dashboard/TopBar';
import { Legend } from '../components/dashboard/Legend';
import { AgentPanel } from '../components/panels/AgentPanel';
import { CatalogPanel } from '../components/panels/CatalogPanel';
import { MissionPanel } from '../components/panels/MissionPanel';
import { DetailPanel } from '../components/panels/DetailPanel';
import { BriefModal } from '../components/panels/BriefModal';
import { TourModal } from '../components/panels/TourModal';
import { OrbitalIntelligencePanel } from '../components/panels/OrbitalIntelligencePanel';
import { TimeControlsPanel } from '../components/panels/TimeControlsPanel';
import { WatchlistPanel } from '../components/panels/WatchlistPanel';
import { SavedViewsPanel } from '../components/panels/SavedViewsPanel';
import { SnapshotPanel } from '../components/panels/SnapshotPanel';
import { DataHealthPanel } from '../components/panels/DataHealthPanel';
import { BottomTabBar } from '../components/dashboard/BottomTabBar';
import { useStore } from '../state/store';
import { useUserStore } from '../state/userStore';
import { CS, initCatalogStore } from '../state/catalogStore';
import { loadSatellites } from '../data/client';
import { GROUPS, classifyGroup } from '../data/groups';
import { buildRecords, dataAgeDays, sampleOrbitPath } from '../orbital/propagator';
import { matchRegion, REGIONS } from '../regions/regions';
import { executeAgentCommand } from '../ai/agent';
import type { AgentContext } from '../ai/agent';
import { getLang, setLang, t } from '../i18n/i18n';
import { getIntelligence, invalidateIntelligence } from '../intelligence/intelligence';
import * as THREE from 'three';
import { useLiveTelemetry } from '../hooks/useLiveTelemetry';
import type { GlobeApi, IntelligenceSummary } from '../types';
import type { AiAgentResponse, GroupKey, BandKey } from '../types';

// ---- Hex color → [r,g,b] 0–1 ----------------------------------------
function hexToRGB(h: string): [number, number, number] {
  const n = parseInt(h.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

const TICK_MS = 900;
const INTEL_REFRESH_MS = 2000;
const MAX_AGENT_TIME_JUMP_MS = 7 * 24 * 60 * 60 * 1000;
const MIN_AGENT_SPEED = 0.25;
const MAX_AGENT_SPEED = 360;

export function App() {
  const globeRef  = useRef<GlobeApi | null>(null);
  const tickRef   = useRef<ReturnType<typeof setInterval> | null>(null);
  const intelRef  = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastTickTimeRef = useRef<number>(performance.now());
  // Stable Vector3 reused for fly-to — avoids creating objects each pick
  const flyVec    = useRef(new THREE.Vector3());

  const workerRef = useRef<Worker | null>(null);
  const workerReadyRef = useRef(false);
  const isWorkerBusyRef = useRef(false);

  const [agentResult, setAgentResult] = useState<AiAgentResponse | null>(null);
  const [isThinking, setIsThinking]   = useState(false);
  const { tickerMsg } = useLiveTelemetry();
  const [intelligence, setIntelligence] = useState<IntelligenceSummary | null>(null);

  const store = useStore();
  const userStore = useUserStore();

  // ---- Intelligence refresh (decoupled from tick) -----------------------
  const refreshIntel = useCallback(() => {
    if (CS.N === 0) return;
    const intel = getIntelligence();
    setIntelligence(intel);
  }, []);

  // ---- Filter pass (hot path) ------------------------------------------
  const applyFilter = useCallback(() => {
    if (!globeRef.current) return;
    const globe = globeRef.current;
    const { activeGroups, filterBand, filterRegion, altMin, altMax, selected } = useStore.getState();
    const hasLayerFilter = !!activeGroups.size || !!filterBand || !!filterRegion || altMin != null || altMax != null;
    let rendered = 0, regionCount = 0;
    for (let i = 0; i < CS.N; i++) {
      let matches = true;
      if (CS.alt[i] < 0) matches = false;
      else if (activeGroups.size && !activeGroups.has(CS.group[i])) matches = false;
      else if (filterBand && CS.band[i] !== filterBand) matches = false;
      else if (altMax != null && CS.alt[i] > altMax) matches = false;
      else if (altMin != null && CS.alt[i] < altMin) matches = false;
      else if (filterRegion && !matchRegion(CS.lat[i], CS.lon[i], filterRegion)) matches = false;
      CS.vis[i] = matches ? 1 : hasLayerFilter && CS.alt[i] >= 0 ? 0.16 : 0;
      if (matches) rendered++;
      if (filterRegion && matches) regionCount++;
    }
    if (selected >= 0 && selected < CS.N) CS.vis[selected] = 1;
    globe.setVisible(CS.vis);
    useStore.getState().setCounts(CS.N, rendered, regionCount);
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
    workerRef.current.postMessage({ type: 'TICK', payload: { timestampMs: CS.simTimestampMs } });
  }, []);

  // ---- Load catalog into GPU buffers -----------------------------------
  const loadCatalog = useCallback((globe: GlobeApi, catalog: typeof CS.catalog) => {
    const cleanCatalog = (catalog || []).filter(Boolean);
    CS.catalog = cleanCatalog;
    CS.recs    = buildRecords(cleanCatalog);
    initCatalogStore(cleanCatalog.length);

    const colorCache: Record<string, [number, number, number]> = {};
    for (let i = 0; i < CS.N; i++) {
      const g = cleanCatalog[i].group ?? classifyGroup(cleanCatalog[i].name, cleanCatalog[i].altNominal ?? 600);
      CS.group[i] = g;
      if (!colorCache[g]) colorCache[g] = hexToRGB((GROUPS[g] ?? GROUPS['other']).color);
      const c = colorCache[g];
      CS.colorBase[i * 3] = c[0]; CS.colorBase[i * 3 + 1] = c[1]; CS.colorBase[i * 3 + 2] = c[2];
    }

    globe.allocate(CS.N);
    globe.setColors(CS.colorBase);

    workerRef.current?.postMessage({ type: 'INIT', payload: { catalog } });

    const validRec = CS.recs.find((r) => r && !r.error);
    if (validRec) useStore.getState().setAgeDays(dataAgeDays(validRec, new Date()));
    invalidateIntelligence();
  }, []);

  // ---- Globe ready (called once after mount) ---------------------------
  const onGlobeReady = useCallback(async (globe: GlobeApi) => {
    globeRef.current = globe;
    globe.setAutoRotate(true);
    globe.onPick((i) => { if (i >= 0) selectSat(globe, i, false); });

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

    tick();
    refreshIntel();

    const reveal = () => {
      document.getElementById('loading')?.classList.add('gone');
      setTimeout(() => {
        const l = document.getElementById('loading');
        if (l) l.style.display = 'none';
      }, 800);
    };
    globe.ready.then(reveal);
    setTimeout(reveal, 4500);

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
        const { timestampMs, gmst, posBuf, lat, lon, alt, band } = e.data.payload;
        
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

  // ---- URL State Sync --------------------------------------------------
  useEffect(() => {
    const sStore = useStore.getState();
    const params = new URLSearchParams();
    if (sStore.filterBand) params.set('band', sStore.filterBand);
    if (sStore.filterRegion) params.set('region', sStore.filterRegion);
    if (sStore.activeGroups.size > 0) params.set('groups', Array.from(sStore.activeGroups).join(','));
    if (sStore.selected >= 0 && CS.catalog[sStore.selected]) params.set('sat', CS.catalog[sStore.selected].satnum.toString());
    const hash = params.toString();
    const newUrl = hash ? `${window.location.pathname}#${hash}` : window.location.pathname;
    window.history.replaceState(null, '', newUrl);
  }, [
    useStore(s => s.filterBand),
    useStore(s => s.filterRegion),
    useStore(s => s.activeGroups),
    useStore(s => s.selected)
  ]);

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
      if (flyVec.current.lengthSq() > 0.01) globe.flyTo(flyVec.current as never);
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

  // ---- Run AI agent command --------------------------------------------
  const runAgent = useCallback(async (query: string) => {
    if (!query.trim()) return;
    setIsThinking(true);

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

    const res = await executeAgentCommand(query, ctx, getLang());
    // Use the latest state since the await could take a few seconds
    const latestState = useStore.getState();
    res.sourceMode = latestState.dataMode === 'loading' ? 'fallback' : latestState.dataMode;
    res.visibleCount = latestState.renderedCount;
    setAgentResult(res);

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
          const sState = useStore.getState();
          const intel = getIntelligence();
          const sel = sState.selected >= 0 ? CS.catalog[sState.selected] : null;
          uStore.createSnapshot({
            simOffsetMs: sState.simMode === 'live' ? 0 : CS.simTimestampMs - Date.now(),
            sourceMode: res.sourceMode,
            totalLoaded: CS.N,
            visibleCount: sState.renderedCount,
            mostCrowdedBand: intel.mostCrowdedBand,
            highestConcentrationRegion: intel.highestConcentrationRegion,
            dominantGroup: intel.dominantGroup,
            selectedSatellite: sel ? {
              name: sel.name, satnum: sel.satnum,
              lat: CS.lat[sState.selected], lon: CS.lon[sState.selected], alt: CS.alt[sState.selected]
            } : null,
            executiveBrief: null,
            missionBrief: null,
            riskLayerSummary: null,
            caveats: ['Public TLE/SGP4-based orbital visualization. Not for flight safety or conjunction assessment.']
          });
          uStore.setShowSnapshotPanel(true);
        }
      }
    }
    // Re-apply filters explicitly to get fresh counts
    applyFilter();

    setIsThinking(false);
  }, [countWhere, findSat, regionCountFor, store, selectSat, applyFilter]);

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
    store.setShowMissionPanel(!store.showMissionPanel);
  }, [store]);

  // ---- Keyboard shortcuts ---------------------------------------------
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        store.setShowBrief(false);
        clearSelection();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [store, clearSelection]);

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

  const { showBrief, showIntelligence, isLoading, selected, activeMobileTab } = store;

  return (
    <>
      {/* Globe canvas — imperative Three.js, behind the UI */}
      <GlobeMount onReady={onGlobeReady} onError={() => useStore.getState().setLoading(false)} />

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
      <TourModal />

      {/* UI overlay */}
      <div id="ui" className={`ui mobile-tab-${activeMobileTab}`}>
        <TopBar
          onOpenBrief={() => store.setShowBrief(true)}
          onResetView={() => globeRef.current?.resetView()}
          onToggleRotate={() => store.setAutoRotate(!store.autoRotate)}
          onSetLang={handleSetLang}
          onToggleIntel={handleToggleIntel}
          onToggleMission={handleToggleMission}
          intelligence={intelligence}
        />

        <aside className="left">
          <DataHealthPanel />
          <AgentPanel onRun={runAgent} lastResult={agentResult} isThinking={isThinking} />
          <CatalogPanel onSelectSat={(i) => globeRef.current && selectSat(globeRef.current, i, true)} />
        </aside>

        {selected >= 0 && CS.catalog[selected] && (
          <DetailPanel onClose={clearSelection} onToggleTrack={toggleTrack} />
        )}

        {/* Intelligence panel — only when no detail panel and toggle is on (or mobile tab is active) */}
        {(showIntelligence && selected < 0 || activeMobileTab === 'intel') && (
          <OrbitalIntelligencePanel
            intelligence={intelligence}
            onClose={() => {
              store.setShowIntelligence(false);
              if (activeMobileTab === 'intel') store.setActiveMobileTab('globe');
            }}
          />
        )}
        
        {(store.showMissionPanel || activeMobileTab === 'mission') && <MissionPanel />}

        {userStore.showWatchlistPanel && (
          <WatchlistPanel 
            onClose={() => userStore.setShowWatchlistPanel(false)} 
            onSelectSatnum={(s) => {
              const idx = CS.catalog.findIndex(c => c && c.satnum === s);
              if (idx >= 0 && globeRef.current) selectSat(globeRef.current, idx, true);
            }} 
          />
        )}
        {userStore.showSavedViewsPanel && <SavedViewsPanel onClose={() => userStore.setShowSavedViewsPanel(false)} />}
        {userStore.showSnapshotPanel && <SnapshotPanel onClose={() => userStore.setShowSnapshotPanel(false)} />}

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

        {showBrief && <BriefModal onClose={() => store.setShowBrief(false)} />}
      </div>
    </>
  );
}
