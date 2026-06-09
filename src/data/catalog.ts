// ============================================================
// OrbitIQ — representative fallback catalog
// Every generated object is a valid TLE (correct checksum) run
// through satellite.js SGP4 — orbits are physically real;
// only the element snapshot is synthetic / representative.
// ============================================================
import type { SatelliteRecord, GroupKey, ObjectClass } from '../types';

const MU = 398600.4418; // km³/s²
const RE = 6378.137;    // km

// ---- TLE formatting helpers -----------------------------------------------

function cksum(line: string): number {
  let s = 0;
  for (const ch of line.slice(0, 68)) {
    if (ch >= '0' && ch <= '9') s += +ch;
    else if (ch === '-') s += 1;
  }
  return s % 10;
}

const padL = (v: string | number, n: number) => String(v).padStart(n, ' ');
const padR = (v: string | number, n: number) => String(v).padEnd(n, ' ');

function fixed(v: number, n: number, dec: number) {
  return padL(v.toFixed(dec), n);
}

function meanMotionFromAlt(altKm: number): number {
  const a = RE + altKm;
  const T = 2 * Math.PI * Math.sqrt((a * a * a) / MU);
  return 86400 / T;
}

function eccField(e: number): string {
  return padL(Math.round(e * 1e7), 7).replace(/ /g, '0');
}

interface TLEElements {
  satnum: number;
  intl: string;
  epochYear: number;
  epochDay: number;
  incl: number;
  raan: number;
  ecc: number;
  argp: number;
  ma: number;
  meanMotion: number;
  revnum?: number;
  elnum?: number;
}

function buildTLE(el: TLEElements): [string, string] {
  const yy = padL(el.epochYear % 100, 2).replace(/ /g, '0');
  const epoch = fixed(el.epochDay, 12, 8).replace(/ /g, '0');

  let l1 =
    '1 ' +
    padL(el.satnum, 5) + 'U ' +
    padR(el.intl, 8) + ' ' +
    yy + epoch + ' ' +
    ' .00000000 ' +
    ' 00000-0 ' +
    ' 00000-0 ' +
    '0 ' +
    padL(el.elnum ?? 999, 4);
  l1 += cksum(l1);

  let l2 =
    '2 ' +
    padL(el.satnum, 5) + ' ' +
    fixed(el.incl, 8, 4) + ' ' +
    fixed(el.raan, 8, 4) + ' ' +
    eccField(el.ecc) + ' ' +
    fixed(el.argp, 8, 4) + ' ' +
    fixed(el.ma, 8, 4) + ' ' +
    fixed(el.meanMotion, 11, 8) +
    padL(el.revnum ?? 1, 5);
  l2 += cksum(l2);

  return [l1, l2];
}

// ---- Deterministic PRNG ---------------------------------------------------

function mulberry32(seed: number): () => number {
  let a = seed;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const EPOCH_YEAR = 2026;
const EPOCH_DAY  = 153.6; // ~2 days before Jun 5 2026

let SATNUM = 40000;
const nextSatnum = () => SATNUM++;

// ---- Well-known anchor objects --------------------------------------------

interface AnchorDef {
  name: string;
  satnum: number;
  group: GroupKey;
  alt: number;
  incl: number;
  ecc: number;
  lon?: number;
}

const ANCHORS: AnchorDef[] = [
  { name: 'ISS (ZARYA)',  satnum: 25544, group: 'stations', alt: 420,   incl: 51.64, ecc: 0.0006 },
  { name: 'CSS (TIANHE)', satnum: 48274, group: 'stations', alt: 389,   incl: 41.47, ecc: 0.0005 },
  { name: 'HST (HUBBLE)', satnum: 20580, group: 'science',  alt: 538,   incl: 28.47, ecc: 0.0002 },
  { name: 'TERRA',        satnum: 25994, group: 'weather',  alt: 705,   incl: 98.21, ecc: 0.0001 },
  { name: 'AQUA',         satnum: 27424, group: 'weather',  alt: 705,   incl: 98.20, ecc: 0.0001 },
  { name: 'NOAA 19',      satnum: 33591, group: 'weather',  alt: 870,   incl: 99.19, ecc: 0.0013 },
  { name: 'GOES 16',      satnum: 41866, group: 'weather',  alt: 35786, incl: 0.04,  ecc: 0.0001, lon: -75.2 },
  { name: 'GOES 18',      satnum: 51850, group: 'weather',  alt: 35786, incl: 0.03,  ecc: 0.0001, lon: -136.8 },
  { name: 'GPS BIIF-2',   satnum: 37753, group: 'gnss',     alt: 20180, incl: 55.0,  ecc: 0.0002 },
  { name: 'GALILEO 5',    satnum: 40128, group: 'gnss',     alt: 23222, incl: 56.0,  ecc: 0.0003 },
  { name: 'LANDSAT 9',    satnum: 49260, group: 'science',  alt: 705,   incl: 98.22, ecc: 0.0001 },
  { name: 'SENTINEL-2A',  satnum: 40697, group: 'science',  alt: 786,   incl: 98.57, ecc: 0.0001 },
];

// ---- Constellation factories ----------------------------------------------

interface Factory {
  group: GroupKey;
  count: number;
  alt: number;
  altJit: number;
  incl: number;
  inclJit: number;
  planes: number;
  namePrefix: string;
  geo?: boolean;
}

const FACTORIES: Factory[] = [
  { group: 'starlink', count: 600, alt: 550, altJit: 8,   incl: 53.0, inclJit: 0.15, planes: 72, namePrefix: 'STARLINK' },
  { group: 'starlink', count: 360, alt: 540, altJit: 8,   incl: 53.2, inclJit: 0.15, planes: 36, namePrefix: 'STARLINK' },
  { group: 'leo',      count: 220, alt: 1200, altJit: 10,  incl: 87.9, inclJit: 0.2,  planes: 18, namePrefix: 'ONEWEB' },
  { group: 'leo',      count: 320, alt: 650,  altJit: 160, incl: 97.6, inclJit: 6,    planes: 40, namePrefix: 'LEO-OBJ' },
  { group: 'gnss',     count: 110, alt: 20800, altJit: 2200, incl: 56, inclJit: 8,    planes: 6,  namePrefix: 'NAV' },
  { group: 'geo',      count: 180, alt: 35786, altJit: 40, incl: 1.2, inclJit: 2.5,   planes: 180, namePrefix: 'GEO-COMSAT', geo: true },
  { group: 'meo',      count: 50,  alt: 8062,  altJit: 30, incl: 0.1, inclJit: 0.3,   planes: 10, namePrefix: 'MEO-COMSAT' },
  { group: 'weather',  count: 60,  alt: 820,   altJit: 60, incl: 98.7, inclJit: 1.5,  planes: 12, namePrefix: 'WX-LEO' },
];

function makeRecord(
  name: string, group: GroupKey, satnum: number,
  alt: number, incl: number, ecc: number,
  raan: number, ma: number, argp: number, isReal: boolean
): SatelliteRecord {
  const intl = String(EPOCH_YEAR).slice(2) + padL(satnum % 999, 3).replace(/ /g, '0') + 'A';
  const [l1, l2] = buildTLE({
    satnum, intl,
    epochYear: EPOCH_YEAR, epochDay: EPOCH_DAY,
    incl: Math.max(0, incl),
    raan: ((raan % 360) + 360) % 360,
    ecc,
    argp: ((argp % 360) + 360) % 360,
    ma: ((ma % 360) + 360) % 360,
    meanMotion: meanMotionFromAlt(alt),
    revnum: 1, elnum: 999,
  });
  return { name, satnum, l1, l2, group, isReal, altNominal: alt };
}

/** Build the full representative fallback catalog deterministically. */
export function buildCatalog(): SatelliteRecord[] {
  SATNUM = 40000; // reset for determinism
  const rnd = mulberry32(1337);
  const out: SatelliteRecord[] = [];

  for (const a of ANCHORS) {
    out.push(makeRecord(
      a.name, a.group, a.satnum, a.alt, a.incl, a.ecc,
      rnd() * 360, rnd() * 360, rnd() * 360, true
    ));
  }

  for (const f of FACTORIES) {
    for (let i = 0; i < f.count; i++) {
      const plane = i % f.planes;
      const raan = f.geo ? rnd() * 360 : (plane / f.planes) * 360 + (rnd() - 0.5) * 2;
      const ma   = f.geo ? rnd() * 360 : ((i / f.count) * 360 * 7 + rnd() * 8) % 360;
      const alt  = f.alt + (rnd() - 0.5) * 2 * f.altJit;
      const incl = f.incl + (rnd() - 0.5) * 2 * f.inclJit;
      const ecc  = 0.0001 + rnd() * 0.0008;
      const label = f.namePrefix === 'STARLINK'
        ? `${f.namePrefix}-${1000 + out.length % 6000}`
        : `${f.namePrefix} ${String(i + 1).padStart(3, '0')}`;
      out.push(makeRecord(label, f.group, nextSatnum(), alt, incl, ecc, raan, ma, rnd() * 360, false));
    }
  }
  return out;
}

// ---- Representative debris / rocket-body fallback --------------------------
// Used ONLY when real CelesTrak fragmentation feeds are unavailable in
// expanded / debris-risk mode. Every record is flagged isReal:false and given
// a DEMO name prefix so the UI can label it honestly as representative.

interface DebrisFactory {
  objectClass: ObjectClass;
  group: GroupKey;
  count: number;
  alt: number;
  altJit: number;
  incl: number;
  inclJit: number;
  eccMax: number;
  namePrefix: string;
}

const DEBRIS_FACTORIES: DebrisFactory[] = [
  // Debris concentrates in LEO shells around major breakup altitudes.
  { objectClass: 'debris',           group: 'other', count: 900, alt: 800,  altJit: 320, incl: 82.6, inclJit: 18, eccMax: 0.02,  namePrefix: 'DEMO COSMOS DEB' },
  { objectClass: 'debris',           group: 'other', count: 700, alt: 860,  altJit: 220, incl: 98.8, inclJit: 6,  eccMax: 0.015, namePrefix: 'DEMO FENGYUN DEB' },
  { objectClass: 'debris',           group: 'other', count: 300, alt: 780,  altJit: 160, incl: 86.4, inclJit: 8,  eccMax: 0.02,  namePrefix: 'DEMO IRIDIUM DEB' },
  { objectClass: 'rocket_body',      group: 'other', count: 260, alt: 720,  altJit: 540, incl: 71.0, inclJit: 26, eccMax: 0.05,  namePrefix: 'DEMO R/B' },
  { objectClass: 'inactive_payload', group: 'other', count: 160, alt: 1100, altJit: 480, incl: 74.0, inclJit: 22, eccMax: 0.01,  namePrefix: 'DEMO INOP PAYLOAD' },
  { objectClass: 'unknown_object',   group: 'other', count: 90,  alt: 950,  altJit: 420, incl: 64.0, inclJit: 28, eccMax: 0.03,  namePrefix: 'DEMO TBA OBJECT' },
];

/**
 * Build a clearly-marked representative debris / rocket-body layer.
 * Physically valid TLEs (real SGP4 physics) but synthetic element snapshots —
 * NOT a live debris catalog. The caller must surface this as DEMO/fallback.
 */
export function buildDebrisFallback(): SatelliteRecord[] {
  SATNUM = 70000; // separate range from the operational fallback catalog
  const rnd = mulberry32(8675309);
  const out: SatelliteRecord[] = [];

  for (const f of DEBRIS_FACTORIES) {
    for (let i = 0; i < f.count; i++) {
      const alt  = Math.max(220, f.alt + (rnd() - 0.5) * 2 * f.altJit);
      const incl = Math.min(120, Math.max(0, f.incl + (rnd() - 0.5) * 2 * f.inclJit));
      const ecc  = 0.0005 + rnd() * f.eccMax;
      const label = `${f.namePrefix} ${String(i + 1).padStart(4, '0')}`;
      const rec = makeRecord(label, f.group, nextSatnum(), alt, incl, ecc, rnd() * 360, rnd() * 360, rnd() * 360, false);
      rec.objectClass = f.objectClass;
      out.push(rec);
    }
  }
  return out;
}
