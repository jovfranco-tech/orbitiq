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
  fetchTimestamp: string;
  cacheTimestamp: string;
  tleEpoch?: string;
  freshness: 'live' | 'cached' | 'fallback';
  dataMode: 'live' | 'cached' | 'fallback';
  count: number;
}

interface TleResponse {
  meta: TleMeta;
  satellites: SatPayload[];
}

// ---------------------------------------------------------------------------

const CELESTRAK_URL =
  'https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=tle';

async function fetchCelesTrak(): Promise<SatPayload[]> {
  const res = await fetch(CELESTRAK_URL, {
    signal: AbortSignal.timeout(15_000),
    headers: { 'User-Agent': 'OrbitIQ-CommandCenter/0.2.0' },
  });
  if (!res.ok) throw new Error(`CelesTrak HTTP ${res.status}`);

  const text = await res.text();
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

  if (sats.length < 100) throw new Error(`Too few satellites parsed: ${sats.length}`);
  return sats;
}

/** Derive the most recent TLE epoch from the dataset (ISO string). */
function latestEpoch(sats: SatPayload[]): string | undefined {
  let latest = 0;
  for (const s of sats.slice(0, 20)) {
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
    const cached: TleResponse = {
      ...cache.data,
      meta: {
        ...cache.data.meta,
        freshness: 'cached',
        dataMode: 'cached',
        cacheTimestamp: new Date(cache.fetchedAt).toISOString(),
        fetchTimestamp: new Date(now).toISOString(),
      },
    };
    res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=7200');
    res.status(200).json(cached);
    return;
  }

  // Attempt live fetch
  try {
    const satellites = await fetchCelesTrak();
    const payload: TleResponse = {
      meta: {
        source: 'CelesTrak GP (celestrak.org)',
        fetchTimestamp: new Date(now).toISOString(),
        cacheTimestamp: new Date(now).toISOString(),
        tleEpoch: latestEpoch(satellites),
        freshness: 'live',
        dataMode: 'live',
        count: satellites.length,
      },
      satellites,
    };
    cache = { data: payload, fetchedAt: now };

    res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=7200');
    res.status(200).json(payload);
  } catch (err) {
    // Network/parse failure — return fallback indicator so client uses its catalog
    const errorMsg = err instanceof Error ? err.message : 'Unknown error';
    console.error('[/api/tle] CelesTrak fetch failed:', errorMsg);

    const fallback: TleResponse = {
      meta: {
        source: 'fallback — client-side representative catalog',
        fetchTimestamp: new Date(now).toISOString(),
        cacheTimestamp: new Date(now).toISOString(),
        freshness: 'fallback',
        dataMode: 'fallback',
        count: 0,
      },
      satellites: [], // empty signals the client to use its own catalog
    };

    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json(fallback);
  }
}
