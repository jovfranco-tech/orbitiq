/// <reference lib="webworker" />
import * as satJs from 'satellite.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let recs: any[] = [];
let N = 0;

// Reusable buffers
let posBuf: Float32Array;
let lat: Float32Array;
let lon: Float32Array;
let alt: Float32Array;
let band: Uint8Array;

function bandFromAltitude(alt: number): number {
  if (alt < 0) return 3;
  if (alt <= 2000) return 0;
  if (alt <= 35786) return 1;
  return 2;
}

self.onmessage = (e: MessageEvent) => {
  const { type, payload } = e.data;

  if (type === 'INIT') {
    const catalog = payload.catalog || [];
    const cleanCatalog = catalog.filter(Boolean);
    N = cleanCatalog.length;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recs = cleanCatalog.map((c: any) => {
      try {
        const r = satJs.twoline2satrec(c.l1, c.l2);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (r as any).error = (r as any).error ?? 0;
        return r;
      } catch {
        return { error: 99 };
      }
    });

    posBuf = new Float32Array(N * 3);
    lat = new Float32Array(N);
    lon = new Float32Array(N);
    alt = new Float32Array(N);
    band = new Uint8Array(N);
    
    self.postMessage({ type: 'READY' });
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
      if (!r || r.error) {
        posBuf[j] = posBuf[j + 1] = posBuf[j + 2] = 0;
        alt[i] = -1; lat[i] = 0; lon[i] = 0; band[i] = 3;
        continue;
      }
      
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const pv = satJs.propagate(r, date) as any;
      if (pv?.position && isFinite(pv.position.x)) {
        const p = pv.position;
        posBuf[j]     = p.x * scale;
        posBuf[j + 1] = p.z * scale;
        posBuf[j + 2] = -p.y * scale;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const gd = satJs.eciToGeodetic(p, gmst) as any;
        lat[i]  = satJs.degreesLat(gd.latitude) as number;
        lon[i]  = satJs.degreesLong(gd.longitude) as number;
        alt[i]  = gd.height;
        band[i] = bandFromAltitude(gd.height);
      } else {
        posBuf[j] = posBuf[j + 1] = posBuf[j + 2] = 0;
        alt[i] = -1; lat[i] = 0; lon[i] = 0; band[i] = 3;
      }
    }

    // We can't transfer the exact same buffers back and forth continuously without complex ping-ponging, 
    // but copying a few small Float32Arrays is extremely fast (< 1ms).
    self.postMessage({
      type: 'TICK_RESULT',
      payload: {
        timestampMs,
        gmst,
        posBuf: new Float32Array(posBuf),
        lat: new Float32Array(lat),
        lon: new Float32Array(lon),
        alt: new Float32Array(alt),
        band: new Uint8Array(band),
      }
    });
  }
};
