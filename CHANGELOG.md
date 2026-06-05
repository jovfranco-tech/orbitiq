## [0.6.0-time-controls-scenario-simulation] - 2026-06-05

### Added
- **Time Controls & Scenario Simulation**: Added deterministic time-travel capabilities for the entire SGP4-propagated catalog.
- **Glassmorphism Time Controls Panel**: Draggable, sleek UI component for adjusting time (`Live`, `Paused`, `Simulated`), playback speed multiplier, and jumping forward/backward in time.
- **Simulation Snapshot Cache (Current vs Simulated)**: Automatically captures current live visibility baselines before switching to scenario simulation, allowing context-aware Current vs Simulated comparative intelligence.
- **AI Agent Time Commands**: AI agent can now interpret time instructions natively (e.g. "pause the simulation", "fast forward by 24 hours", "reset to now").
- **Simulation Data Honesty**: Emphasizes that temporal accuracy degrades away from the TLE epoch.
- **Performance Optimization**: Advanced time progression relies heavily on `performance.now()` in the `tick` loop to decouple frame rate from the simulation clock, ensuring zero React state mutations per frame during time jumps.

## [0.5.0-mission-briefs-risk-layer] - 2026-06-05

### Added
- **Mission Briefs Layer**: Deterministic mission-oriented scenario overviews (GNSS Dependency, LATAM Connectivity Resilience, Weather Satellite Visibility, Disaster Response Awareness, LEO Constellation Density).
- **Space Infrastructure Risk Layer**: Analytical 0-100 signals representing portfolio density/dependency indicators.
- **Mission Panel UI**: Collapsible right-side inspector dedicated to operational context and risk signals.
- **AI Agent Intregration**: The agent parses deterministic mission intents (e.g. "GNSS dependency brief", "What is the risk level?").
- **Executive Brief v3**: Injects the highest severity space infrastructure risk signal into the summary.

### Changed
- Enhanced `/api/agent` ActionSchema with `generate_mission_brief`, `select_mission_scenario`, and `show_risk_layer`.
- Expanded EN/ES dictionary with robust translations for mission briefs.

## [v0.4.0-llm-agent-backend] - 2026-06-05
### Added
- Real LLM Backend via `/api/agent` Vercel serverless function.
- Strictly typed JSON contract for agent actions (`AgentAction` discriminated union) via Zod validation.
- Graceful fallback: If LLM API fails, times out, or returns invalid schema, seamlessly falls back to local deterministic regex parsing.
- UI indicators for agent mode (LLM vs Deterministic Fallback).
- Safety Notice caveats parsed from LLM responses displayed directly in UI.

# Changelog

All notable changes to OrbitIQ Command Center.

---

## [0.3.0-orbital-intelligence] — 2026-06-05

### Phase: Orbital Intelligence Layer

#### Added — Intelligence Engine
- **Orbital Band Intelligence**: LEO / MEO / GEO analytics — satellite count, percentage, average altitude, and top constellation groups per band
- **Regional Overflight Intelligence**: 13 world regions with real-time satellite counts, dominant orbital band, and top constellation groups per region
- **Orbital Congestion Score**: Composite 0–100 score (Low / Moderate / Elevated / High) based on weighted components — visible satellite density (40%), band concentration via Herfindahl index (30%), region concentration (20%), constellation dominance (10%)
- **Constellation Intelligence**: Per-group insights including count, dominant band, average altitude, and top region

#### Added — AI Agent v2
- 8 new intents: `compare_bands`, `compare_groups`, `congestion_summary`, `region_intelligence`, `band_intelligence`, `constellation_intelligence`, `highest_concentration_region`, `unknown_safe_fallback`
- Safe fallback intent for unrecognized queries — never hallucinates, always responds helpfully

#### Added — Executive Brief v2
- 7-section executive summary with congestion assessment and recommended focus
- Integrates band distribution, regional hotspots, and congestion scoring into a single situational report

#### Added — UI Components
- **Orbital Intelligence Panel**: Collapsible right-side panel displaying band distribution, regional hotspot, and congestion indicator
- Panel toggleable from the top bar, persists state across interactions

#### Added — Localization
- Full EN/ES localization for all intelligence features, panel labels, congestion labels, band names, and agent intents

#### Added — Data Honesty
- Congestion Score explicitly documented as a portfolio/demo analytical signal, **not** a flight-safety metric
- Regional matching documented as approximate bounding-box matching, not precise geodetic boundaries
- Orbital band classification documented as simple altitude thresholds (LEO <2000 km, MEO 2000–35 000 km, GEO >35 000 km)

---

## [0.2.0-production-port] — 2026-06-05

### Phase: Production Hardening & Final Audit

#### Fixed — Runtime stability
- **Memory leak**: `GlobeRenderer` now exposes `destroy()` — cancels rAF loop, removes all `window` and DOM event listeners, disposes Three.js geometries/materials/renderer on unmount
- **Memory leak**: `GlobeMount` calls `globe.destroy()` in `useEffect` cleanup; safe under React StrictMode double-invoke
- **Memory leak**: Propagation interval (`setInterval`) cleared in `App` unmount `useEffect`
- **Null crash**: `DetailPanel` now guards `CS.catalog[selected]` and `CS.recs[selected]` with explicit null check before render; returns `null` if stale
- **Null crash**: `selectSat()` bounds-checks `i < CS.N` before accessing buffers
- **Null crash**: `tick()` checks `r && !r.error` before `satJs.propagate`
- **Null crash**: `GlobeRenderer.flyTo()` checks `isFinite(p.x)` before lerping camera
- **Null crash**: `GlobeRenderer.setSelected()` checks `_selPos.lengthSq() > 0.01` to avoid ring at origin for failed propagation
- **Null crash**: `GlobeRenderer.writePositions/setColors/setVisible` guard for uninitialised `posAttr/colAttr/visAttr`
- **Null crash**: `findSat()` checks `c` exists before accessing `c.name`
- **Logic bug**: `a.groups.forEach(() => {})` noop removed from `runAgent`; `useStore.setState` called directly with correct `Set`
- **Logic bug**: Region filter now applied in `CatalogPanel`'s `checkPasses()` — was silently omitted, causing list/hot-loop mismatch
- **Import bug**: `CatalogPanel.tsx` had `import type { CatalogStore }` after the exported function body — moved to top (ESM requires top-level imports)
- **Dep array**: `tick` useCallback dep array changed from `[store.selected]` to `[]` — tick reads selected via `useStore.getState()` to avoid re-creating on every click
- **i18n**: `App.tsx` footer and loading screen now use `t()` — were hardcoded English strings
- **Resize**: `GlobeRenderer.resize()` guards `w === 0 || h === 0` to avoid NaN aspect ratio on hidden/zero-size container
- **WebGL texture**: Texture error callbacks now call `settle()` so `readyPromise` always resolves even when CDN fails
- **CatalogPanel**: `useMemo` dep now uses reactive `totalCount` from store instead of mutable `CS.N` (which is not reactive)
- **Region marker**: `setRegionMarker` now calls `regionMarker.geometry.dispose()` before removing

#### Fixed — Performance
- `tick()` dep array is now `[]` (stable) — no closure recreation on selection changes
- `updateCounts()` removed as a separate O(N) pass; `applyFilter()` already calls `setCounts`
- `findSat()` does exact match first, then partial — avoids returning wrong satellite for short queries like "iss"

#### Fixed — Responsible AI / data honesty
- Loading screen uses `t('loading_elements')` — localised in EN + ES
- Footer disclaimer uses `t('disclaimer')` — localised, accurate, always visible
- Agent `sourceMode` correctly set from live Zustand state on each run
- Agent `visibleCount` updated from live `renderedCount` on each run

#### Fixed — Security
- No `dangerouslySetInnerHTML` anywhere in codebase
- No `require()` calls (previously one in agent action handler — removed)
- No `window.satellite` global access (previously in old tick) — fully replaced by module import
- No dynamic `import()` at runtime in hot path

#### Added
- `GlobeApi.destroy()` method (and `GlobeRenderer` extended return type)
- `role="status" aria-live="polite"` on loading veil
- `role="contentinfo"` on footer
- `aria-hidden="true"` on globe container div

---

## [0.2.0] — 2026-06-05

### Phase: React/Vite/TypeScript Production Port + Server-Side TLE Cache

#### Added
- React + Vite + TypeScript project (strict TS, ESLint configured)
- `/api/tle` Vercel serverless function with 6-hour server-side TLE cache
- Zustand state management for UI state
- Mutable catalog store (`catalogStore.ts`) — hot Float32 buffers outside React
- Formal `AiAgentResponse` TypeScript type — LLM-swap-ready contract
- Complete EN/ES localisation for all 78 UI strings
- Documentation suite: README, CHANGELOG, SECURITY, DATA_DISCLAIMER, walkthrough, task

#### Changed
- All v0.1.0 JS modules ported to TypeScript
- Data provenance copy updated to accurate language
- Disclaimer always visible in footer

---

## [0.1.0] — 2026-05-01

- Framework-free HTML/JS prototype
- Three.js globe, SGP4 point cloud, deterministic AI agent
- EN/ES localisation, representative + live TLE support
