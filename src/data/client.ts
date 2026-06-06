// ============================================================
// OrbitIQ — satellite data client
// Fetches from /api/tle (server-side cached CelesTrak).
// Falls back to the representative catalog on any failure.
// ============================================================
import type { SatelliteRecord, TleApiResponse, DataMode, TleApiMeta } from '../types';
import { buildCatalog } from './catalog';
import { classifyGroup } from './groups';

export interface LoadResult {
  catalog: SatelliteRecord[];
  dataMode: DataMode;
  source: string;
  fetchedAt: string;
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

/**
 * Primary load path: hit /api/tle (server-side cached, never direct CelesTrak
 * from the browser). On any failure return the representative catalog.
 */
export async function loadSatellites(): Promise<LoadResult> {
  try {
    const res = await fetch('/api/tle', { signal: AbortSignal.timeout(12_000) });
    if (!res.ok) throw new Error(`/api/tle HTTP ${res.status}`);
    const contentType = res.headers.get('content-type') ?? '';
    if (!contentType.includes('application/json')) throw new Error(`/api/tle returned ${contentType || 'unknown content type'}`);

    const json: TleApiResponse = await res.json();
    if (!json.satellites || json.satellites.length < 100) {
      throw new Error('Insufficient satellite count from API');
    }

    const apiCatalog: SatelliteRecord[] = (json.satellites || [])
      .filter(Boolean)
      .filter((s) => s.name && s.satnum && s.l1 && s.l2)
      .map((s) => {
        const altNominal = nominalAltitudeFromTle(s.l2);
        return {
          ...s,
          altNominal,
          group: classifyGroup(s.name, altNominal ?? 600),
        };
      });

    const dataMode: DataMode =
      json.meta.dataMode && json.meta.dataMode !== 'loading'
        ? json.meta.dataMode
        : json.meta.freshness === 'live' ? 'live'
        : json.meta.freshness === 'cached' ? 'cached'
        : 'fallback';
    const catalog = dataMode === 'mixed'
      ? supplementPartialCatalog(apiCatalog)
      : apiCatalog;
    const meta: TleApiMeta = dataMode === 'mixed'
      ? {
          ...json.meta,
          source: `${json.meta.source} + representative non-Starlink catalog`,
          count: catalog.length,
          recordCount: catalog.length,
          fallbackReason: json.meta.fallbackReason
            ? `${json.meta.fallbackReason}; representative non-Starlink objects added client-side`
            : 'Representative non-Starlink objects added client-side',
        }
      : json.meta;

    return {
      catalog,
      dataMode,
      source: meta.source,
      fetchedAt: meta.fetchedAt ?? meta.fetchTimestamp,
      meta,
    };
  } catch {
    // Graceful fallback — representative demo catalog
    return {
      catalog: buildCatalog(),
      dataMode: 'fallback',
      source: 'representative-catalog',
      fetchedAt: new Date().toISOString(),
      meta: {
        source: 'fallback — client-side representative catalog',
        sourceMode: 'fallback',
        fetchTimestamp: new Date().toISOString(),
        fetchedAt: new Date().toISOString(),
        cacheTimestamp: new Date().toISOString(),
        freshness: 'fallback',
        dataMode: 'fallback',
        count: 0,
        recordCount: 0,
        sourceHealth: 'unavailable',
        fallbackReason: 'Network or API failure',
      }
    };
  }
}
