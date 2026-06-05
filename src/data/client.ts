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

/**
 * Primary load path: hit /api/tle (server-side cached, never direct CelesTrak
 * from the browser). On any failure return the representative catalog.
 */
export async function loadSatellites(): Promise<LoadResult> {
  try {
    const res = await fetch('/api/tle', { signal: AbortSignal.timeout(12_000) });
    if (!res.ok) throw new Error(`/api/tle HTTP ${res.status}`);

    const json: TleApiResponse = await res.json();
    if (!json.satellites || json.satellites.length < 100) {
      throw new Error('Insufficient satellite count from API');
    }

    const catalog: SatelliteRecord[] = json.satellites.map((s) => ({
      ...s,
      group: classifyGroup(s.name, 600),
    }));

    return {
      catalog,
      dataMode: json.meta.freshness === 'live' ? 'live'
        : json.meta.freshness === 'cached' ? 'cached'
        : 'fallback',
      source: json.meta.source,
      fetchedAt: json.meta.fetchTimestamp,
      meta: json.meta,
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
        fetchTimestamp: new Date().toISOString(),
        cacheTimestamp: new Date().toISOString(),
        freshness: 'fallback',
        dataMode: 'fallback',
        count: 0,
        sourceHealth: 'unavailable',
        fallbackReason: 'Network or API failure',
      }
    };
  }
}
