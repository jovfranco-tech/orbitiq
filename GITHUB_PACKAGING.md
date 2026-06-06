# OrbitIQ Command Center — GitHub Packaging

## Repo Description
AI-native 3D satellite intelligence command center using public TLE/SGP4 data, validated LLM agent actions, mission briefs, scenario simulation and executive orbital insights.

## GitHub Topics
`satellite-tracking`, `orbit-visualization`, `threejs`, `react`, `vite`, `typescript`, `satellitejs`, `sgp4`, `space-intelligence`, `ai-agent`, `llm-agent`, `command-center`, `portfolio-project`, `resilience`, `infrastructure-intelligence`

## Release Notes Draft (v1.0.0 Public Portfolio Release)
OrbitIQ v1.0.0 is the public portfolio release candidate. This release completes release-readiness hardening across build, WebGL fallback, API reliability, deterministic AI fallback, import/export safety, data honesty, EN/ES localization, documentation, and Vercel readiness.

## Screenshot Checklist
- [ ] Full 3D globe hero (Overview of Earth with dense satellite cloud)
- [ ] Selected satellite inspection (Detail panel showing LEO altitude/speed)
- [ ] AI agent LLM response (Agent successfully filtering to "Show GEO only")
- [ ] Deterministic fallback mode (Health panel showing degraded status with fallback data active)
- [ ] Orbital intelligence panel (Congestion scores and band distributions)
- [ ] Mission brief (e.g., GNSS Dependency overview)
- [ ] Risk layer (High-risk sub-points over regions)
- [ ] Time simulation (Fast-forwarding to a future epoch)
- [ ] Current vs simulated comparison (Detail panel diff)
- [ ] Saved mission view / snapshot (Imported view with custom filters)
- [ ] Data health / degraded mode (TopBar health indicator Red/Yellow)
- [ ] EN/ES switch (Showing the Spanish UI)

## 30-Second Demo Script
1. **[0:00] Open Globe**: Start at the default high-orbit view showing the dense cloud of tracked objects.
2. **[0:05] Click Satellite**: Select an active Starlink satellite to bring up the inspection panel.
3. **[0:10] Ask AI Agent**: Open the Command Agent and type "Focus on weather satellites over North America". Hit Run.
4. **[0:15] Show Mission Brief**: Open the Missions panel and select "GNSS Dependency Brief". Let the camera auto-pan.
5. **[0:20] Fast Forward Simulation**: Open Time Controls, select +2 Hours, and play to show orbital drift.
6. **[0:25] Show Executive Brief**: Click the Brief button to generate an on-the-fly summary of the current snapshot.
7. **[0:30] Show Data Health**: Click the TopBar health indicator to reveal the `DataHealthPanel`, proving transparency.

## Portfolio / LinkedIn Copy
**OrbitIQ Command Center**
I just wrapped up v1.0.0 of OrbitIQ, an AI-native 3D satellite intelligence dashboard. It visualizes public TLE/SGP4 orbital data in a GPU point-cloud globe, supports validated LLM or deterministic fallback agent actions, includes mission briefs and scenario simulation, and makes data provenance/degraded modes visible. Built with React, Vite, TypeScript, Three.js, satellite.js, and Vercel serverless functions.

Check out the interactive demo and source code here!

## Resume Bullet
- Built OrbitIQ, a React/Vite/TypeScript 3D satellite intelligence command center using Three.js GPU point-cloud rendering, satellite.js SGP4 propagation, Vercel serverless TLE caching, validated LLM agent actions, deterministic fallback, scenario simulation, mission briefs, and metadata-only local persistence.

## Interview Pitch
OrbitIQ demonstrates how I design AI-native interfaces around deterministic domain logic. The LLM never calculates orbital positions; it only suggests schema-validated UI actions, while SGP4 propagation, provenance, degraded mode, import validation, and data-honesty caveats keep the product trustworthy.
