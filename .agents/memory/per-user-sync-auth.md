---
name: Per-user sync auth & schema deploys
description: How per-user state sync is authorized and how schema changes reach production in this project.
---

**Rule 1:** Endpoints that read/write per-user state must verify `x-auth-token` = HMAC-SHA256(SESSION_SECRET, lowercased username) via `issueUserToken`/`verifyUserToken` (api-server `lib/userToken.ts`). Tokens are issued on signup, signin, and self-sync (when the client's password hash matches). Client stores them under `ge_auth_token_<username>` and skips sync when absent.
**Why:** A code review rejected trusting a client-supplied username (IDOR); the app has no session system, so stateless HMAC tokens were the minimal fix.
**How to apply:** Any new "sync this user's data" endpoint (e.g. roadmap steps) must reuse this token check, not accept a bare username.

**Rule 2:** The deploy pipeline never runs `drizzle-kit push` — new columns must be added idempotently at api-server startup in `lib/migrate.ts` (`ALTER TABLE ... ADD COLUMN IF NOT EXISTS ...`) in addition to the Drizzle schema.
**Why:** Review rejected schema changes with no production migration path; selecting a missing column breaks all user queries.
**How to apply:** Every users-table schema change needs a matching `ensureSchema` statement.
