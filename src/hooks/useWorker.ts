import { useEffect, useCallback, useRef } from 'react';
import type { RefObject } from 'react';
import { useStore } from '../state/store';
import { CS } from '../state/catalogStore';
import type { GlobeApi, BandKey } from '../types';

const TICK_MS = 900;

type IntervalRef = { current: ReturnType<typeof setInterval> | null };

interface Options {
  globeRef: RefObject<GlobeApi | null>;
  applyFilter: () => void;
  tickIntervalRef: IntervalRef;
  intelIntervalRef: IntervalRef;
  refreshIntel: () => void;
}

export function useWorker({
  globeRef,
  applyFilter,
  tickIntervalRef,
  intelIntervalRef,
  refreshIntel,
}: Options) {
  const workerRef       = useRef<Worker | null>(null);
  const workerReadyRef  = useRef(false);
  const isWorkerBusyRef = useRef(false);
  const lastTickTimeRef = useRef(performance.now());

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
  }, [globeRef]);

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
        const { gmst, posBuf, lat, lon, alt, band, timestampMs } = e.data.payload;

        CS.posBuf = posBuf;
        CS.lat    = lat;
        CS.lon    = lon;
        CS.alt    = alt;
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

    if (CS.catalog && CS.catalog.length > 0) {
      w.postMessage({ type: 'INIT', payload: { catalog: CS.catalog } });
    }

    tickIntervalRef.current  = setInterval(tick, TICK_MS);
    intelIntervalRef.current = setInterval(refreshIntel, 2000);

    return () => {
      if (tickIntervalRef.current)  { clearInterval(tickIntervalRef.current);  tickIntervalRef.current  = null; }
      if (intelIntervalRef.current) { clearInterval(intelIntervalRef.current); intelIntervalRef.current = null; }
      w.terminate();
    };
  }, [applyFilter, tick, globeRef, tickIntervalRef, intelIntervalRef, refreshIntel]);

  return { workerRef, tick };
}
