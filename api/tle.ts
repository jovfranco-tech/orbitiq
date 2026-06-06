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
interface VercelRequest { method?: string; }
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
  timeoutMs: 3000,
};

const STARLINK_SUPGP_SOURCE: TleSource = {
  label: 'CelesTrak SupGP Starlink',
  url: CELESTRAK_STARLINK_SUPGP_URL,
  minRecords: 1000,
  timeoutMs: 6000,
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

// ---------------------------------------------------------------------------

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS: allow same-origin and Vercel preview deployments
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'GET')    { res.status(405).json({ error: 'Method not allowed' }); return; }

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
    res.status(200).json(cached);
    return;
  }

  // Attempt live fetch
  try {
    const satellites = await fetchTleSource(ACTIVE_SOURCE);
    const payload: TleResponse = {
      meta: {
        source: 'CelesTrak GP (celestrak.org)',
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
    res.status(200).json(payload);
  } catch (err) {
    // Network/parse/rate-limit failure — serve stale cache, then try a smaller
    // public Starlink source before falling back to the representative catalog.
    const errorMsg = safeFallbackReason(err);
    console.error('[/api/tle] CelesTrak fetch failed:', errorMsg);

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
      res.status(200).json(payload);
      return;
    } catch (starlinkErr) {
      console.error('[/api/tle] Starlink SupGP fetch failed:', safeFallbackReason(starlinkErr));
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
    res.status(200).json(fallback);
  }
}
