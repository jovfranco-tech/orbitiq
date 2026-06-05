// ============================================================
// OrbitIQ Command Center v0.3.0 — App root
// ============================================================
import { useRef, useCallback, useEffect, useState } from 'react';
// satellite.js bundled dep — imported once at module level for the hot tick loop
import * as satJs from 'satellite.js';
import { GlobeMount } from '../components/globe/GlobeMount';
import { TopBar } from '../components/dashboard/TopBar';
import { Legend } from '../components/dashboard/Legend';
import { AgentPanel } from '../components/panels/AgentPanel';
import { CatalogPanel } from '../components/panels/CatalogPanel';
import { MissionPanel } from '../components/panels/MissionPanel';
import { DetailPanel } from '../components/panels/DetailPanel';
import { BriefModal } from '../components/panels/BriefModal';
import { OrbitalIntelligencePanel } from '../components/panels/OrbitalIntelligencePanel';
import { TimeControlsPanel } from '../components/panels/TimeControlsPanel';
import { useStore } from '../state/store';
import { CS, initCatalogStore } from '../state/catalogStore';
import { loadSatellites } from '../data/client';
import { bandFromAltitude, GROUPS, classifyGroup } from '../data/groups';
import { buildRecords, dataAgeDays, sampleOrbitPath } from '../orbital/propagator';
import { matchRegion, REGIONS } from '../regions/regions';
import { executeAgentCommand } from '../ai/agent';
import { getLang, setLang, t } from '../i18n/i18n';
import { getIntelligence, invalidateIntelligence } from '../intelligence/intelligence';
import * as THREE from 'three';
import type { GlobeApi, IntelligenceSummary } from '../types';
import type { AiAgentResponse, GroupKey, BandKey } from '../types';

// ---- Hex color → [r,g,b] 0–1 ----------------------------------------
function hexToRGB(h: string): [number, number, number] {
  const n = parseInt(h.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

const TICK_MS = 900;
const INTEL_REFRESH_MS = 2000;

export function App() {
  const globeRef  = useRef<GlobeApi | null>(null);
  const tickRef   = useRef<ReturnType<typeof setInterval> | null>(null);
  const intelRef  = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastTickTimeRef = useRef<number>(performance.now());
  // Stable Vector3 reused for fly-to — avoids creating objects each pick
  const flyVec    = useRef(new THREE.Vector3());

  const [agentResult, setAgentResult] = useState<AiAgentResponse | null>(null);
  const [isThinking, setIsThinking]   = useState(false);
  const [intelligence, setIntelligence] = useState<IntelligenceSummary | null>(null);

  const store = useStore();

  // ---- Intelligence refresh (decoupled from tick) -----------------------
  const refreshIntel = useCallback(() => {
    if (CS.N === 0) return;
    const intel = getIntelligence();
    setIntelligence(intel);
  }, []);

  // ---- Propagation tick (hot path — zero React state writes per frame) ----
  // NOTE: tick accesses store state via getState() to avoid stale closure.
  const tick = useCallback(() => {
    if (!globeRef.current || CS.N === 0) return;
    
    const nowPerf = performance.now();
    const dt = nowPerf - lastTickTimeRef.current;
    lastTickTimeRef.current = nowPerf;
    
    const storeState = useStore.getState();
    if (storeState.simMode === 'live') {
      CS.simTimestampMs = Date.now();
    } else if (storeState.simMode === 'simulating') {
      CS.simTimestampMs += dt * storeState.simSpeed;
    }
    
    const globe = globeRef.current;
    const date  = new Date(CS.simTimestampMs);
    const scale = 1.0 / 6378.137;

    const gmst = satJs.gstime(date) as number;

    for (let i = 0; i < CS.N; i++) {
      const r = CS.recs[i];
      const j = i * 3;
      if (!r || r.error) {
        CS.posBuf[j] = CS.posBuf[j + 1] = CS.posBuf[j + 2] = 0;
        CS.alt[i] = -1; CS.lat[i] = 0; CS.lon[i] = 0; CS.band[i] = 'LEO';
        continue;
      }
      const pv = satJs.propagate(r as never, date) as { position?: { x: number; y: number; z: number } };
      if (pv?.position && isFinite(pv.position.x)) {
        const p = pv.position;
        CS.posBuf[j]     = p.x * scale;
        CS.posBuf[j + 1] = p.z * scale;
        CS.posBuf[j + 2] = -p.y * scale;
        const gd = satJs.eciToGeodetic(p as never, gmst as never) as { latitude: number; longitude: number; height: number };
        CS.lat[i]  = satJs.degreesLat(gd.latitude as never) as number;
        CS.lon[i]  = satJs.degreesLong(gd.longitude as never) as number;
        CS.alt[i]  = gd.height;
        CS.band[i] = bandFromAltitude(gd.height);
      } else {
        CS.posBuf[j] = CS.posBuf[j + 1] = CS.posBuf[j + 2] = 0;
        CS.alt[i] = -1; CS.lat[i] = 0; CS.lon[i] = 0; CS.band[i] = 'LEO';
      }
    }

    globe.setEarthRotation(gmst);
    globe.writePositions(CS.posBuf);
    applyFilter();
    globe.renderOnce();
    updateCounts();

    // Keep selection ring tracking the live position
    const sel = useStore.getState().selected;
    if (sel >= 0) globe.setSelected(sel);
  }, []); // stable — reads everything via getState() or module-level CS

  // ---- Filter pass (hot path) ------------------------------------------
  const applyFilter = useCallback(() => {
    if (!globeRef.current) return;
    const globe = globeRef.current;
    const { activeGroups, filterBand, filterRegion, altMin, altMax, selected } = useStore.getState();
    let rendered = 0, regionCount = 0;
    for (let i = 0; i < CS.N; i++) {
      let v = 1;
      if (CS.alt[i] < 0) v = 0;
      else if (activeGroups.size && !activeGroups.has(CS.group[i])) v = 0;
      else if (filterBand && CS.band[i] !== filterBand) v = 0;
      else if (altMax != null && CS.alt[i] > altMax) v = 0;
      else if (altMin != null && CS.alt[i] < altMin) v = 0;
      else if (filterRegion && !matchRegion(CS.lat[i], CS.lon[i], filterRegion)) v = 0;
      CS.vis[i] = v; rendered += v;
      if (filterRegion && v) regionCount++;
    }
    // Selected satellite stays visible even when filtered out
    if (selected >= 0 && selected < CS.N) CS.vis[selected] = 1;
    globe.setVisible(CS.vis);
    useStore.getState().setCounts(CS.N, rendered, regionCount);
  }, []);

  // ---- Load catalog into GPU buffers -----------------------------------
  const loadCatalog = useCallback((globe: GlobeApi, catalog: typeof CS.catalog) => {
    CS.catalog = catalog;
    CS.recs    = buildRecords(catalog);
    initCatalogStore(catalog.length);

    const colorCache: Record<string, [number, number, number]> = {};
    for (let i = 0; i < CS.N; i++) {
      const g = catalog[i].group ?? classifyGroup(catalog[i].name, catalog[i].altNominal ?? 600);
      CS.group[i] = g;
      if (!colorCache[g]) colorCache[g] = hexToRGB((GROUPS[g] ?? GROUPS['other']).color);
      const c = colorCache[g];
      CS.colorBase[i * 3] = c[0]; CS.colorBase[i * 3 + 1] = c[1]; CS.colorBase[i * 3 + 2] = c[2];
    }

    globe.allocate(CS.N);
    globe.setColors(CS.colorBase);

    const validRec = CS.recs.find((r) => r && !r.error);
    if (validRec) useStore.getState().setAgeDays(dataAgeDays(validRec, new Date()));

    // Invalidate intelligence cache after catalog change
    invalidateIntelligence();
  }, []);

  // ---- Globe ready (called once after mount) ---------------------------
  const onGlobeReady = useCallback(async (globe: GlobeApi) => {
    globeRef.current = globe;
    globe.setAutoRotate(true);
    globe.onPick((i) => { if (i >= 0) selectSat(globe, i, false); });

    // Load satellite data (live via /api/tle, else representative fallback)
    const result = await loadSatellites();
    loadCatalog(globe, result.catalog);
    useStore.getState().setDataMode(result.dataMode);
    useStore.getState().setLoading(false);

    // First propagation frame immediately
    tick();

    // First intelligence computation
    refreshIntel();

    // Reveal UI once Earth textures are ready (max 4.5 s fallback)
    const reveal = () => {
      document.getElementById('loading')?.classList.add('gone');
      setTimeout(() => {
        const l = document.getElementById('loading');
        if (l) l.style.display = 'none';
      }, 800);
    };
    globe.ready.then(reveal);
    setTimeout(reveal, 4500);

    // Propagation cadence — positions evolve near-real-time
    tickRef.current = setInterval(tick, TICK_MS);

    // Intelligence refresh — decoupled from tick for performance
    intelRef.current = setInterval(refreshIntel, INTEL_REFRESH_MS);
  }, [loadCatalog, tick, refreshIntel]);

  // ---- Cleanup on unmount (StrictMode double-mount safe) ---------------
  useEffect(() => {
    return () => {
      if (tickRef.current) { clearInterval(tickRef.current); tickRef.current = null; }
      if (intelRef.current) { clearInterval(intelRef.current); intelRef.current = null; }
    };
  }, []);

  // ---- Satellite selection ---------------------------------------------
  const selectSat = useCallback((globe: GlobeApi, i: number, fly: boolean) => {
    if (i < 0 || i >= CS.N) return;
    useStore.getState().setSelected(i);
    useStore.getState().setTracking(false);
    globe.setSelected(i);
    globe.setOrbit(null);
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
        const path = sampleOrbitPath(rec, new Date(), 200);
        globeRef.current?.setOrbit(path);
      }
    } else {
      globeRef.current?.setOrbit(null);
    }
  }, []);

  // ---- Counts update (called from tick, not per-frame React state) ----
  const updateCounts = useCallback(() => {
    // Counts are already updated inside applyFilter; this is a no-op safety call.
    // Kept for clarity — applyFilter calls setCounts.
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

    const ctx = {
      count: countWhere,
      find: findSat,
      groupLabel: (g: GroupKey) => (GROUPS[g] ?? GROUPS['other']).label,
      regionCount: regionCountFor,
      total: CS.N,
      rendered: state.renderedCount,
      groupCounts,
      bandCounts,
    };

    const res = await executeAgentCommand(query, ctx, getLang());
    // Use the latest state since the await could take a few seconds
    const latestState = useStore.getState();
    res.sourceMode = latestState.dataMode === 'live' ? 'live' : latestState.dataMode === 'cached' ? 'cached' : 'fallback';
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
        if (t.type === 'jump_time') store.jumpTime(t.offsetMs);
        if (t.type === 'set_time_speed') store.setSimSpeed(t.speed);
        if (t.type === 'set_time_mode') store.setSimMode(t.mode);
        if (t.type === 'reset_to_now') store.resetTime();
        if (t.type === 'pause_simulation') store.setSimMode('paused');
        if (t.type === 'resume_simulation') store.setSimMode('simulating');
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

  const { showBrief, showIntelligence, isLoading, selected } = store;

  return (
    <>
      {/* Globe canvas — imperative Three.js, behind the UI */}
      <GlobeMount onReady={onGlobeReady} />

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

      {/* UI overlay */}
      <div id="ui" className="ui">
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
          <AgentPanel onRun={runAgent} lastResult={agentResult} isThinking={isThinking} />
          <CatalogPanel onSelectSat={(i) => globeRef.current && selectSat(globeRef.current, i, true)} />
        </aside>

        {selected >= 0 && CS.catalog[selected] && (
          <DetailPanel onClose={clearSelection} onToggleTrack={toggleTrack} />
        )}

        {/* Intelligence panel — only when no detail panel and toggle is on */}
        {showIntelligence && selected < 0 && (
          <OrbitalIntelligencePanel
            intelligence={intelligence}
            onClose={() => store.setShowIntelligence(false)}
          />
        )}
        
        {store.showMissionPanel && <MissionPanel />}

        <TimeControlsPanel />

        <Legend />

        <footer className="disclaimer" role="contentinfo">
          {t('disclaimer')}
        </footer>

        {showBrief && <BriefModal onClose={() => store.setShowBrief(false)} />}
      </div>
    </>
  );
}
