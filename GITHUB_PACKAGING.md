# OrbitIQ Command Center — GitHub Packaging

## Repo Description
AI-native 3D satellite intelligence command center using public TLE/SGP4 data, validated LLM agent actions, mission briefs, scenario simulation and executive orbital insights.

## GitHub Topics
`satellite-tracking`, `orbit-visualization`, `threejs`, `react`, `vite`, `typescript`, `satellitejs`, `sgp4`, `space-intelligence`, `ai-agent`, `llm-agent`, `command-center`, `portfolio-project`, `resilience`, `infrastructure-intelligence`

## Release Notes Draft (v0.9.0 Release Candidate)
OrbitIQ v0.9.0 is our official Release Candidate. This release completes the hardening of the application, focusing on:
- **UX & Accessibility Polish**: Aria-labels and responsive tuning.
- **Product Positioning**: Focused explicitly on public orbital visibility and infrastructure dependency awareness.
- **Data Honesty**: Further tightened caveats emphasizing that this is a portfolio/educational tool, not an operational flight-safety system.
- **Documentation**: A complete overhaul of the README and deployment instructions.

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
I just wrapped up v0.9.0 of OrbitIQ, an AI-native 3D satellite intelligence dashboard. It propagates thousands of satellites in real-time directly in the browser using SGP4 mathematics and Three.js. It features a deterministic LLM command agent, mission scenario simulation, and a robust Data Health observability layer. Built with React, Vite, TypeScript, and optimized for edge serverless deployments.

Check out the interactive demo and source code here!
