# OrbitIQ — Architecture Guide

This document is for developers and AI agents working in this codebase.

## Stack

| Layer | Technology |
|---|---|
| UI | React 18.3 + TypeScript 5.4, Vite 8 |
| 3D Globe | Three.js (OrbitControls, CSS2DRenderer) |
| Orbital math | satellite.js 5.0 (SGP4/SDP4) in a Web Worker |
| State | Zustand 4.5 (React state) + mutable `CatalogStore` (Float32Array buffers) |
| AI Agent | Vercel serverless `/api/agent` → Gemini / OpenAI or deterministic fallback |
| Cloud sync | Firebase (optional — user data sync, gated behind `VITE_FIREBASE_*` env) |
| Styling | Single `src/index.css` — CSS variables, glassmorphism, no CSS-in-JS |
| i18n | `src/i18n/i18n.ts` — `DICT.en` / `DICT.es`, `t(key)` function |
| Tests | Vitest (unit) + Playwright (e2e + accessibility) |
| Deployment | Vercel (serverless + static) |

## Directory Structure

```
src/
├── app/App.tsx          # Root component — orchestrates globe, panels, agent, hooks
├── ai/                  # Deterministic agent logic (intent parsing, action dispatch)
├── components/
│   ├── dashboard/       # TopBar, BottomTabBar, Legend, attribution
│   ├── globe/           # GlobeRenderer.ts (Three.js, imperative), GlobeMount
│   └── panels/          # AgentPanel, DetailPanel, MissionPanel, IntelligencePanel,
│                        #   WatchlistPanel, SavedViewsPanel, SnapshotPanel, AgentChart
├── config/              # firebase.ts (lazy Firebase init), links.ts
├── data/                # client.ts (TLE fetch), catalog.ts, groups.ts (classifier)
├── hooks/               # useKeyboardShortcuts, useURLSync, useMobile,
│                        #   useFirebaseCloudSync, useLiveTelemetry
├── i18n/i18n.ts         # EN/ES dictionaries + t() helper
├── intelligence/        # Risk analysis, congestion scoring, relevance
├── orbital/             # propagator.ts (SGP4 wrapper)
├── regions/             # regionOf(), REGIONS constant
├── services/            # firebaseCloudSync.ts (Firestore read/write of user data)
├── state/
│   ├── store.ts         # Main Zustand store (UI state, filters, simulation)
│   ├── userStore.ts     # Persisted user prefs (lang, quality, watchlist, views, snapshots)
│   └── catalogStore.ts  # Mutable Float32Array buffers (CS) — outside React
├── types/index.ts       # Shared TypeScript types (all major interfaces live here)
├── utils/               # audio.ts (Web Audio), reports.ts, userData.ts (export/import)
└── workers/
    └── sgp4.worker.ts   # Web Worker — receives INIT/TICK, posts TICK_RESULT
api/
├── agent.ts             # Vercel serverless — Gemini/OpenAI agent, Zod validation, rate limit
├── health.ts            # Vercel serverless — health summary (no secrets)
└── tle.ts               # Vercel serverless — CelesTrak proxy with cache and rate limiting
```

## Data Flow

```
CelesTrak TLE API
      │ api/tle.ts (rate-limited proxy)
      ▼
  src/data/client.ts  loadSatellites() → { catalog, dataMode, source, fetchedAt, meta }
      ▼
  App.tsx  → CatalogStore (CS) populated (mutable Float32Arrays outside React)
      ▼
  sgp4.worker.ts  ←── TICK message (~900ms)
      │ SGP4 propagation for all satellites
      │ TICK_RESULT: posBuf, lat, lon, alt, band, gmst
      ▼
  App.tsx  → writes CS buffers, applyFilter() → CS.vis[]
      ▼
  GlobeRenderer.ts  → writePositions(), setVisible() — direct WebGL updates
      ▼
  Three.js Points cloud (single draw call)
```

## State Architecture

Three parallel systems:

1. **CatalogStore (CS)** — `src/state/catalogStore.ts`
   Mutable `Float32Array` buffers (`posBuf`, `lat`, `lon`, `alt`, `vis`, `colorBase`).
   Updated directly from the worker tick. No React subscription.

2. **Zustand store** — `src/state/store.ts`
   React-subscribed: filters, selected satellite, simulation mode, agent results.

3. **userStore** — `src/state/userStore.ts`
   Persisted to localStorage; optionally mirrored to Firestore via `useFirebaseCloudSync`.

## App Composition (hooks)

`App.tsx` delegates cross-cutting concerns to hooks in `src/hooks/`:

- `useKeyboardShortcuts` — global keys: Esc (close/deselect), b (brief), r (reset view),
  i (intelligence), m (mission+risk), Space (pause/resume), / (focus agent input)
- `useURLSync` — restores/syncs `band`, `region`, `groups`, `sat` to the URL hash
- `useMobile` — `<768px` breakpoint for the mobile tab layout
- `useFirebaseCloudSync` — optional cloud sync; no-ops if `VITE_FIREBASE_*` is unset
- `useLiveTelemetry` — rotating status ticker

## Adding New Panels

1. Create `src/components/panels/MyPanel.tsx`
2. Add lazy import in `src/app/App.tsx`: `const MyPanel = lazy(() => import(...))`
3. Wrap in `<PanelErrorBoundary>` and `<Suspense>`
4. Add EN/ES keys to `src/i18n/i18n.ts` (both dicts — the i18n parity test enforces it)
5. Add a tab entry in `src/components/dashboard/BottomTabBar.tsx` if needed

## i18n

All UI strings go through `t(key)` from `src/i18n/i18n.ts`.
Add keys to BOTH `DICT.en` and `DICT.es`. `src/i18n/i18n.test.ts` enforces key parity —
`npm test` catches a missing translation.

## Testing

```bash
npm test                 # Vitest unit tests
npm run test:coverage    # Coverage gate (lcov + text) — enforced in CI
npm run test:e2e         # Playwright e2e + accessibility (boots dev server)
npm run test:e2e:ui      # Playwright UI mode for debugging
```

**Two-tier coverage strategy.** The `test:coverage` gate scopes the *pure-logic* layer —
`data/`, `intelligence/`, `orbital/`, `regions/`, `i18n/`, `utils/` (minus Web-Audio
`audio.ts`), and `hooks/useKeyboardShortcuts.ts` — with thresholds (lines 60 / functions 60 /
branches 45) enforced in CI (no `continue-on-error`). The React UI, the imperative
`GlobeRenderer`, the Web Worker, Firebase cloud sync, and orchestration hooks/stores are
validated by the Playwright e2e + accessibility suites instead. Adding logic to an included
module without a test fails the gate.

## Environment Variables

```bash
# AI agent (optional — deterministic fallback works without any key)
GEMINI_API_KEY=...           # preferred; GEMINI_MODEL defaults to gemini-2.0-flash
OPENAI_API_KEY=sk-...        # fallback; LLM_MODEL defaults to gpt-4o-mini

# Firebase cloud sync (optional — sync disabled if unset)
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_PROJECT_ID=...
# ...remaining VITE_FIREBASE_* values

# Set in Vercel dashboard, not .env
ALLOWED_ORIGIN=https://your-domain.vercel.app
```

## Common Pitfalls

- **Worker must be IIFE format** — `vite.config.ts` sets `worker.format: 'iife'`; changing it breaks Safari
- **CatalogStore is mutable outside React** — never read CS arrays in render functions; they change every tick
- **Three.js OrbitControls** — call `controls.update()` after any camera mutation
- **Firebase is optional** — guard every cloud-sync path; the app must work fully offline
- **Rate limiting is in-memory** — survives within a lambda invocation; resets on cold start
```
