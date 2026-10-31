---
name: Hybrid backend/local account sync
description: How VerifED's GitHub Pages frontend + Replit backend split works and its constraints
---

The education site is static (GitHub Pages, verifed.co) with an optional central API backend (api-server artifact + Replit PostgreSQL).

**Rules:**
- Frontend tries the API first and falls back to device-local localStorage; the API base is `VITE_API_URL` (GitHub repo variable, baked at build) or same-origin `/api` in Replit dev.
- On GitHub Pages with no backend configured, `/api` calls return the SPA's HTML 404 page — the client must treat non-JSON 404/502/503/504 as "backend unavailable" (fallback), never as an auth failure.
- Visitor data (accounts, evaluator answers) entered before the backend existed lives ONLY in that visitor's browser; it is unrecoverable server-side. Retroactive requests for such data can only be satisfied going forward via the on-load self-sync.
- The live site can only reach the backend after the Replit app is published AND the GitHub repo variable `VITE_API_URL` is set to the production URL; then re-run the Pages deploy.

**Why:** a user sign-up "disappeared" because data was purely client-side; this architecture was chosen to keep GitHub Pages hosting while centralizing accounts.

Never attribute an ownerless legacy education profile to whoever signs in or signs up next. A new signup must not inherit legacy education answers.

**Why:** Shared-browser users can sign out before profile ownership is recorded. Treating an unowned profile as the next account's data discloses another person's qualifications and may sync them to the wrong account.

**How to apply:** Require positive ownership for legacy migration. Preserve unowned data separately for recovery rather than importing it. Compatibility tests must not expect ownerless legacy fields to override a signed-in user's profile.
