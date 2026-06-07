// ============================================================
// OrbitIQ — /api/tle
// Vercel serverless function: fetches CelesTrak TLE data
// server-side, caches for up to 6 hours, and returns a
// normalised JSON payload. Falls back to a bundled
// representative catalog on any network/parse failure.
//
// SECURITY: No API keys required. No user PII processed.
// Only public, unauthenticated CelesTrak GP data is fetched.
// ============================================================

// Inline types matching @vercel/node — no package install required at typecheck time
interface VercelRequest {
  method?: string;
  headers?: Record<string, string | string[] | undefined>;
}
interface VercelResponse {
  setHeader(k: string, v: string): this;
  status(code: number): this;
  json(data: unknown): void;
  end(): void;
}

// --- In-memory server-side cache (survives warm lambda invocations) ---------

interface CacheEntry {
  data: TleResponse;
  fetchedAt: number; // epoch ms
}

let cache: CacheEntry | null = null;
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours
const EDGE_CACHE_SECONDS = 3 * 60 * 60; // CelesTrak updates Starlink/Active about every 2 hours
const EDGE_STALE_SECONDS = 24 * 60 * 60;

// ---------------------------------------------------------------------------

interface SatPayload {
  name: string;
  satnum: number;
  l1: string;
  l2: string;
  isReal: boolean;
}

interface TleMeta {
  source: string;
  sourceMode: 'live' | 'cached' | 'fallback' | 'mixed';
  fetchTimestamp: string;
  fetchedAt: string;
  cacheTimestamp: string;
  tleEpoch?: string;
  freshness: 'live' | 'cached' | 'fallback';
  dataMode: 'live' | 'cached' | 'fallback' | 'mixed';
  count: number;
  recordCount: number;
  sourceHealth?: 'healthy' | 'degraded' | 'unavailable';
  cacheAgeSeconds?: number;
  cacheTtlSeconds?: number;
  fallbackReason?: string;
}

interface TleResponse {
  meta: TleMeta;
  satellites: SatPayload[];
}

// ---------------------------------------------------------------------------

const CELESTRAK_ACTIVE_URL =
  'https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=tle';
const CELESTRAK_STARLINK_SUPGP_URL =
  'https://celestrak.org/NORAD/elements/supplemental/sup-gp.php?FILE=starlink&FORMAT=tle';
const CELESTRAK_CUBESAT_URL =
  'https://celestrak.org/NORAD/elements/gp.php?GROUP=cubesat&FORMAT=tle';
const CELESTRAK_AMATEUR_URL =
  'https://celestrak.org/NORAD/elements/gp.php?GROUP=amateur&FORMAT=tle';

interface TleSource {
  label: string;
  url: string;
  minRecords: number;
  timeoutMs: number;
}

const ACTIVE_SOURCE: TleSource = {
  label: 'CelesTrak GP active',
  url: CELESTRAK_ACTIVE_URL,
  minRecords: 1000,
  timeoutMs: 8000,
};

const STARLINK_SUPGP_SOURCE: TleSource = {
  label: 'CelesTrak SupGP Starlink',
  url: CELESTRAK_STARLINK_SUPGP_URL,
  minRecords: 1000,
  timeoutMs: 8000,
};

const CUBESAT_SOURCE: TleSource = {
  label: 'CelesTrak GP CubeSat',
  url: CELESTRAK_CUBESAT_URL,
  minRecords: 50,
  timeoutMs: 5000,
};

const AMATEUR_SOURCE: TleSource = {
  label: 'CelesTrak GP Amateur',
  url: CELESTRAK_AMATEUR_URL,
  minRecords: 50,
  timeoutMs: 5000,
};

function parseTleText(text: string, minRecords: number): SatPayload[] {
  const lines = text.split(/\r?\n/).filter(Boolean);
  if (lines.length < 6) throw new Error('TLE response too short');

  const sats: SatPayload[] = [];
  for (let i = 0; i + 2 < lines.length; i += 3) {
    const name = lines[i].trim();
    const l1   = lines[i + 1];
    const l2   = lines[i + 2];
    if (!l1.startsWith('1 ') || !l2.startsWith('2 ')) continue;
    const satnum = parseInt(l1.slice(2, 7), 10);
    if (isNaN(satnum)) continue;
    sats.push({ name, satnum, l1, l2, isReal: true });
  }

  if (sats.length < minRecords) throw new Error(`Too few satellites parsed: ${sats.length}`);
  return sats;
}

async function fetchTleSource(source: TleSource): Promise<SatPayload[]> {
  const res = await fetch(source.url, {
    signal: AbortSignal.timeout(source.timeoutMs),
    headers: {
      'Accept': 'text/plain,text/*,*/*',
      'User-Agent': 'OrbitIQ-CommandCenter/1.0.0 contact: https://github.com/jovfranco-tech/orbitiq',
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    const hint = body.replace(/\s+/g, ' ').trim().slice(0, 180);
    throw new Error(`${source.label} HTTP ${res.status}${hint ? `: ${hint}` : ''}`);
  }

  const text = await res.text();
  return parseTleText(text, source.minRecords);
}

/** Derive the most recent TLE epoch from the dataset (ISO string). */
function latestEpoch(sats: SatPayload[]): string | undefined {
  let latest = 0;
  for (const s of sats) {
    // TLE epoch: YY + day-of-year in l1 col 19-32
    try {
      const raw = s.l1.slice(18, 32).trim();
      const yy  = parseInt(raw.slice(0, 2), 10);
      const doy = parseFloat(raw.slice(2));
      const year = yy < 57 ? 2000 + yy : 1900 + yy;
      const d = new Date(year, 0, 1);
      d.setDate(d.getDate() + Math.floor(doy) - 1);
      d.setHours(0, 0, 0, Math.round((doy % 1) * 86400000));
      if (d.getTime() > latest) latest = d.getTime();
    } catch { /* skip */ }
  }
  return latest > 0 ? new Date(latest).toISOString() : undefined;
}

function safeFallbackReason(err: unknown): string {
  if (!(err instanceof Error)) return 'Public TLE source unavailable';
  if (err.message.includes('HTTP 403')) return err.message.includes('not updated since')
    ? 'CelesTrak source not updated since last successful download'
    : err.message;
  if (err.message.includes('HTTP')) return err.message;
  if (err.message.startsWith('Too few satellites parsed')) return err.message;
  if (err.message === 'TLE response too short') return err.message;
  return 'Public TLE source unavailable or timed out';
}

function successCacheControl(): string {
  return `public, s-maxage=${EDGE_CACHE_SECONDS}, stale-while-revalidate=${EDGE_STALE_SECONDS}`;
}

function header(req: VercelRequest, key: string): string | undefined {
  const value = req.headers?.[key] ?? req.headers?.[key.toLowerCase()];
  return Array.isArray(value) ? value[0] : value;
}

function logEvent(level: 'info' | 'error', data: Record<string, unknown>): void {
  const payload = JSON.stringify({
    level,
    route: '/api/tle',
    ...data,
  });
  if (level === 'error') console.error(payload);
  else console.log(payload);
}

// ---------------------------------------------------------------------------

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const startedAt = Date.now();
  const requestId = header(req, 'x-vercel-id') ?? header(req, 'x-request-id') ?? 'local';
  logEvent('info', { event: 'tle_start', method: req.method, requestId });

  // CORS: allow same-origin and Vercel preview deployments
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'GET') {
    logEvent('info', { event: 'tle_method_not_allowed', method: req.method, requestId, durationMs: Date.now() - startedAt });
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const now = Date.now();

  // Serve from cache if fresh
  if (cache && now - cache.fetchedAt < CACHE_TTL_MS) {
    const cachedDataMode = cache.data.meta.dataMode === 'mixed' ? 'mixed' : 'cached';
    const cached: TleResponse = {
      ...cache.data,
      meta: {
        ...cache.data.meta,
        sourceMode: cachedDataMode,
        freshness: 'cached',
        dataMode: cachedDataMode,
        cacheTimestamp: new Date(cache.fetchedAt).toISOString(),
        fetchTimestamp: new Date(now).toISOString(),
        fetchedAt: new Date(cache.fetchedAt).toISOString(),
        sourceHealth: cache.data.meta.sourceHealth === 'degraded' ? 'degraded' : 'healthy',
        cacheAgeSeconds: Math.floor((now - cache.fetchedAt) / 1000),
        cacheTtlSeconds: Math.floor(CACHE_TTL_MS / 1000),
        recordCount: cache.data.satellites.length,
      },
    };
    res.setHeader('Cache-Control', successCacheControl());
    logEvent('info', {
      event: 'tle_cache_hit',
      requestId,
      count: cached.satellites.length,
      cacheAgeSeconds: cached.meta.cacheAgeSeconds,
      durationMs: Date.now() - startedAt,
    });
    res.status(200).json(cached);
    return;
  }

  // Attempt live fetch — primary catalog + supplemental in parallel
  try {
    const [activeSats, cubeSats, amateurSats] = await Promise.allSettled([
      fetchTleSource(ACTIVE_SOURCE),
      fetchTleSource(CUBESAT_SOURCE),
      fetchTleSource(AMATEUR_SOURCE),
    ]);

    if (activeSats.status !== 'fulfilled') throw new Error('Active catalog unavailable');

    // Merge supplemental feeds, deduplicating by satnum
    const seenSatnums = new Set(activeSats.value.map((s) => s.satnum));
    let satellites: SatPayload[] = [...activeSats.value];
    for (const result of [cubeSats, amateurSats]) {
      if (result.status === 'fulfilled') {
        for (const s of result.value) {
          if (!seenSatnums.has(s.satnum)) {
            seenSatnums.add(s.satnum);
            satellites.push(s);
          }
        }
      }
    }

    const supplementalSources = [
      cubeSats.status === 'fulfilled' ? `+${cubeSats.value.length} CubeSat` : null,
      amateurSats.status === 'fulfilled' ? `+${amateurSats.value.length} Amateur` : null,
    ].filter(Boolean).join(', ');

    const payload: TleResponse = {
      meta: {
        source: supplementalSources
          ? `CelesTrak GP active (${satellites.length} total: ${supplementalSources})`
          : 'CelesTrak GP (celestrak.org)',
        sourceMode: 'live',
        fetchTimestamp: new Date(now).toISOString(),
        fetchedAt: new Date(now).toISOString(),
        cacheTimestamp: new Date(now).toISOString(),
        tleEpoch: latestEpoch(satellites),
        freshness: 'live',
        dataMode: 'live',
        count: satellites.length,
        recordCount: satellites.length,
        sourceHealth: 'healthy',
        cacheAgeSeconds: 0,
        cacheTtlSeconds: Math.floor(CACHE_TTL_MS / 1000),
      },
      satellites,
    };
    cache = { data: payload, fetchedAt: now };

    res.setHeader('Cache-Control', successCacheControl());
    logEvent('info', {
      event: 'tle_live_success',
      requestId,
      count: satellites.length,
      supplementalSources,
      durationMs: Date.now() - startedAt,
    });
    res.status(200).json(payload);
  } catch (err) {
    // Network/parse/rate-limit failure — serve stale cache, then try a smaller
    // public Starlink source before falling back to the representative catalog.
    const errorMsg = safeFallbackReason(err);
    logEvent('error', {
      event: 'tle_primary_failed',
      requestId,
      error: errorMsg,
      durationMs: Date.now() - startedAt,
    });

    if (cache?.data?.satellites.length) {
      const cacheAgeSeconds = Math.floor((now - cache.fetchedAt) / 1000);
      const cachedDataMode = cache.data.meta.dataMode === 'mixed' ? 'mixed' : 'cached';
      const staleCached: TleResponse = {
        ...cache.data,
        meta: {
          ...cache.data.meta,
          sourceMode: cachedDataMode,
          fetchTimestamp: new Date(now).toISOString(),
          fetchedAt: new Date(cache.fetchedAt).toISOString(),
          cacheTimestamp: new Date(cache.fetchedAt).toISOString(),
          freshness: 'cached',
          dataMode: cachedDataMode,
          sourceHealth: 'degraded',
          cacheAgeSeconds,
          cacheTtlSeconds: Math.floor(CACHE_TTL_MS / 1000),
          recordCount: cache.data.satellites.length,
          fallbackReason: `Serving stale cache because ${errorMsg.toLowerCase()}`,
        },
      };
      res.setHeader('Cache-Control', successCacheControl());
      logEvent('info', {
        event: 'tle_stale_cache_success',
        requestId,
        count: staleCached.satellites.length,
        cacheAgeSeconds,
        durationMs: Date.now() - startedAt,
      });
      res.status(200).json(staleCached);
      return;
    }

    try {
      const satellites = await fetchTleSource(STARLINK_SUPGP_SOURCE);
      const payload: TleResponse = {
        meta: {
          source: 'CelesTrak SupGP Starlink (celestrak.org)',
          sourceMode: 'mixed',
          fetchTimestamp: new Date(now).toISOString(),
          fetchedAt: new Date(now).toISOString(),
          cacheTimestamp: new Date(now).toISOString(),
          tleEpoch: latestEpoch(satellites),
          freshness: 'live',
          dataMode: 'mixed',
          count: satellites.length,
          recordCount: satellites.length,
          sourceHealth: 'degraded',
          cacheAgeSeconds: 0,
          cacheTtlSeconds: Math.floor(CACHE_TTL_MS / 1000),
          fallbackReason: `Active catalog unavailable (${errorMsg}); serving live Starlink SupGP subset`,
        },
        satellites,
      };
      cache = { data: payload, fetchedAt: now };

      res.setHeader('Cache-Control', successCacheControl());
      logEvent('info', {
        event: 'tle_starlink_success',
        requestId,
        count: satellites.length,
        durationMs: Date.now() - startedAt,
      });
      res.status(200).json(payload);
      return;
    } catch (starlinkErr) {
      logEvent('error', {
        event: 'tle_starlink_failed',
        requestId,
        error: safeFallbackReason(starlinkErr),
        durationMs: Date.now() - startedAt,
      });
    }

    const fallback: TleResponse = {
      meta: {
        source: 'fallback — client-side representative catalog',
        sourceMode: 'fallback',
        fetchTimestamp: new Date(now).toISOString(),
        fetchedAt: new Date(now).toISOString(),
        cacheTimestamp: new Date(now).toISOString(),
        freshness: 'fallback',
        dataMode: 'fallback',
        count: 0,
        recordCount: 0,
        sourceHealth: 'unavailable',
        fallbackReason: errorMsg,
        cacheAgeSeconds: 0,
        cacheTtlSeconds: Math.floor(CACHE_TTL_MS / 1000),
      },
      satellites: [], // empty signals the client to use its own catalog
    };

    res.setHeader('Cache-Control', 'no-store');
    logEvent('info', {
      event: 'tle_client_fallback',
      requestId,
      durationMs: Date.now() - startedAt,
    });
    res.status(200).json(fallback);
  }
}
