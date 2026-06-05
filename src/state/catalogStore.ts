// ============================================================
// OrbitIQ — mutable catalog store (not reactive)
//
// Rendering-critical buffers live here, outside React state,
// to prevent per-tick re-renders. The globe reads/writes these
// directly; React components read summary counts from the Zustand
// store, which is updated at a much lower cadence.
// ============================================================
import type { SatelliteRecord, SatRec, GroupKey, BandKey } from '../types';

export interface CatalogStore {
  catalog: SatelliteRecord[];
  recs: SatRec[];
  N: number;
  posBuf: Float32Array;
  lat: Float32Array;
  lon: Float32Array;
  alt: Float32Array;
  band: BandKey[];
  group: GroupKey[];
  colorBase: Float32Array;
  vis: Float32Array;
}

function empty(): CatalogStore {
  return {
    catalog: [], recs: [], N: 0,
    posBuf: new Float32Array(0),
    lat: new Float32Array(0), lon: new Float32Array(0), alt: new Float32Array(0),
    band: [], group: [],
    colorBase: new Float32Array(0),
    vis: new Float32Array(0),
  };
}

export const CS: CatalogStore = empty();

export function initCatalogStore(n: number): void {
  CS.N = n;
  CS.posBuf    = new Float32Array(n * 3);
  CS.lat       = new Float32Array(n);
  CS.lon       = new Float32Array(n);
  CS.alt       = new Float32Array(n);
  CS.band      = new Array<BandKey>(n);
  CS.group     = new Array<GroupKey>(n);
  CS.colorBase = new Float32Array(n * 3);
  CS.vis       = new Float32Array(n).fill(1);
}
