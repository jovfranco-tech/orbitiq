/// <reference lib="webworker" />
import * as satJs from 'satellite.js';

// ---- Typed message contracts -----------------------------------------------

interface SatCatalogEntry { l1: string; l2: string; }

type WorkerInMessage =
  | { type: 'INIT'; payload: { catalog: SatCatalogEntry[] } }
  | { type: 'TICK'; payload: { timestampMs: number } };

type WorkerOutMessage =
  | { type: 'READY' }
  | { type: 'TICK_RESULT'; payload: {
      timestampMs: number;
      gmst: number;
      posBuf: Float32Array;
      lat: Float32Array;
      lon: Float32Array;
      alt: Float32Array;
      band: Uint8Array;
    }
  };

// satellite.js types are loose — use ReturnType helpers where possible
type SatRec = ReturnType<typeof satJs.twoline2satrec>;

// ---------------------------------------------------------------------------

let recs: SatRec[] = [];
let N = 0;

let posBuf: Float32Array;
let latBuf: Float32Array;
let lonBuf: Float32Array;
let altBuf: Float32Array;
let bandBuf: Uint8Array;

function bandFromAltitude(alt: number): number {
  if (alt < 0) return 3;
  if (alt <= 2000) return 0;
  if (alt <= 35786) return 1;
  return 2;
}

self.onmessage = (e: MessageEvent<WorkerInMessage>) => {
  const { type, payload } = e.data;

  if (type === 'INIT') {
    const catalog = payload.catalog || [];
    const cleanCatalog = catalog.filter(Boolean);
    N = cleanCatalog.length;
    recs = cleanCatalog.map((c) => {
      try {
        const r = satJs.twoline2satrec(c.l1, c.l2);
        return r;
      } catch {
        return { error: 99 } as unknown as SatRec;
      }
    });

    posBuf = new Float32Array(N * 3);
    latBuf = new Float32Array(N);
    lonBuf = new Float32Array(N);
    altBuf = new Float32Array(N);
    bandBuf = new Uint8Array(N);

    (self as unknown as { postMessage: (msg: WorkerOutMessage) => void }).postMessage({ type: 'READY' });
  }

  else if (type === 'TICK') {
    if (N === 0) return;
    const { timestampMs } = payload;
    const date = new Date(timestampMs);
    const scale = 1.0 / 6378.137;
    const gmst = satJs.gstime(date) as number;

    for (let i = 0; i < N; i++) {
      const r = recs[i];
      const j = i * 3;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (!r || (r as any).error) {
        posBuf[j] = posBuf[j + 1] = posBuf[j + 2] = 0;
        altBuf[i] = -1; latBuf[i] = 0; lonBuf[i] = 0; bandBuf[i] = 3;
        continue;
      }

      const pv = satJs.propagate(r, date) as { position?: { x: number; y: number; z: number } };
      if (pv?.position && isFinite(pv.position.x)) {
        const p = pv.position;
        posBuf[j]     = p.x * scale;
        posBuf[j + 1] = p.z * scale;
        posBuf[j + 2] = -p.y * scale;
        const gd = satJs.eciToGeodetic(p, gmst) as { latitude: number; longitude: number; height: number };
        latBuf[i]  = satJs.degreesLat(gd.latitude) as number;
        lonBuf[i]  = satJs.degreesLong(gd.longitude) as number;
        altBuf[i]  = gd.height;
        bandBuf[i] = bandFromAltitude(gd.height);
      } else {
        posBuf[j] = posBuf[j + 1] = posBuf[j + 2] = 0;
        altBuf[i] = -1; latBuf[i] = 0; lonBuf[i] = 0; bandBuf[i] = 3;
      }
    }

    const out: WorkerOutMessage = {
      type: 'TICK_RESULT',
      payload: {
        timestampMs,
        gmst,
        posBuf: new Float32Array(posBuf),
        lat: new Float32Array(latBuf),
        lon: new Float32Array(lonBuf),
        alt: new Float32Array(altBuf),
        band: new Uint8Array(bandBuf),
      },
    };
    (self as unknown as { postMessage: (msg: WorkerOutMessage) => void }).postMessage(out);
  }
};
