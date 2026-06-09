// ============================================================
// OrbitIQ — satellite data client
// Fetches from /api/tle (server-side cached CelesTrak).
// Falls back to the representative catalog on any failure.
//
// Mode-aware (v1.1.0): operational | expanded | debris. Expanded/debris
// add tracked non-operational objects (debris, rocket bodies). When real
// public feeds are unavailable, a clearly-marked representative layer is
// substituted and the metadata says so honestly.
// ============================================================
import type { SatelliteRecord, TleApiResponse, DataMode, TleApiMeta, ViewMode, ObjectClass } from '../types';
import { buildCatalog, buildDebrisFallback } from './catalog';
import { classifyGroup } from './groups';
import { classifyObjectClass, tallyClasses } from './objectClass';

export interface LoadResult {
  catalog: SatelliteRecord[];
  dataMode: DataMode;
  source: string;
  fetchedAt: string;
  mode: ViewMode;
  meta?: TleApiMeta;
}

const MU = 398600.4418; // km^3/s^2
const RE = 6378.137; // km

function nominalAltitudeFromTle(l2: string): number | undefined {
  const meanMotion = Number.parseFloat(l2.slice(52, 63));
  if (!Number.isFinite(meanMotion) || meanMotion <= 0) return undefined;

  const meanMotionRadPerSecond = meanMotion * 2 * Math.PI / 86400;
  const semiMajorAxisKm = Math.cbrt(MU / (meanMotionRadPerSecond * meanMotionRadPerSecond));
  const altitudeKm = semiMajorAxisKm - RE;
  return Number.isFinite(altitudeKm) && altitudeKm > -500 && altitudeKm < 100000
    ? altitudeKm
    : undefined;
}

function supplementPartialCatalog(catalog: SatelliteRecord[]): SatelliteRecord[] {
  const seenSatnums = new Set(catalog.map((s) => s.satnum));
  const nonStarlinkFallback = buildCatalog()
    .filter((s) => s.group !== 'starlink')
    .filter((s) => !seenSatnums.has(s.satnum));

  return [...catalog, ...nonStarlinkFallback];
}

/** Attach group + objectClass to a raw record. */
function enrich(s: { name: string; satnum: number; l1: string; l2: string; isReal: boolean; objectClass?: ObjectClass }): SatelliteRecord {
  const altNominal = nominalAltitudeFromTle(s.l2);
  const group = classifyGroup(s.name, altNominal ?? 600);
  return {
    ...s,
    altNominal,
    group,
    objectClass: s.objectClass ?? classifyObjectClass(s.name, group, s.isReal),
  };
}

/** Merge authoritative client-side class counts into the API meta. */
function withClassCounts(meta: TleApiMeta, catalog: SatelliteRecord[]): TleApiMeta {
  const counts = tallyClasses(catalog.map((c) => c.objectClass ?? 'active_payload'));
  return { ...meta, ...counts };
}

/** Map a ViewMode to the query string accepted by /api/tle. */
function modeQuery(mode: ViewMode): string {
  return mode === 'debris' ? 'debris-risk' : mode;
}

/**
 * Primary load path: hit /api/tle (server-side cached, never direct CelesTrak
 * from the browser). On any failure return the representative catalog.
 */
export async function loadSatellites(mode: ViewMode = 'operational'): Promise<LoadResult> {
  const wantsExpanded = mode !== 'operational';
  try {
    const res = await fetch(`/api/tle?mode=${modeQuery(mode)}`, { signal: AbortSignal.timeout(15_000) });
    if (!res.ok) throw new Error(`/api/tle HTTP ${res.status}`);
    const contentType = res.headers.get('content-type') ?? '';
    if (!contentType.includes('application/json')) throw new Error(`/api/tle returned ${contentType || 'unknown content type'}`);

    const json: TleApiResponse = await res.json();
    if (!json.satellites || json.satellites.length < 100) {
      throw new Error('Insufficient satellite count from API');
    }

    let catalog: SatelliteRecord[] = json.satellites
      .filter(Boolean)
      .filter((s) => s.name && s.satnum && s.l1 && s.l2)
      .map(enrich);

    const dataMode: DataMode =
      json.meta.dataMode && json.meta.dataMode !== 'loading'
        ? json.meta.dataMode
        : json.meta.freshness === 'live' ? 'live'
        : json.meta.freshness === 'cached' ? 'cached'
        : 'fallback';

    if (dataMode === 'mixed') {
      catalog = supplementPartialCatalog(catalog);
    }

    // Expanded/debris but the real feeds returned no non-operational objects:
    // substitute a clearly-marked representative debris/rocket-body layer.
    let limitations = json.meta.limitations ? [...json.meta.limitations] : undefined;
    let source = json.meta.source;
    const realNonOperational = catalog.filter((c) => c.objectClass && c.objectClass !== 'operational_satellite' && c.objectClass !== 'active_payload').length;
    if (wantsExpanded && realNonOperational === 0) {
      catalog = [...catalog, ...buildDebrisFallback()];
      source = `${source} + representative debris layer (DEMO)`;
      limitations = [
        'Real public debris/rocket-body feeds were unavailable — showing a clearly-marked REPRESENTATIVE (DEMO) debris layer. These objects are synthetic.',
        ...(limitations ?? []),
      ];
    }

    const meta: TleApiMeta = withClassCounts({
      ...json.meta,
      mode,
      source: dataMode === 'mixed' ? `${source} + representative non-Starlink catalog` : source,
      count: catalog.length,
      recordCount: catalog.length,
      limitations,
      totalObjects: catalog.length,
    }, catalog);

    return {
      catalog,
      dataMode,
      source: meta.source,
      fetchedAt: meta.fetchedAt ?? meta.fetchTimestamp,
      mode,
      meta,
    };
  } catch {
    // Graceful fallback — representative demo catalog (+ debris layer when expanded)
    const base = buildCatalog().map(enrich);
    const catalog = wantsExpanded ? [...base, ...buildDebrisFallback()] : base;
    const limitations = [
      'Network or API failure — using a clearly-marked REPRESENTATIVE (DEMO) catalog. Valid SGP4 physics, synthetic element snapshots.',
      ...(wantsExpanded ? ['Debris, rocket bodies and inactive payloads shown here are synthetic DEMO objects, not a live debris catalog.'] : []),
    ];
    const meta = withClassCounts({
      source: 'fallback — client-side representative catalog',
      sourceMode: 'fallback',
      fetchTimestamp: new Date().toISOString(),
      fetchedAt: new Date().toISOString(),
      cacheTimestamp: new Date().toISOString(),
      freshness: 'fallback',
      dataMode: 'fallback',
      count: catalog.length,
      recordCount: catalog.length,
      sourceHealth: 'unavailable',
      fallbackReason: 'Network or API failure',
      mode,
      totalObjects: catalog.length,
      limitations,
    }, catalog);

    return {
      catalog,
      dataMode: 'fallback',
      source: 'representative-catalog',
      fetchedAt: new Date().toISOString(),
      mode,
      meta,
    };
  }
}
