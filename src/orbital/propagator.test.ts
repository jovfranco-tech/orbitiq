import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  buildRecords, eciToScene, propagateAll, dataAgeDays,
  sampleOrbitPath, GLOBE_RADIUS, KM_TO_SCENE,
} from './propagator';
import type { SatelliteRecord } from '../types';

// Representative TLE for a Starlink satellite (for physics testing only — not operational data)
const TLE_L1 = '1 44713U 19074A   21001.00000000  .00001000  00000-0  10000-4 0  9999';
const TLE_L2 = '2 44713  53.0000 100.0000 0001000   0.0000 360.0000 15.05000000000001';

const TEST_CATALOG: SatelliteRecord[] = [
  { name: 'TEST SAT', satnum: 44713, l1: TLE_L1, l2: TLE_L2, group: 'leo', isReal: true },
];

describe('constants', () => {
  it('GLOBE_RADIUS is 1.0 scene unit', () => {
    expect(GLOBE_RADIUS).toBe(1.0);
  });

  it('KM_TO_SCENE converts km to scene units correctly', () => {
    const RE = 6378.137;
    expect(KM_TO_SCENE).toBeCloseTo(1.0 / RE, 8);
  });
});

describe('eciToScene', () => {
  it('maps equatorial prime-meridian ECI point to +x scene axis', () => {
    const out = new THREE.Vector3();
    eciToScene({ x: 6378.137, y: 0, z: 0 }, out);
    expect(out.x).toBeCloseTo(1.0, 5);
    expect(out.y).toBeCloseTo(0, 5);
    expect(out.z).toBeCloseTo(0, 5);
  });

  it('maps ECI north-pole (z axis) to scene y-up axis', () => {
    const out = new THREE.Vector3();
    eciToScene({ x: 0, y: 0, z: 6378.137 }, out);
    expect(out.x).toBeCloseTo(0, 5);
    expect(out.y).toBeCloseTo(1.0, 5);
    expect(out.z).toBeCloseTo(0, 5);
  });

  it('maps ECI 90E equatorial point to -z scene axis', () => {
    const out = new THREE.Vector3();
    eciToScene({ x: 0, y: 6378.137, z: 0 }, out);
    expect(out.x).toBeCloseTo(0, 5);
    expect(out.y).toBeCloseTo(0, 5);
    expect(out.z).toBeCloseTo(-1.0, 5);
  });

  it('handles zero vector', () => {
    const out = new THREE.Vector3();
    eciToScene({ x: 0, y: 0, z: 0 }, out);
    expect(out.x).toBeCloseTo(0);
    expect(out.y).toBeCloseTo(0);
    expect(out.z).toBeCloseTo(0);
  });

  it('returns the out vector for chaining', () => {
    const out = new THREE.Vector3();
    const result = eciToScene({ x: 1, y: 0, z: 0 }, out);
    expect(result).toBe(out);
  });
});

describe('buildRecords', () => {
  it('returns empty array for empty input', () => {
    expect(buildRecords([])).toHaveLength(0);
  });

  it('parses a valid TLE into a SatRec with no error', () => {
    const recs = buildRecords(TEST_CATALOG);
    expect(recs).toHaveLength(1);
    expect(recs[0].error).toBe(0);
    expect(recs[0].no).toBeGreaterThan(0);
    expect(recs[0].jdsatepoch).toBeGreaterThan(0);
  });

  it('gracefully handles malformed TLE lines without throwing', () => {
    const bad: SatelliteRecord[] = [
      { name: 'BAD SAT', satnum: 0, l1: 'garbage line 1', l2: 'garbage line 2', group: 'other', isReal: false },
    ];
    expect(() => buildRecords(bad)).not.toThrow();
    const recs = buildRecords(bad);
    expect(recs).toHaveLength(1);
    // The record is always returned; error code depends on satellite.js internals
    expect(typeof recs[0].error).toBe('number');
  });

  it('handles multiple satellites in the catalog', () => {
    const multi = [TEST_CATALOG[0], TEST_CATALOG[0]];
    const recs = buildRecords(multi);
    expect(recs).toHaveLength(2);
  });
});

describe('dataAgeDays', () => {
  it('returns approximately zero for an epoch set to now', () => {
    const nowJD = Date.now() / 86400000 + 2440587.5;
    const rec = { error: 0, no: 0.001, jdsatepoch: nowJD };
    expect(dataAgeDays(rec, new Date())).toBeCloseTo(0, 1);
  });

  it('returns the correct positive age for an old epoch', () => {
    const thirtyDaysAgoJD = Date.now() / 86400000 + 2440587.5 - 30;
    const rec = { error: 0, no: 0.001, jdsatepoch: thirtyDaysAgoJD };
    expect(dataAgeDays(rec, new Date())).toBeCloseTo(30, 0);
  });

  it('returns negative for a future epoch', () => {
    const futureJD = Date.now() / 86400000 + 2440587.5 + 5;
    const rec = { error: 0, no: 0.001, jdsatepoch: futureJD };
    expect(dataAgeDays(rec, new Date())).toBeLessThan(0);
  });
});

describe('propagateAll', () => {
  it('fills position buffer with non-zero values for a valid satellite', () => {
    const recs = buildRecords(TEST_CATALOG);
    const posBuf = new Float32Array(3);
    propagateAll(recs, new Date(2021, 0, 1), posBuf);
    const magnitude = Math.sqrt(posBuf[0] ** 2 + posBuf[1] ** 2 + posBuf[2] ** 2);
    expect(magnitude).toBeGreaterThan(0);
  });

  it('fills altitude buffer when altBuf is provided', () => {
    const recs = buildRecords(TEST_CATALOG);
    const posBuf = new Float32Array(3);
    const altBuf = new Float32Array(1);
    propagateAll(recs, new Date(2021, 0, 1), posBuf, altBuf);
    expect(altBuf[0]).toBeGreaterThan(0);
  });

  it('sets position to zero and altitude to -1 for errored records', () => {
    const badRec = [{ error: 99, no: 0, jdsatepoch: 0 }];
    const posBuf = new Float32Array(3);
    const altBuf = new Float32Array(1);
    propagateAll(badRec as never, new Date(), posBuf, altBuf);
    expect(posBuf[0]).toBe(0);
    expect(posBuf[1]).toBe(0);
    expect(posBuf[2]).toBe(0);
    expect(altBuf[0]).toBe(-1);
  });

  it('returns gmst as a number', () => {
    const recs = buildRecords(TEST_CATALOG);
    const posBuf = new Float32Array(3);
    const { gmst } = propagateAll(recs, new Date(), posBuf);
    expect(typeof gmst).toBe('number');
    expect(isFinite(gmst)).toBe(true);
  });
});

describe('sampleOrbitPath', () => {
  it('returns a Float32Array with correct length', () => {
    const recs = buildRecords(TEST_CATALOG);
    const samples = 60;
    const path = sampleOrbitPath(recs[0], new Date(2021, 0, 1), samples);
    expect(path).toBeInstanceOf(Float32Array);
    expect(path.length).toBe((samples + 1) * 3);
  });

  it('produces non-zero position data for a valid orbit', () => {
    const recs = buildRecords(TEST_CATALOG);
    const path = sampleOrbitPath(recs[0], new Date(2021, 0, 1), 10);
    const hasNonZero = Array.from(path).some((v) => v !== 0);
    expect(hasNonZero).toBe(true);
  });
});
