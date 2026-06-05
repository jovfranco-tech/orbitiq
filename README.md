# OrbitIQ — Command Center

**v0.2.0** — React + Vite + TypeScript production port with server-side TLE cache.

A real-time 3D satellite-orbit tracker and AI-native orbital intelligence dashboard.
Thousands of satellites are propagated with **SGP4** from public TLE/GP elements and
rendered as a GPU point cloud around a textured Earth, with a natural-language command
agent, click-to-inspect, constellation/region/altitude filters, and an executive brief.

> **Data disclaimer** — Uses real public TLE/SGP4 orbital data where available, with a
> representative fallback catalog for offline/demo mode. For portfolio, education and
> situational awareness only. **Not** for flight safety or operational conjunction assessment.

---

## What it does

| Feature | Detail |
|---|---|
| 3D globe | Three.js, textured Earth (day + city lights), atmosphere shader, graticule, starfield |
| Satellite rendering | Single GPU draw call (`THREE.Points` point cloud) — no per-satellite DOM |
| Orbit propagation | Real SGP4 via satellite.js, propagated every ~900 ms |
| Click-to-inspect | Altitude, speed, lat/lon, region, TLE epoch, AI relevance |
| AI command agent | Deterministic NL→action parser (swap-ready for LLM backend in v0.3.0) |
| Filters | Constellation, orbital band, region, altitude range, name/NORAD search |
| Executive brief | Auto-generated situational summary from the live propagated snapshot |
| Data provenance | Live / cached / fallback clearly labeled; no false claims |
| Localisation | EN (default) + ES, all strings keyed |

---

## Architecture

```
orbitiq/
├── index.html                    # Vite entry
├── api/
│   └── tle.ts                    # Vercel serverless: TLE fetch + 6h cache
└── src/
    ├── main.tsx                  # React root
    ├── index.css                 # Visual system (command-center aesthetic)
    ├── app/
    │   └── App.tsx               # Orchestrator — state wiring, tick loop, agent
    ├── components/
    │   ├── globe/
    │   │   ├── GlobeRenderer.ts  # Three.js (imperative, outside React)
    │   │   └── GlobeMount.tsx    # React wrapper (mounts canvas)
    │   ├── panels/
    │   │   ├── AgentPanel.tsx
    │   │   ├── CatalogPanel.tsx
    │   │   ├── DetailPanel.tsx
    │   │   └── BriefModal.tsx
    │   └── dashboard/
    │       ├── TopBar.tsx
    │       └── Legend.tsx
    ├── data/
    │   ├── catalog.ts            # Representative fallback catalog (valid TLEs)
    │   ├── client.ts             # Fetch from /api/tle, fall back to catalog
    │   └── groups.ts             # Group metadata, classifier, bandFromAltitude
    ├── orbital/
    │   └── propagator.ts         # SGP4 wrappers (satellite.js)
    ├── regions/
    │   └── regions.ts            # Lat/lon bounding box region matcher
    ├── ai/
    │   └── agent.ts              # Deterministic AI agent + executive brief
    ├── i18n/
    │   └── i18n.ts               # EN + ES string dictionary
    ├── state/
    │   ├── store.ts              # Zustand UI state (re-render safe)
    │   └── catalogStore.ts       # Mutable hot buffers (Float32, outside React)
    └── types/
        └── index.ts              # All shared TypeScript types
```

### Why two stores?

- **`store.ts` (Zustand)** — drives React renders: filter state, selected index, UI flags.
  Updated ~once per second or on user actions.
- **`catalogStore.ts`** — mutable `Float32Array` position/visibility buffers written
  every ~900 ms by the propagation loop. Kept outside React to prevent thousands of
  re-renders per second. Globe reads them directly.

---

## Data sources

### Primary: `/api/tle` (server-side, Vercel)

- Fetches `celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=tle`
- **Server-side only** — browser never hits CelesTrak directly
- Cached in-memory for up to 6 hours per warm lambda instance
- Returns JSON: `{ meta, satellites[] }`
- Meta includes `source`, `fetchTimestamp`, `cacheTimestamp`, `tleEpoch`, `freshness`, `dataMode`

### Fallback: representative catalog

When `/api/tle` is unreachable or returns too few records, `src/data/catalog.ts` generates
a deterministic ~1 900-object catalog: Starlink shells, OneWeb-like LEO, GNSS MEO, the GEO
belt, sun-synchronous weather/imaging, plus 12 real well-known anchor objects (ISS, CSS,
Hubble, GOES-16/18, GPS, Galileo, Landsat, Sentinel).

Every generated object is a **valid TLE with correct checksum**, propagated through the same
SGP4 pipeline as live data. Orbits are physically real; only the element snapshot is
representative, not a live observation.

### Public TLE limitations

- Elements age continuously; accuracy degrades with time since epoch
- Maneuvers are not reflected until a new TLE is published
- Not all objects tracked by SSN appear in public CelesTrak feeds
- This tool is **not** suitable for collision avoidance, proximity operations, or flight safety

---

## AI command agent

`src/ai/agent.ts — parse(query, ctx)` is a deterministic, local NL→action mapper.
It returns the **same structured contract a real LLM backend would**:

```ts
type AiAgentResponse = {
  answer:        string;
  intent:        string;
  confidence:    number;
  assumptions:   string[];
  actions:       AgentActions;
  filtersApplied: Record<string, unknown>;
  visibleCount:  number;
  sourceMode:    'live' | 'cached' | 'fallback' | 'mixed';
};
```

Handled intents: constellation/group filters, region queries ("over Japan"),
altitude bands ("below 600 km"), orbital bands (GEO/MEO/LEO), satellite lookup
("find the ISS"), crowding analysis, executive brief.

**To replace with a real LLM backend (v0.3.0):** swap the body of `parse()` in
`src/ai/agent.ts` with an API call that emits the same JSON. `App.tsx`'s `runAgent()`
stays unchanged.

---

## Running locally

```bash
npm install
npm run dev          # Vite dev server at http://localhost:5173
```

The `/api/tle` route requires a Vercel runtime locally. Either:
- Use `npx vercel dev` for full Vercel local emulation, or
- The app falls back to the representative catalog automatically when `/api/tle` fails

---

## Deploying to Vercel

```bash
npm run build        # TypeScript check + Vite build
npx vercel           # or push to a repo connected to Vercel
```

- `vercel.json` routes `/api/*` to the serverless functions
- No environment variables required (all data is public)
- Static assets get long-cache headers

---

## Adding a real LLM backend (v0.3.0 roadmap)

1. Create `api/agent.ts` — POST endpoint accepting `{ query, ctx }`, calling your LLM
   (Claude, GPT-4o, etc.) with a system prompt that instructs it to return `AiAgentResponse` JSON.
2. In `src/app/App.tsx`, replace the `parse()` call in `runAgent()` with a `fetch('/api/agent', ...)`.
3. The UI (`AgentPanel.tsx`, action application) is unchanged.

---

## Adding time acceleration / replay (future)

1. Replace `new Date()` in the propagation tick with a `simulationTime` ref.
2. Add a time-scrubber component that advances `simulationTime` at a multiplier.
3. Expose a `setSimTime(date)` action in `store.ts`.
4. No changes to `propagator.ts`, `GlobeRenderer.ts`, or the AI agent.

---

## Security baseline

- No API keys in frontend code or committed to the repo
- No secrets in source
- CelesTrak fetched **server-side** only (`/api/tle`)
- No user PII collected or stored
- No `localStorage` of sensitive information
- Public data disclaimer shown on every screen
- Graceful fallback when upstream source fails

See `SECURITY.md` for full baseline.
