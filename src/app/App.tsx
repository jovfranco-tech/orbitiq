// ============================================================
// OrbitIQ Command Center v0.3.0 — App root
// ============================================================
import { lazy, Suspense, useRef, useCallback, useEffect, useState } from 'react';
import { useGlobeKeyboard } from '../hooks/useGlobeKeyboard';
import { useWorker } from '../hooks/useWorker';
import { useAgentActions } from '../hooks/useAgentActions';
import { GlobeMount } from '../components/globe/GlobeMount';
import { GlobeHelp } from '../components/globe/GlobeHelp';
import { TopBar } from '../components/dashboard/TopBar';
import { Legend } from '../components/dashboard/Legend';
import { AgentPanel } from '../components/panels/AgentPanel';
import { CatalogPanel } from '../components/panels/CatalogPanel';
import { TimeControlsPanel } from '../components/panels/TimeControlsPanel';
import { BottomTabBar } from '../components/dashboard/BottomTabBar';
import { AttributionBadge } from '../components/dashboard/AttributionBadge';
import { CommandVisualLayer } from '../components/dashboard/CommandVisualLayer';
import { MissionCinematicCue } from '../components/dashboard/MissionCinematicCue';
import { useStore } from '../state/store';
import { useUserStore } from '../state/userStore';
import { PanelErrorBoundary } from '../components/PanelErrorBoundary';
import { CS, initCatalogStore } from '../state/catalogStore';
import { loadSatellites } from '../data/client';
import { GROUPS, classifyGroup } from '../data/groups';
import { buildRecords, dataAgeDays, sampleOrbitPath } from '../orbital/propagator';
import { matchRegion, REGIONS } from '../regions/regions';
import { setLang, t } from '../i18n/i18n';
import { getIntelligence, invalidateIntelligence } from '../intelligence/intelligence';
import * as THREE from 'three';
import { useLiveTelemetry } from '../hooks/useLiveTelemetry';
import type { GlobeApi, IntelligenceSummary } from '../types';

const MissionPanel = lazy(() => import('../components/panels/MissionPanel').then((m) => ({ default: m.MissionPanel })));
const DetailPanel = lazy(() => import('../components/panels/DetailPanel').then((m) => ({ default: m.DetailPanel })));
const BriefModal = lazy(() => import('../components/panels/BriefModal').then((m) => ({ default: m.BriefModal })));
const TourModal = lazy(() => import('../components/panels/TourModal').then((m) => ({ default: m.TourModal })));
const OrbitalIntelligencePanel = lazy(() => import('../components/panels/OrbitalIntelligencePanel').then((m) => ({ default: m.OrbitalIntelligencePanel })));
const WatchlistPanel = lazy(() => import('../components/panels/WatchlistPanel').then((m) => ({ default: m.WatchlistPanel })));
const SavedViewsPanel = lazy(() => import('../components/panels/SavedViewsPanel').then((m) => ({ default: m.SavedViewsPanel })));
const SnapshotPanel = lazy(() => import('../components/panels/SnapshotPanel').then((m) => ({ default: m.SnapshotPanel })));
const DataHealthPanel = lazy(() => import('../components/panels/DataHealthPanel').then((m) => ({ default: m.DataHealthPanel })));

// ---- Hex color → [r,g,b] 0–1 ----------------------------------------
function hexToRGB(h: string): [number, number, number] {
  const n = parseInt(h.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

export function App() {
  const globeRef = useRef<GlobeApi | null>(null);
  const tickRef  = useRef<ReturnType<typeof setInterval> | null>(null);
  const intelRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Stable Vector3 reused for fly-to — avoids creating objects each pick
  const flyVec   = useRef(new THREE.Vector3());

  const { tickerMsg } = useLiveTelemetry();
  const [intelligence, setIntelligence] = useState<IntelligenceSummary | null>(null);

  const store = useStore();
  const userStore = useUserStore();

  // ---- Intelligence refresh (decoupled from tick) -----------------------
  const refreshIntel = useCallback(() => {
    if (CS.N === 0) return;
    setIntelligence(getIntelligence());
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
      CS.vis[i] = matches ? 1 : hasLayerFilter && CS.alt[i] >= 0 ? 0.075 : 0;
      if (matches) rendered++;
      if (filterRegion && matches) regionCount++;
    }
    if (selected >= 0 && selected < CS.N) CS.vis[selected] = 1;
    globe.setVisible(CS.vis);
    useStore.getState().setCounts(CS.N, rendered, regionCount);
  }, []);

  // ---- Web Worker (propagation tick + lifecycle) -----------------------
  const { tick, workerRef } = useWorker({ globeRef, applyFilter, tickIntervalRef: tickRef, intelIntervalRef: intelRef, refreshIntel });

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
    globe.setVisualQuality(useStore.getState().visualQuality);
    globe.onPick((i) => { if (i >= 0) selectSat(globe, i, true); });

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
  }, [loadCatalog, tick, refreshIntel]);

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

  // ---- AI agent (command parsing + declarative action dispatch) --------
  const { runAgent, isThinking, agentResult } = useAgentActions({ globeRef, selectSat, applyFilter });

  // ---- Language switch -------------------------------------------------
  const handleSetLang = useCallback((l: 'en' | 'es') => {
    setLang(l);
    store.setLang(l);
    document.documentElement.lang = l;
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

  useEffect(() => {
    if (window.matchMedia('(max-width: 768px)').matches && useStore.getState().visualQuality === 'cinematic') {
      store.setVisualQuality('performance');
    }
    document.documentElement.lang = store.lang;
  }, [store]);

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

  // ---- Keyboard shortcuts (globe nav + Escape) — delegated to hook ----
  useGlobeKeyboard({ globeRef, clearSelection, selectSat });

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
      <GlobeMount onReady={onGlobeReady} onError={() => useStore.getState().setLoading(false)} />
      {!isLoading && <GlobeHelp />}

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
      <MissionCinematicCue missionOpen={missionOpen} activeMissionScenario={store.activeMissionScenario} lang={store.lang} />

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

        {store.showDataHealthPanel && (
          <Suspense fallback={null}>
            <DataHealthPanel />
          </Suspense>
        )}

        <aside className="left">
          <AgentPanel onRun={runAgent} lastResult={agentResult} isThinking={isThinking} />
          <CatalogPanel onSelectSat={(i) => globeRef.current && selectSat(globeRef.current, i, true)} />
        </aside>

        {selected >= 0 && CS.catalog[selected] && (
          <PanelErrorBoundary panelName="Detail">
            <Suspense fallback={null}>
              <DetailPanel onClose={clearSelection} onToggleTrack={toggleTrack} />
            </Suspense>
          </PanelErrorBoundary>
        )}

        {/* Intelligence panel — only when no detail panel and toggle is on (or mobile tab is active) */}
        {(showIntelligence && selected < 0 || activeMobileTab === 'intel') && (
          <PanelErrorBoundary panelName="Intelligence">
            <Suspense fallback={null}>
              <OrbitalIntelligencePanel
                intelligence={intelligence}
                onClose={() => {
                  store.setShowIntelligence(false);
                  if (activeMobileTab === 'intel') store.setActiveMobileTab('globe');
                }}
              />
            </Suspense>
          </PanelErrorBoundary>
        )}

        {missionOpen && (
          <PanelErrorBoundary panelName="Mission">
            <Suspense fallback={null}>
              <MissionPanel />
            </Suspense>
          </PanelErrorBoundary>
        )}

        {userStore.showWatchlistPanel && (
          <PanelErrorBoundary panelName="Watchlist">
            <Suspense fallback={null}>
              <WatchlistPanel
                onClose={() => userStore.setShowWatchlistPanel(false)}
                onSelectSatnum={(s) => {
                  const idx = CS.catalog.findIndex(c => c && c.satnum === s);
                  if (idx >= 0 && globeRef.current) selectSat(globeRef.current, idx, true);
                }}
              />
            </Suspense>
          </PanelErrorBoundary>
        )}
        {userStore.showSavedViewsPanel && (
          <PanelErrorBoundary panelName="Saved Views">
            <Suspense fallback={null}>
              <SavedViewsPanel onClose={() => userStore.setShowSavedViewsPanel(false)} />
            </Suspense>
          </PanelErrorBoundary>
        )}
        {userStore.showSnapshotPanel && (
          <PanelErrorBoundary panelName="Snapshots">
            <Suspense fallback={null}>
              <SnapshotPanel onClose={() => userStore.setShowSnapshotPanel(false)} />
            </Suspense>
          </PanelErrorBoundary>
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
          <PanelErrorBoundary panelName="Executive Brief">
            <Suspense fallback={null}>
              <BriefModal onClose={() => store.setShowBrief(false)} />
            </Suspense>
          </PanelErrorBoundary>
        )}
      </div>
    </>
  );
}
