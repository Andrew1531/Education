---
name: Hybrid backend/local account sync
description: How VerifED's GitHub Pages frontend + Replit backend split works and its constraints
---

The education site is static (GitHub Pages, verifed.xyz) with an optional central API backend (api-server artifact + Replit PostgreSQL).

**Rules:**
- Frontend tries the API first and falls back to device-local localStorage; the API base is `VITE_API_URL` (GitHub repo variable, baked at build) or same-origin `/api` in Replit dev.
- On GitHub Pages with no backend configured, `/api` calls return the SPA's HTML 404 page — the client must treat non-JSON 404/502/503/504 as "backend unavailable" (fallback), never as an auth failure.
- Visitor data (accounts, evaluator answers) entered before the backend existed lives ONLY in that visitor's browser; it is unrecoverable server-side. Retroactive requests for such data can only be satisfied going forward via the on-load self-sync.
- Admin list/delete/reset endpoints require the `x-admin-key` header matching the `ADMIN_API_KEY` secret; dev without the key is allowed, production fails closed. Signup/signin/sync/profile are intentionally open (low-stakes product choice).
- The live site can only reach the backend after the Replit app is published AND the GitHub repo variable `VITE_API_URL` is set to the production URL; then re-run the Pages deploy. Production DB needs the drizzle schema pushed at publish time.

**Why:** a user sign-up "disappeared" because data was purely client-side; this architecture was chosen to keep GitHub Pages hosting while centralizing accounts.
