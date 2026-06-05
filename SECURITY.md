# Security Baseline — OrbitIQ Command Center v0.2.0

## Summary

OrbitIQ is a read-only public-data visualization tool. It collects no user data,
requires no credentials, and performs no write operations.

---

## Findings & Controls

| Area | Status | Detail |
|---|---|---|
| API keys in frontend | ✅ None | No third-party API keys used. CelesTrak is public, unauthenticated. |
| Secrets committed | ✅ None | No `.env` files committed. No secrets in source. |
| Direct browser→CelesTrak | ✅ Eliminated | All TLE fetches go through `/api/tle` (server-side). Browser never hits CelesTrak. |
| User PII | ✅ None collected | No forms, no accounts, no analytics configured. |
| localStorage | ✅ No sensitive data | Language preference only, if persisted. No orbital data or user data stored locally. |
| Public data disclaimer | ✅ Present | Visible on every screen; in all locales. |
| Graceful fallback | ✅ Implemented | `/api/tle` failure → representative catalog, clearly labeled. |
| CORS | ✅ Server-side | API sets `Access-Control-Allow-Origin: *` (public data, no credentials). |
| Dependency supply chain | ⚠️ Monitor | Dependencies: React 18, Three.js r128, satellite.js 5, Zustand 4. Run `npm audit` before releases. |
| XSS | ✅ Low risk | No `dangerouslySetInnerHTML`. Satellite names rendered via React's escaped output. |
| CSP | ⚠️ Recommended | Add a `Content-Security-Policy` header in `vercel.json` before public launch. |
| HTTPS | ✅ Vercel enforced | All Vercel deployments are HTTPS by default. |

---

## Recommendations for v0.3.0 (LLM backend)

When adding a real LLM backend:
- Store API keys in Vercel environment variables, never in source
- Rate-limit `/api/agent` (e.g. 10 req/min per IP)
- Validate and sanitise the `query` field server-side before passing to the LLM
- Do not echo raw user input back into LLM system prompts without sanitisation
- Add a CSP header that restricts `connect-src` to your own domain + CelesTrak

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
