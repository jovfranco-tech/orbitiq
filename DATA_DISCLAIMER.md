# Data Disclaimer — OrbitIQ Command Center

## What this tool shows

OrbitIQ Command Center visualizes satellite orbital positions derived from
**public Two-Line Element (TLE) sets** propagated with the **SGP4** algorithm.

---

## Data modes

| Mode | What it means |
|---|---|
| **LIVE PUBLIC TLE** | TLE data freshly fetched from CelesTrak within the last hour. Positions reflect the current public catalog, propagated forward to the current time. |
| **CACHED PUBLIC TLE** | TLE data fetched from CelesTrak and cached server-side (≤6 hours old). Propagation is still performed in real time; only the source elements are not the most recent possible fetch. |
| **DEMO · REPRESENTATIVE** | The `/api/tle` endpoint was unreachable. The app is using a deterministic representative catalog generated client-side. Orbital shells, inclinations, and altitudes are physically realistic, but the specific element snapshots are not live observations. |

The current data mode is always shown in the status pill at the top of the screen.

---

## What "representative" means

The fallback catalog contains:
- **12 real anchor objects** with elements close to their true orbits
  (ISS, CSS Tianhe, Hubble, GOES-16, GOES-18, GPS BIIF-2, Galileo 5, Terra, Aqua,
  NOAA 19, Landsat 9, Sentinel-2A). These carry `isReal: true`.
- **~1,880 generated objects** across realistic orbital shells (Starlink-like 550 km,
  OneWeb-like 1,200 km, GNSS MEO 20–23k km, GEO belt, sun-synchronous 700–900 km).
  Every generated object has a **valid TLE with a correct checksum** and is propagated
  through the same satellite.js SGP4 pipeline — the orbits are physically real,
  but the specific element snapshot is not a live observation.

Do not treat representative catalog entries as individually real objects.

---

## Known limitations of public TLE data (all modes)

1. **Age** — TLEs are point-in-time snapshots. Propagation accuracy degrades with time
   since epoch. A 7-day-old TLE for a maneuvering object may be significantly wrong.
2. **Maneuvers** — Orbital maneuvers are not reflected until a new TLE is published.
3. **Catalog completeness** — The public CelesTrak active catalog does not include
   classified payloads or all tracked debris.
4. **SGP4 model limitations** — SGP4 is a simplified perturbation model.
   For precise ephemerides use SP (special perturbation) propagators.

---

## Intended use

This application is designed for:
- Portfolio demonstration
- Educational exploration of orbital mechanics
- Situational awareness of the publicly tracked orbital environment

This application is **not** designed or suitable for:
- Flight safety assessments
- Conjunction analysis or collision avoidance
- Operational mission planning
- Any safety-of-life application

---

## Data source

Public TLE data: [CelesTrak](https://celestrak.org/) (Dr T.S. Kelso).  
Propagation: [satellite.js](https://github.com/shashwatak/satellite-js) (SGP4/SDP4).

Use of CelesTrak data is subject to [CelesTrak's terms of service](https://celestrak.org/faq.php#usage).
