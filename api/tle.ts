// ============================================================
// OrbitIQ — /api/tle
// Vercel serverless function: fetches CelesTrak TLE data
// server-side, caches for up to 6 hours, and returns a
// normalised JSON payload. Falls back to a bundled
// representative catalog on any network/parse failure.
//
// Modes (v1.1.0 — Expanded Orbital Environment):
//   ?mode=operational   (default) clean active/public satellite catalog
//   ?mode=expanded      operational + tracked non-operational classes
//                       (rocket bodies, debris) from real CelesTrak feeds
//   ?mode=debris-risk   same superset, labelled for debris/collision-risk
//                       emphasis on the client
//
// SECURITY: No API keys required. No user PII processed.
// Only public, unauthenticated CelesTrak GP data is fetched.
// Space-Track is NOT required; if a SPACETRACK_* feed is ever added it
// must be an OPTIONAL server-side env var and the app must keep working
// without it.
// ============================================================

// Inline types matching @vercel/node — no package install required at typecheck time
interface VercelRequest {
  method?: string;
  url?: string;
  query?: Record<string, string | string[] | undefined>;
  headers?: Record<string, string | string[] | undefined>;
}
interface VercelResponse {
  setHeader(k: string, v: string): this;
  status(code: number): this;
  json(data: unknown): void;
  end(): void;
}

type ViewMode = 'operational' | 'expanded' | 'debris';

// --- In-memory server-side cache (survives warm lambda invocations) ---------

interface CacheEntry {
  data: TleResponse;
  fetchedAt: number; // epoch ms
}

// Keyed by underlying dataset: 'operational' | 'expanded'
const caches: Record<string, CacheEntry | null> = { operational: null, expanded: null };
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours
const EDGE_CACHE_SECONDS = 3 * 60 * 60; // CelesTrak updates Starlink/Active about every 2 hours
const EDGE_STALE_SECONDS = 24 * 60 * 60;
const MAX_DEBRIS = 9000; // safety cap to protect client-side propagation performance

// ---------------------------------------------------------------------------

interface SatPayload {
  name: string;
  satnum: number;
  l1: string;
  l2: string;
  isReal: boolean;
}

interface ClassCounts {
  operationalCount: number;
  activePayloadCount: number;
  inactivePayloadCount: number;
  rocketBodyCount: number;
  debrisCount: number;
  unknownCount: number;
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
  // Expanded Orbital Environment metadata
  mode: ViewMode;
  totalObjects: number;
  operationalCount: number;
  activePayloadCount: number;
  inactivePayloadCount: number;
  rocketBodyCount: number;
  debrisCount: number;
  unknownCount: number;
  limitations: string[];
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

// Real, public CelesTrak fragmentation-event feeds. These are major
// catalogued breakups (ASAT tests + the Iridium-33/Cosmos-2251 collision)
// and contain real "... DEB" debris and some "... R/B" rocket bodies.
const DEBRIS_GROUPS = ['cosmos-1408-debris', 'fengyun-1c-debris', 'iridium-33-debris', 'cosmos-2251-debris'];
const DEBRIS_SOURCES: TleSource[] = DEBRIS_GROUPS.map((g) => ({
  label: `CelesTrak GP ${g}`,
  url: `https://celestrak.org/NORAD/elements/gp.php?GROUP=${g}&FORMAT=tle`,
  minRecords: 10,
  timeoutMs: 7000,
}));

// ---------------------------------------------------------------------------
// Server-side object-class heuristics (mirror of src/data/objectClass.ts).
// Used only to produce honest metadata counts; the client re-classifies for
// rendering, so any drift is corrected client-side.
// ---------------------------------------------------------------------------

const DEBRIS_RE = /\bDEB\b|DEBRIS|\bFRAG|COOLANT|WESTFORD|NEEDLES|SHRAPNEL/;
const ROCKET_BODY_RE = /R\/B|ROCKET BODY|\bAKM\b|\bPKM\b|BREEZE|CENTAUR|\bSL-\d|ULLAGE|\bH-2A\b|\bDPAF\b/;
const INACTIVE_RE = /\bINOP\b|INACTIVE|\bDECAY|NONOP|\bDEAD\b|\bRETIRED\b/;
const UNKNOWN_RE = /\bTBA\b|UNKNOWN|UNIDENTIFIED|\bANALYST\b/;
const OPERATIONAL_NAME_RE = /STARLINK|GPS|GALILEO|GLONASS|BEIDOU|NAVSTAR|IRNSS|QZS|ISS|TIANHE|CSS|NOAA|GOES|METOP|METEOR|SENTINEL|LANDSAT|HUBBLE|HST|ONEWEB/;

function countClasses(sats: SatPayload[]): ClassCounts {
  const c: ClassCounts = {
    operationalCount: 0, activePayloadCount: 0, inactivePayloadCount: 0,
    rocketBodyCount: 0, debrisCount: 0, unknownCount: 0,
  };
  for (const s of sats) {
    const u = (s.name || '').toUpperCase();
    if (DEBRIS_RE.test(u)) c.debrisCount++;
    else if (ROCKET_BODY_RE.test(u)) c.rocketBodyCount++;
    else if (INACTIVE_RE.test(u)) c.inactivePayloadCount++;
    else if (UNKNOWN_RE.test(u)) c.unknownCount++;
    else if (OPERATIONAL_NAME_RE.test(u)) c.operationalCount++;
    else c.activePayloadCount++;
  }
  return c;
}

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
      'User-Agent': 'OrbitIQ-CommandCenter/1.1.0 contact: https://github.com/jovfranco-tech/orbitiq',
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

function parseMode(req: VercelRequest): ViewMode {
  let raw: string | undefined;
  const q = req.query?.mode;
  if (typeof q === 'string') raw = q;
  else if (Array.isArray(q)) raw = q[0];
  else if (req.url) {
    try {
      raw = new URL(req.url, 'http://localhost').searchParams.get('mode') ?? undefined;
    } catch { /* ignore */ }
  }
  const v = (raw ?? 'operational').toLowerCase();
  if (v === 'expanded') return 'expanded';
  if (v === 'debris-risk' || v === 'debris' || v === 'debris_risk') return 'debris';
  return 'operational';
}

function logEvent(level: 'info' | 'error', data: Record<string, unknown>): void {
  const payload = JSON.stringify({ level, route: '/api/tle', ...data });
  if (level === 'error') console.error(payload);
  else console.log(payload);
}

const OPERATIONAL_LIMITATIONS = [
  'Operational view shows the active/public satellite catalog (CelesTrak "active"). It deliberately excludes debris, rocket bodies and inactive payloads.',
  'Positions are SGP4-propagated from public TLEs; element sets age and maneuvers are not reflected.',
];
const EXPANDED_LIMITATIONS = [
  'Expanded view adds tracked non-operational objects (debris, rocket bodies) from public CelesTrak fragmentation feeds.',
  'Debris coverage is limited to major catalogued breakups (Cosmos-1408, Fengyun-1C, Iridium-33, Cosmos-2251) — it is NOT a complete SSA/global debris catalog.',
  'Rocket bodies and inactive payloads are only represented where present in the fetched public feeds.',
  'Not for flight safety or conjunction assessment.',
];

function applyClassMeta(meta: TleMeta, sats: SatPayload[], mode: ViewMode, limitations: string[]): TleMeta {
  const c = countClasses(sats);
  return {
    ...meta,
    mode,
    totalObjects: sats.length,
    operationalCount: c.operationalCount,
    activePayloadCount: c.activePayloadCount,
    inactivePayloadCount: c.inactivePayloadCount,
    rocketBodyCount: c.rocketBodyCount,
    debrisCount: c.debrisCount,
    unknownCount: c.unknownCount,
    limitations,
  };
}

// ---------------------------------------------------------------------------
// Operational dataset: active catalog + cubesat/amateur supplemental.
// (Original behaviour, factored out so expanded mode can layer on top.)
// ---------------------------------------------------------------------------

async function fetchOperational(now: number): Promise<TleResponse> {
  const [activeSats, cubeSats, amateurSats] = await Promise.allSettled([
    fetchTleSource(ACTIVE_SOURCE),
    fetchTleSource(CUBESAT_SOURCE),
    fetchTleSource(AMATEUR_SOURCE),
  ]);

  if (activeSats.status !== 'fulfilled') throw new Error('Active catalog unavailable');

  const seenSatnums = new Set(activeSats.value.map((s) => s.satnum));
  const satellites: SatPayload[] = [...activeSats.value];
  for (const result of [cubeSats, amateurSats]) {
    if (result.status === 'fulfilled') {
      for (const s of result.value) {
        if (!seenSatnums.has(s.satnum)) { seenSatnums.add(s.satnum); satellites.push(s); }
      }
    }
  }

  const supplementalSources = [
    cubeSats.status === 'fulfilled' ? `+${cubeSats.value.length} CubeSat` : null,
    amateurSats.status === 'fulfilled' ? `+${amateurSats.value.length} Amateur` : null,
  ].filter(Boolean).join(', ');

  const meta: TleMeta = {
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
    mode: 'operational',
    totalObjects: satellites.length,
    operationalCount: 0, activePayloadCount: 0, inactivePayloadCount: 0,
    rocketBodyCount: 0, debrisCount: 0, unknownCount: 0,
    limitations: OPERATIONAL_LIMITATIONS,
  };
  return { meta: applyClassMeta(meta, satellites, 'operational', OPERATIONAL_LIMITATIONS), satellites };
}

// ---------------------------------------------------------------------------
// Expanded dataset: operational + real CelesTrak debris/RB fragmentation feeds.
// ---------------------------------------------------------------------------

async function fetchExpanded(now: number): Promise<TleResponse> {
  const operational = await fetchOperational(now);
  const seen = new Set(operational.satellites.map((s) => s.satnum));

  const debrisResults = await Promise.allSettled(DEBRIS_SOURCES.map((s) => fetchTleSource(s)));
  let debris: SatPayload[] = [];
  const feedsOk: string[] = [];
  for (let i = 0; i < debrisResults.length; i++) {
    const r = debrisResults[i];
    if (r.status === 'fulfilled') {
      feedsOk.push(DEBRIS_GROUPS[i]);
      for (const s of r.value) {
        if (!seen.has(s.satnum)) { seen.add(s.satnum); debris.push(s); }
      }
    }
  }
  if (debris.length > MAX_DEBRIS) {
    // Deterministic thinning to protect propagation performance.
    const stride = Math.ceil(debris.length / MAX_DEBRIS);
    debris = debris.filter((_, i) => i % stride === 0);
  }

  const satellites = [...operational.satellites, ...debris];
  const debrisAvailable = debris.length > 0;
  const limitations = debrisAvailable
    ? EXPANDED_LIMITATIONS
    : ['Public CelesTrak debris feeds were unavailable; client may add a clearly-marked representative debris layer.', ...EXPANDED_LIMITATIONS];

  const meta: TleMeta = {
    ...operational.meta,
    source: debrisAvailable
      ? `CelesTrak GP active + fragmentation feeds (${feedsOk.join(', ')})`
      : 'CelesTrak GP active (debris feeds unavailable)',
    sourceMode: debrisAvailable ? 'live' : 'mixed',
    dataMode: debrisAvailable ? 'live' : 'mixed',
    freshness: 'live',
    sourceHealth: debrisAvailable ? 'healthy' : 'degraded',
    tleEpoch: latestEpoch(satellites),
    count: satellites.length,
    recordCount: satellites.length,
    fallbackReason: debrisAvailable ? undefined : 'Public debris fragmentation feeds temporarily unavailable',
  };
  return { meta: applyClassMeta(meta, satellites, 'expanded', limitations), satellites };
}

function relabelForMode(resp: TleResponse, mode: ViewMode): TleResponse {
  if (mode !== 'debris') return resp;
  const limitations = [
    'Debris & Collision Risk view emphasises non-operational tracked objects (debris, rocket bodies) over active infrastructure.',
    ...resp.meta.limitations.filter((l) => !l.startsWith('Operational view')),
    'Risk and congestion emphasis is an analytical portfolio signal — NOT an operational conjunction/collision assessment.',
  ];
  return { ...resp, meta: { ...resp.meta, mode: 'debris', limitations } };
}

function withCacheMeta(entry: CacheEntry, now: number, mode: ViewMode): TleResponse {
  const base = entry.data;
  const cachedDataMode = base.meta.dataMode === 'mixed' ? 'mixed' : 'cached';
  const resp: TleResponse = {
    ...base,
    meta: {
      ...base.meta,
      sourceMode: cachedDataMode,
      freshness: 'cached',
      dataMode: cachedDataMode,
      cacheTimestamp: new Date(entry.fetchedAt).toISOString(),
      fetchTimestamp: new Date(now).toISOString(),
      fetchedAt: new Date(entry.fetchedAt).toISOString(),
      sourceHealth: base.meta.sourceHealth === 'degraded' ? 'degraded' : 'healthy',
      cacheAgeSeconds: Math.floor((now - entry.fetchedAt) / 1000),
      cacheTtlSeconds: Math.floor(CACHE_TTL_MS / 1000),
      recordCount: base.satellites.length,
    },
  };
  return relabelForMode(resp, mode);
}

// ---------------------------------------------------------------------------

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const startedAt = Date.now();
  const requestId = header(req, 'x-vercel-id') ?? header(req, 'x-request-id') ?? 'local';
  const mode = parseMode(req);
  const datasetKey = mode === 'operational' ? 'operational' : 'expanded';
  logEvent('info', { event: 'tle_start', method: req.method, mode, requestId });

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
  const cache = caches[datasetKey];

  // Serve from cache if fresh
  if (cache && now - cache.fetchedAt < CACHE_TTL_MS) {
    const cached = withCacheMeta(cache, now, mode);
    res.setHeader('Cache-Control', successCacheControl());
    logEvent('info', {
      event: 'tle_cache_hit', requestId, mode,
      count: cached.satellites.length, cacheAgeSeconds: cached.meta.cacheAgeSeconds,
      durationMs: Date.now() - startedAt,
    });
    res.status(200).json(cached);
    return;
  }

  // Attempt live fetch
  try {
    const payload = datasetKey === 'expanded' ? await fetchExpanded(now) : await fetchOperational(now);
    caches[datasetKey] = { data: payload, fetchedAt: now };

    res.setHeader('Cache-Control', successCacheControl());
    logEvent('info', {
      event: 'tle_live_success', requestId, mode,
      count: payload.satellites.length, durationMs: Date.now() - startedAt,
    });
    res.status(200).json(relabelForMode(payload, mode));
  } catch (err) {
    // Network/parse/rate-limit failure — serve stale cache, then try a smaller
    // public Starlink source before falling back to the representative catalog.
    const errorMsg = safeFallbackReason(err);
    logEvent('error', { event: 'tle_primary_failed', requestId, mode, error: errorMsg, durationMs: Date.now() - startedAt });

    if (cache?.data?.satellites.length) {
      const cacheAgeSeconds = Math.floor((now - cache.fetchedAt) / 1000);
      const stale = withCacheMeta(cache, now, mode);
      stale.meta.sourceHealth = 'degraded';
      stale.meta.fallbackReason = `Serving stale cache because ${errorMsg.toLowerCase()}`;
      res.setHeader('Cache-Control', successCacheControl());
      logEvent('info', { event: 'tle_stale_cache_success', requestId, mode, count: stale.satellites.length, cacheAgeSeconds, durationMs: Date.now() - startedAt });
      res.status(200).json(stale);
      return;
    }

    try {
      const satellites = await fetchTleSource(STARLINK_SUPGP_SOURCE);
      const baseMeta: TleMeta = {
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
        mode,
        totalObjects: satellites.length,
        operationalCount: 0, activePayloadCount: 0, inactivePayloadCount: 0,
        rocketBodyCount: 0, debrisCount: 0, unknownCount: 0,
        limitations: [
          'Active catalog unavailable — serving a live Starlink subset only.',
          ...(mode !== 'operational' ? ['Expanded/debris classes are NOT available in this degraded subset.'] : []),
        ],
      };
      const payload: TleResponse = { meta: applyClassMeta(baseMeta, satellites, mode, baseMeta.limitations), satellites };
      caches[datasetKey] = { data: payload, fetchedAt: now };

      res.setHeader('Cache-Control', successCacheControl());
      logEvent('info', { event: 'tle_starlink_success', requestId, mode, count: satellites.length, durationMs: Date.now() - startedAt });
      res.status(200).json(payload);
      return;
    } catch (starlinkErr) {
      logEvent('error', { event: 'tle_starlink_failed', requestId, mode, error: safeFallbackReason(starlinkErr), durationMs: Date.now() - startedAt });
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
        mode,
        totalObjects: 0,
        operationalCount: 0, activePayloadCount: 0, inactivePayloadCount: 0,
        rocketBodyCount: 0, debrisCount: 0, unknownCount: 0,
        limitations: [
          'Public TLE source unavailable — client will use a clearly-marked representative catalog.',
          ...(mode !== 'operational' ? ['Representative debris/rocket-body objects are synthetic and flagged DEMO.'] : []),
        ],
      },
      satellites: [], // empty signals the client to use its own catalog
    };

    res.setHeader('Cache-Control', 'no-store');
    logEvent('info', { event: 'tle_client_fallback', requestId, mode, durationMs: Date.now() - startedAt });
    res.status(200).json(fallback);
  }
}
