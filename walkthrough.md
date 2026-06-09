# OrbitIQ — Developer Walkthrough

A guided tour of the codebase for contributors and reviewers.

---

## Expanded Orbital Environment (v1.1.0)

The catalog now has three **view modes** (`ViewMode` in `src/types/index.ts`):
`operational` (default), `expanded`, `debris`.

```
ViewModeSelector (top-center)
  └── onSetMode(mode) → App.handleSetViewMode(mode)
        ├── store.setViewMode(mode) + resetFilters() + modeLoading
        ├── loadSatellites(mode)          # src/data/client.ts → /api/tle?mode=...
        │     └── enrich(): classifyGroup() + classifyObjectClass()   # objectClass.ts
        ├── loadCatalog(): fills CS.objectClass[] + paintColorBase(mode)
        │     ├── operational → group palette (unchanged look)
        │     └── expanded/debris → OBJECT_CLASS_META palette
        └── applyFilter(): activeClasses filter + debris-risk emphasis
```

**Object taxonomy** (`src/data/objectClass.ts`): `operational_satellite`, `active_payload`,
`inactive_payload`, `rocket_body`, `debris`, `unknown_object`. Classified heuristically from
public TLE names. `isOperationalClass()` / `isNonOperationalClass()` gate the debris emphasis.

**API** (`api/tle.ts`): `fetchOperational()` (active + cubesat/amateur) and `fetchExpanded()`
(operational + real CelesTrak fragmentation feeds), separate caches, honest fallback chain.
`countClasses()` produces best-effort metadata; the client recomputes authoritative counts.

**Honest fallback** (`src/data/catalog.ts` `buildDebrisFallback()`): representative DEMO
debris/rocket-body objects used only when real feeds are unavailable, always flagged synthetic.

**AI agent** (`src/ai/agent.ts`): mode + taxonomy intents (`set_view_mode`, `filter_by_class`,
`compare_operational_vs_tracked`, `explain_taxonomy`); the same schema is enforced server-side
in `api/agent.ts`.

---

## Boot sequence

```
main.tsx
  └── App.tsx (React root)
       ├── <GlobeMount onReady={onGlobeReady} onError={...} />
       │     └── GlobeRenderer.ts (Three.js, imperative)
       └── onGlobeReady()
             ├── loadSatellites()          → /api/tle → fallback catalog
             ├── loadCatalog(globe, data)  → allocate GPU buffers
             ├── tick()                    → first propagation frame
             └── setInterval(tick, 900ms) → worker-backed propagation loop
```

---

## Hot path: propagation loop (tick)

Called every 900 ms. Runs entirely outside React state to avoid re-renders.

```
tick()
  ├── Web Worker: for each satellite, satellite.js propagate() → ECI xyz
  ├── ECI → scene coordinates → CS.posBuf (Float32Array)
  ├── eciToGeodetic → lat/lon/alt → CS.lat, CS.lon, CS.alt, CS.band
  ├── globe.setEarthRotation(gmst)
  ├── globe.writePositions(CS.posBuf)   → uploads to GPU
  ├── applyFilter(globe)                → compute CS.vis[], globe.setVisible()
  ├── globe.renderOnce()                → Three.js render
  └── useStore.getState().setCounts()   → only UI-side state update
```

`CS` (catalogStore) holds all mutable typed arrays. `useStore` (Zustand) holds
filter/selection state that drives React renders.

---

## Rendering pipeline

```
Three.js scene
  ├── earthGroup (rotates with GMST)
  │     ├── Earth mesh (Phong, day + night textures)
  │     └── Graticule lines
  ├── Atmosphere (shader, BackSide, AdditiveBlending)
  ├── Stars (static Points)
  ├── Satellites (dynamic Points — ONE draw call for all N satellites)
  │     Vertex shader: projects each point, sizes by distance
  │     Fragment shader: circular dot, hot white core + category color
  ├── Orbit polyline (LineSegments, for selected satellite)
  └── Selection ring (animated RingGeometry)
```

GPU buffers updated per tick via `posAttr.needsUpdate = true`.
Earth rotates by `gmstRot + π` to align texture with ECI frame.

---

## Filter system

Filters are applied in `applyFilter()` (hot path) and mirrored in `CatalogPanel.tsx`
(React-side, for the results list). Both check the same conditions:

1. `alt[i] >= 0` (propagation succeeded)
2. `activeGroups` set (if non-empty, satellite group must be in set)
3. `filterBand` (LEO/MEO/GEO)
4. `altMax` / `altMin`
5. `filterRegion` (lat/lon bounding box via `matchRegion()`)

The selected satellite always stays visible regardless of filters.

---

## AI agent contract

`parse(query, ctx)` returns `AiAgentResponse`. The actions object is pure data:

```ts
actions: {
  groups: GroupKey[] | null,   // restrict to these constellation groups
  band: BandKey | null,        // LEO | MEO | GEO
  region: string | null,       // region key
  altMax: number | null,       // km
  altMin: number | null,
  focusSatnum: number | null,  // fly-to + select
  brief: boolean,              // open executive brief
}
```

`App.tsx` reads `actions` and calls Zustand store setters. The agent never
touches the globe or store directly — clean separation of concerns.

---

## /api/tle data flow

```
Browser           →   /api/tle (Vercel serverless)   →   CelesTrak GP
                  ←   JSON { meta, satellites[] }    ←   TLE text

                  If cache hit (≤6h): returns cached JSON
                  If CelesTrak fails: returns stale degraded cache when available,
                  otherwise { meta: { sourceMode: 'fallback' }, satellites: [] }

src/data/client.ts:
  loadSatellites()
    └── fetch('/api/tle')
          ├── success + satellites.length >= 100 → use live/cached data
          └── failure OR too few → buildCatalog() (representative fallback)
```

---

## Adding a new filter type

1. Add the filter field to `UIState` in `src/state/store.ts`
2. Add a setter action
3. Apply the filter in `applyFilter()` in `App.tsx`
4. Mirror the check in `CatalogPanel.tsx` (for the results list)
5. Wire the UI control in `CatalogPanel.tsx`

---

## Adding a new constellation group

1. Add the `GroupKey` literal type in `src/types/index.ts`
2. Add metadata in `src/data/groups.ts` `GROUPS` map
3. Add detection in `classifyGroup()` in `src/data/groups.ts`
4. Add a factory entry in `src/data/catalog.ts` `FACTORIES` if needed
5. Add `GROUP_WORDS` entry in `src/ai/agent.ts` for NL detection
6. Add `RELEVANCE` entry in `src/ai/agent.ts`

---

## Localising a new string

1. Add the key + EN string to `DICT.en` in `src/i18n/i18n.ts`
2. Add the ES translation to `DICT.es`
3. Use `t('your_key')` in components

---

## Performance notes

- Keep the propagation loop (`tick`) and `applyFilter()` free of React state updates
  except for the summary count at the end
- Do not create React components per satellite (thousands of re-renders per tick)
- Memoize heavy computations in panel components with `useMemo`
- The catalog results list is capped at 120 items (`RESULT_CAP`) to keep DOM small
- `Float32Array` buffers are pre-allocated at catalog load time; no GC pressure per tick
- Time controls update display text on a 500 ms interval rather than every animation frame
- Import/export persists metadata-only user state; no raw satellite catalog is stored in localStorage
