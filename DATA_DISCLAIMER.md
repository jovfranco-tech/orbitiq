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

## Intelligence Layer Disclaimers (v0.3.0)

The Orbital Intelligence Layer (band analytics, regional overflight, congestion scoring,
constellation intelligence) provides **analytical portfolio signals** derived from the
currently visible satellite catalog. These indicators are designed for demonstration,
education, and situational awareness.

They are **not**:
- Flight-safety metrics
- Conjunction or collision assessments
- Operationally validated density models
- Inputs to any safety-of-life decision

### Congestion Score

The **Orbital Congestion Score** is a weighted composite score (0–100) computed from:

| Component | Weight |
|---|---|
| Visible satellite density | 40% |
| Band concentration (Herfindahl index) | 30% |
| Region concentration | 20% |
| Constellation dominance | 10% |

**Limitations:**
- The score is based only on the currently loaded catalog (live, cached, or representative).
  It does not account for debris, classified objects, or untracked payloads.
- It is a **single-moment snapshot**, not a time-averaged or predicted trend.
- It is **not** a conjunction/collision assessment and must not be treated as one.
- The Herfindahl-based band concentration component reflects catalog composition, not
  physical proximity or collision probability.

### Regional Matching

Regional overflight counts use **approximate bounding-box matching** based on latitude
and longitude ranges. This means:
- Boundaries are rectangular approximations, not precise geodetic or political borders.
- Satellites near region edges may be counted in adjacent regions or missed.
- Ocean regions and polar areas may have less precise coverage.
- Regional counts should be treated as approximate indicators, not exact tallies.

### Orbital Band Classification

Orbital bands are classified using simple **altitude thresholds**:

| Band | Altitude range |
|---|---|
| LEO (Low Earth Orbit) | < 2,000 km |
| MEO (Medium Earth Orbit) | 2,000 – 35,000 km |
| GEO (Geostationary/Geosynchronous) | > 35,000 km |

These thresholds are conventional approximations. Real orbital regimes have nuanced
boundaries (e.g., HEO, SSO, sub-GEO transfer orbits) that are not distinguished by
this classification.

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

### AI Command Agent (v0.4.0 LLM Backend)
The AI Command Agent uses an LLM (Large Language Model) via OpenAI API proxy to interpret natural language. The LLM has NO direct access to manipulate the orbital database or propagate orbits. It only translates intent into deterministic UI filters. Responses may contain errors. Always verify applied filters in the UI.

## v0.5.0 Mission Briefs & Space Infrastructure Risk Layer
- **Mission Briefs** are deterministic portfolio intelligence summaries based on visible public satellite object counts in approximate regional boundaries.
- **Risk Signals** are analytical scenario indicators intended to summarize portfolio dependency pressures (e.g. density, signal reliance, optical crowding). They are **NOT** operational aerospace risk assessments.
- OrbitIQ is strictly for situational awareness, education, and portfolio analytics. It cannot and should not be used for conjunction analysis, collision avoidance, flight safety, or real-world operational command decisions.

## v0.6.0 Time Controls & Scenario Simulation Disclaimers
- **SGP4 Accuracy Decay**: Orbit propagation accuracy degrades continuously as the simulation time moves further away from the original TLE epoch. Simulating days or weeks into the future (or past) using a single TLE snapshot will result in significant positional divergence from reality.
- **Maneuvers Excluded**: The simulation does not predict or incorporate future orbital maneuvers. A satellite simulated three days into the future may have performed station-keeping in reality, rendering the simulated position inaccurate.
- **Not for Predictive Safety**: Simulated scenarios are for educational "what-if" analysis and portfolio visualization only. They are absolutely **NOT** suitable for flight safety, predictive conjunction assessment, or mission planning.
