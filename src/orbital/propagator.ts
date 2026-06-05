// ============================================================
// OrbitIQ — orbital propagator (SGP4 wrappers via satellite.js)
// ============================================================
import * as sat from 'satellite.js';
import * as THREE from 'three';
import type { SatelliteRecord, SatRec } from '../types';

export const GLOBE_RADIUS = 1.0;           // scene units
const RE = 6378.137;                        // km
export const KM_TO_SCENE = GLOBE_RADIUS / RE;

// ECI → Three.js scene space.
// ECI: x=equatorial prime meridian, y=equatorial 90E, z=north pole
// Scene: y=up (north), x/z=equatorial plane
export function eciToScene(p: { x: number; y: number; z: number }, out: THREE.Vector3): THREE.Vector3 {
  return out.set(p.x * KM_TO_SCENE, p.z * KM_TO_SCENE, -p.y * KM_TO_SCENE);
}

export function buildRecords(catalog: SatelliteRecord[]): SatRec[] {
  return catalog.map((c) => {
    try {
      const r = sat.twoline2satrec(c.l1, c.l2) as unknown as SatRec;
      r.error = r.error ?? 0;
      return r;
    } catch {
      return { error: 99, no: 0, jdsatepoch: 0 } as SatRec;
    }
  });
}

const _tmp = new THREE.Vector3();

/**
 * Propagate every satellite to `date`.
 * Writes ECI scene-space xyz into posBuf (Float32, length 3N).
 * Optionally fills altBuf (Float32, length N) with geodetic height in km.
 * Returns { gmst }.
 */
export function propagateAll(
  recs: SatRec[],
  date: Date,
  posBuf: Float32Array,
  altBuf?: Float32Array
): { gmst: number } {
  const gmst: number = sat.gstime(date) as number;
  const N = recs.length;

  for (let i = 0; i < N; i++) {
    const r = recs[i];
    const j = i * 3;
    let ok = false;

    if (!r.error) {
      const pv = sat.propagate(r as unknown as sat.SatRec, date) as { position?: { x: number; y: number; z: number } };
      if (pv?.position && isFinite(pv.position.x)) {
        eciToScene(pv.position, _tmp);
        posBuf[j] = _tmp.x; posBuf[j + 1] = _tmp.y; posBuf[j + 2] = _tmp.z;
        if (altBuf) {
          const gd = sat.eciToGeodetic(pv.position, gmst) as { height: number };
          altBuf[i] = gd.height;
        }
        ok = true;
      }
    }

    if (!ok) {
      posBuf[j] = posBuf[j + 1] = posBuf[j + 2] = 0;
      if (altBuf) altBuf[i] = -1;
    }
  }

  return { gmst };
}

export interface InspectResult {
  lat: number;
  lon: number;
  alt: number;
  speed: number;
  gmst: number;
  eci: { x: number; y: number; z: number };
}

export function inspect(rec: SatRec, date: Date): InspectResult | null {
  if (rec.error) return null;
  const pv = sat.propagate(rec as unknown as sat.SatRec, date) as {
    position?: { x: number; y: number; z: number };
    velocity?: { x: number; y: number; z: number };
  };
  if (!pv?.position) return null;
  const gmst: number = sat.gstime(date) as number;
  const gd = sat.eciToGeodetic(pv.position, gmst) as { latitude: number; longitude: number; height: number };
  const lat: number = sat.degreesLat(gd.latitude) as number;
  const lon: number = sat.degreesLong(gd.longitude) as number;
  const v = pv.velocity!;
  const speed = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
  return { lat, lon, alt: gd.height, speed, gmst, eci: pv.position };
}

export function sampleOrbitPath(rec: SatRec, date: Date, samples = 180): Float32Array {
  const periodMin = (2 * Math.PI) / rec.no;
  const out = new Float32Array((samples + 1) * 3);
  const tmp = new THREE.Vector3();
  for (let i = 0; i <= samples; i++) {
    const t = new Date(date.getTime() + (i / samples) * periodMin * 60000);
    const pv = sat.propagate(rec as unknown as sat.SatRec, t) as { position?: { x: number; y: number; z: number } };
    const j = i * 3;
    if (pv?.position && isFinite(pv.position.x)) {
      eciToScene(pv.position, tmp);
      out[j] = tmp.x; out[j + 1] = tmp.y; out[j + 2] = tmp.z;
    }
  }
  return out;
}

export function dataAgeDays(rec: SatRec, date: Date): number {
  const jdNow = date.getTime() / 86400000 + 2440587.5;
  return jdNow - rec.jdsatepoch;
}
