# Changelog

All notable changes to OrbitIQ Command Center.

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
