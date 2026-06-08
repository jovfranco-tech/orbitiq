import { useCallback, useState } from 'react';
import type { RefObject } from 'react';
import { useStore } from '../state/store';
import { useUserStore } from '../state/userStore';
import { CS } from '../state/catalogStore';
import { executeAgentCommand } from '../ai/agent';
import type { AgentContext } from '../ai/agent';
import { GROUPS } from '../data/groups';
import { REGIONS, matchRegion } from '../regions/regions';
import { getLang } from '../i18n/i18n';
import { getIntelligence } from '../intelligence/intelligence';
import { getMissionScenarios } from '../intelligence/risk';
import type { AiAgentResponse, GlobeApi, GroupKey, BandKey } from '../types';

const MAX_AGENT_TIME_JUMP_MS = 7 * 24 * 60 * 60 * 1000;
const MIN_AGENT_SPEED = 0.25;
const MAX_AGENT_SPEED = 360;

interface Options {
  globeRef: RefObject<GlobeApi | null>;
  selectSat: (globe: GlobeApi, index: number, fly: boolean) => void;
  applyFilter: () => void;
}

export function useAgentActions({ globeRef, selectSat, applyFilter }: Options) {
  const store = useStore();
  const [agentResult, setAgentResult] = useState<AiAgentResponse | null>(null);
  const [isThinking, setIsThinking]   = useState(false);

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

  const createExecutiveSnapshot = useCallback((sourceMode?: string) => {
    const sState = useStore.getState();
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
  }, [store]);

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
    const latestState = useStore.getState();
    res.sourceMode = latestState.dataMode === 'loading' ? 'fallback' : latestState.dataMode;
    res.visibleCount = latestState.renderedCount;
    setAgentResult(res);
    store.triggerCommandPulse(res.intent);

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
        if (a.altMax != null || a.altMin != null) store.setAltFilter(a.altMin, a.altMax);
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
      if (a.showRiskLayer) store.setShowMissionPanel(true);
      if (a.focusSatnum != null) {
        const idx = CS.catalog.findIndex((c) => c?.satnum === a.focusSatnum);
        if (idx >= 0 && globeRef.current) selectSat(globeRef.current, idx, true);
      }
      if (a.timeAction) {
        const ta = a.timeAction;
        if (ta.type === 'jump_time' && Number.isFinite(ta.offsetMs)) {
          const offsetMs = Math.max(-MAX_AGENT_TIME_JUMP_MS, Math.min(MAX_AGENT_TIME_JUMP_MS, ta.offsetMs));
          store.jumpTime(offsetMs);
        }
        if (ta.type === 'set_time_speed' && Number.isFinite(ta.speed)) {
          const speed = Math.max(MIN_AGENT_SPEED, Math.min(MAX_AGENT_SPEED, ta.speed));
          store.setSimSpeed(speed);
        }
        if (ta.type === 'set_time_mode') store.setSimMode(ta.mode);
        if (ta.type === 'reset_to_now') store.resetTime();
        if (ta.type === 'pause_simulation') store.setSimMode('paused');
        if (ta.type === 'resume_simulation') store.setSimMode('simulating');
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
              name: s.name, satnum: s.satnum, group: CS.group[selected],
              band: CS.band[selected], alt: CS.alt[selected],
              region: 'Unknown', sourceMode: res.sourceMode,
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
              band: sState.filterBand, region: sState.filterRegion,
              altMin: sState.altMin, altMax: sState.altMax,
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
          createExecutiveSnapshot(res.sourceMode);
        }
      }
    }

    applyFilter();
    setIsThinking(false);
  }, [countWhere, findSat, regionCountFor, store, selectSat, applyFilter, createExecutiveSnapshot, globeRef]);

  return { runAgent, isThinking, agentResult };
}
