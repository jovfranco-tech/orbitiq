# OrbitIQ — Architecture Guide

This document is for developers and AI agents working in this codebase.

## Stack

| Layer | Technology |
|---|---|
| UI | React 18.3 + TypeScript 5.4, Vite 8 |
| 3D Globe | Three.js r184, OrbitControls |
| Orbital math | satellite.js 5.0 (SGP4/SDP4) in a Web Worker |
| State | Zustand 4.5 (React state) + mutable `CatalogStore` (Float32Array buffers) |
| AI Agent | Vercel serverless `/api/agent` → OpenAI or deterministic fallback |
| Styling | Single `src/index.css` — CSS variables, glassmorphism, no CSS-in-JS |
| i18n | `src/i18n/i18n.ts` — `DICT.en` / `DICT.es`, `t(key)` function |
| Tests | Vitest (unit) + Playwright (e2e + accessibility) |
| Deployment | Vercel (serverless + static) |

## Directory Structure

```
src/
├── app/App.tsx          # Root component — orchestrates globe, panels, agent, keyboard nav
├── ai/                  # Deterministic agent logic (intent parsing, action dispatch)
├── components/
│   ├── dashboard/       # TopBar, BottomTabBar, CatalogPanel
│   ├── globe/           # GlobeRenderer.ts (Three.js, imperative), GlobeHelp overlay
│   └── panels/          # AgentPanel, DetailPanel, IntelligencePanel, MissionPanel,
│                        #   WatchlistPanel, SavedViewsPanel, SnapshotsPanel, AgentChart
├── data/                # client.ts (TLE fetch), groups.ts (classifier), satellites.ts
├── i18n/i18n.ts         # EN/ES dictionaries + t() helper + i18n.test.ts
├── intelligence/        # Risk analysis, congestion scoring
├── orbital/             # propagator.ts (SGP4 wrapper), regions.ts
├── regions/             # regionOf(), REGIONS constant
├── state/
│   ├── store.ts         # Main Zustand store (UI state, filters, simulation)
│   └── userStore.ts     # Persisted user prefs (lang, quality, watchlist, views, snapshots)
├── types/index.ts       # Shared TypeScript types (all major interfaces live here)
├── workers/
│   └── sgp4.worker.ts   # Web Worker — receives INIT/TICK, posts TICK_RESULT
└── utils/audio.ts       # Web Audio API — synthesized click/hover sounds
api/
├── agent.ts             # Vercel serverless — rate limiting, Zod validation, OpenAI call
└── tle.ts               # Vercel serverless — CelesTrak proxy with cache and rate limiting
```

## Data Flow

```
CelesTrak TLE API
      │ api/tle.ts (rate-limited proxy, 30 req/min)
      ▼
  src/data/client.ts
      │ fetchTle() → { meta, satellites[] }
      ▼
  App.tsx loadData()
      │ classifyGroup() for each satellite
      │ CatalogStore (CS) populated — mutable Float32Arrays outside React
      ▼
  sgp4.worker.ts  ←── TICK message every 900ms
      │ SGP4 propagation for all satellites
      │ TICK_RESULT: posBuf, lat, lon, alt, band, gmst
      ▼
  App.tsx onWorkerMessage()
      │ Writes to CS.posBuf, CS.lat, CS.lon, CS.alt
      │ Applies filters → CS.vis[]
      ▼
  GlobeRenderer.ts
      │ writePositions(), setVisible() — direct WebGL updates
      │ No React re-render on every tick
      ▼
  Three.js Points cloud (single draw call, ~50k satellites)
```

## State Architecture

Two parallel state systems:

1. **CatalogStore (CS)** — `src/state/catalogStore.ts`  
   Mutable `Float32Array` buffers (`posBuf`, `lat`, `lon`, `alt`, `vis`, `colorBase`).  
   Updated directly from the worker tick. No React subscription. Globe reads these directly.

2. **Zustand store** — `src/state/store.ts`  
   React-subscribed state: active filters, selected satellite, simulation mode, agent results.  
   Filter changes trigger `applyFilters()` which writes to `CS.vis`.

3. **userStore** — `src/state/userStore.ts`  
   Persisted to localStorage (version: 1, with `migrate` function).  
   Contains: lang, visualQuality, watchlist, savedViews, snapshots.

## Globe API

`GlobeRenderer.ts` exposes an imperative `GlobeApi` (defined in `src/types/index.ts`).  
Key methods:

- `writePositions(buf)` — updates all satellite positions in one GPU upload
- `setVisible(vis)` — per-satellite visibility (Float32Array, 1=visible 0=hidden)
- `setSelected(i, name, alt)` — highlights one satellite and shows orbit ring
- `rotateBy(deltaTheta, deltaPhi)` — keyboard/programmatic rotation (Spherical coords)
- `zoomBy(factor)` — keyboard zoom (clamped to min/max distance)
- `flyTo(point)` — smooth camera animation to a 3D point
- `onPick(cb)` — register click handler for satellite picking via raycasting

## Agent Architecture

```
User query
  ▼
AgentPanel.tsx → onRun(query)
  ▼
App.tsx runAgent(query)
  ├── POST /api/agent → OpenAI (if OPENAI_API_KEY set)
  │     └── LLM returns: { answer, intent, actions[], ... }
  └── Deterministic fallback (src/ai/agent.ts)
        └── Rule-based intent detection → same response shape
  ▼
App.tsx applyAgentActions(actions[])
  └── Updates Zustand filters, calls globeRef methods
```

Both paths return `AiAgentResponse` / `LlmAgentResponse` (types in `src/types/index.ts`).

## Adding New Panels

1. Create `src/components/panels/MyPanel.tsx`
2. Add lazy import in `src/app/App.tsx`: `const MyPanel = lazy(() => import(...))`
3. Wrap in `<PanelErrorBoundary>` and `<Suspense>`
4. Add EN/ES keys to `src/i18n/i18n.ts` (both dicts — the i18n test enforces parity)
5. Add a tab entry in `src/components/dashboard/BottomTabBar.tsx` if needed

## i18n

All UI strings go through `t(key: LangKey)` from `src/i18n/i18n.ts`.  
Add keys to BOTH `DICT.en` and `DICT.es` simultaneously.  
The `src/i18n/i18n.test.ts` enforces key parity — `npm test` catches missing translations.

## Testing

```bash
npm test                 # Vitest unit tests (109 tests)
npm run test:coverage    # Coverage report (lcov + text)
npm run test:e2e         # Playwright e2e + accessibility (requires build or dev server)
npm run test:e2e:ui      # Playwright UI mode for debugging
```

Visual regression tests (`e2e/visual.spec.ts`) are skipped in CI by default.  
Run locally with: `VISUAL_CI=1 npx playwright test e2e/visual.spec.ts --update-snapshots`

## Environment Variables

```bash
# Required for LLM agent (optional — deterministic fallback works without it)
OPENAI_API_KEY=sk-...
LLM_MODEL=gpt-4o-mini    # default

# Set in Vercel dashboard, not .env
ALLOWED_ORIGIN=https://your-domain.vercel.app
```

## Common Pitfalls

- **Worker must be IIFE format** — `vite.config.ts` sets `worker.format: 'iife'`; changing it breaks Safari
- **CatalogStore is mutable outside React** — never read CS arrays in render functions; they change every tick
- **Three.js OrbitControls** — call `controls.update()` after any camera mutation; don't skip it
- **Rate limiting is in-memory** — survives within a lambda invocation lifetime; resets on cold start
- **sourcemap: 'hidden'** — `.map` files are generated but not served; use Sentry/similar to symbolicize errors
