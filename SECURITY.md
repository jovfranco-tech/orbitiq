# Security Baseline — OrbitIQ Command Center v0.9.0

## Summary

OrbitIQ is a read-only public-data analytical tool designed for educational and portfolio purposes. It collects no user data, requires no credentials, performs no write operations, and does not control operational aerospace hardware.

---

## Findings & Controls

| Area | Status | Detail |
|---|---|---|
| API keys in frontend | ✅ None | No third-party API keys used. CelesTrak is public, unauthenticated. |
| Secrets committed | ✅ None | No `.env` files committed. No secrets in source. |
| Direct browser→CelesTrak | ✅ Eliminated | All TLE fetches go through `/api/tle` (server-side). Browser never hits CelesTrak. |
| User PII | ✅ None collected | No forms, no accounts, no analytics configured. |
| localStorage | ✅ Safe Metadata | User preferences, watchlists, saved views, and snapshots are stored locally. Only public metadata is stored. `eval()` is never used; JSON import relies on strict schema parsing (`JSON.parse` + defensive checks). |
| Public data disclaimer | ✅ Present | Visible on every screen; in all locales. |
| Graceful fallback | ✅ Implemented | `/api/tle` failure → representative catalog, clearly labeled. |
| CORS | ✅ Server-side | API sets `Access-Control-Allow-Origin: *` (public data, no credentials). |
| Dependency supply chain | ⚠️ Monitor | Dependencies: React 18, Three.js r128, satellite.js 5, Zustand 4. Run `npm audit` before releases. |
| XSS | ✅ Low risk | No `dangerouslySetInnerHTML`. Satellite names rendered via React's escaped output. |
| CSP | ⚠️ Recommended | Add a `Content-Security-Policy` header in `vercel.json` before public launch. |
| HTTPS | ✅ Vercel enforced | All Vercel deployments are HTTPS by default. |

---

## Recommendations for v1.0 Launch

When preparing for full launch:
- Maintain Vercel environment variables securely.
- Enforce rate-limiting on `/api/agent` (e.g. 10 req/min per IP).
- Keep the `AbortSignal` strict timeouts to prevent lambda hanging.
- Ensure Zod parsing safely masks all stack traces from client exposure.
- Add a strict CSP header in `vercel.json` restricting `connect-src` to your own domain + CelesTrak + LLM provider.

## v0.9.0 Release Candidate Notes
v0.9.0 introduces no new security surface area. All validations on local persistence, payload limits, and error masking remain intact and verified.

---

## Third-party dependencies

| Package | Purpose | Risk notes |
|---|---|---|
| `three` | 3D rendering | Mature, no network calls |
| `satellite.js` | SGP4 propagation | Pure math, no network calls |
| `react` / `react-dom` | UI framework | Maintained by Meta |
| `zustand` | State management | Minimal, no network calls |

Run `npm audit` regularly. Subscribe to GitHub advisories for the above packages.

---

## Data provenance

All satellite data originates from public CelesTrak GP feeds (USSPACECOM public catalog),
subject to CelesTrak's terms of service. No proprietary or classified data is used or claimed.

See `DATA_DISCLAIMER.md` for the full data honesty statement.

## AI Command Agent API
OrbitIQ v0.4.0 introduces an LLM backend via `/api/agent`. The `OPENAI_API_KEY` MUST ONLY be provided in server-side environments (Vercel edge/serverless). It is NEVER exposed to the frontend. Validations are enforced using strict schema parsing (Zod) server-side to prevent injection of malicious actions.

## v0.6.0 Scenario Simulation Security
Time Simulation execution is purely client-side mathematical propagation via the `satellite.js` library. No new backend compute, database reads, or additional API calls are made during time travel. This maintains the zero-auth, zero-PII security baseline. All data remains public and fully client-side safe.

## v0.7.0 Local Persistence Security
Watchlists, saved views, and snapshots utilize the browser's `localStorage` via Zustand's `persist` middleware. 
- No PII, tracking data, or proprietary information is stored.
- The `ExportImportDialog` uses `JSON.parse` with strict try/catch error boundaries. It explicitly avoids `eval()` and `Function()`.
- Data imported by users is treated as untrusted and only populates existing typed properties.

## v0.8.0 Data Health & Reliability Layer Security
- **Strict Payload Limits**: `/api/agent` enforces 500-character maximums on queries and 10KB maximums on context objects to mitigate Denial of Wallet / Token stuffing.
- **Secure Error Masking**: `ZodError` stack traces and OpenAI HTTP error bodies are caught and masked server-side, ensuring no API keys or system metadata leak to the client.
- **Graceful Degradation**: Vercel lambdas use explicit `AbortSignal.timeout` to ensure fast-failing. The client uses `ErrorBoundary` to guarantee UI availability even during WebGL/API failures.
