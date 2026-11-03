# Mailbox verification database regression tests

Run just this suite from the workspace root:

```sh
pnpm --filter @workspace/api-server run test:reply-db
```

It is also included in the API server's regular `test` command. Supply
`DATABASE_URL` through the environment, pointing to a **development/test**
PostgreSQL database whose role can create schemas and see its own sessions in
`pg_stat_activity`. Missing or unreachable PostgreSQL fails the suite rather
than silently skipping it. Do not use a production database.

The suite uses a randomly named private schema, pins every test pool connection
to that schema without a `public` fallback, and drops only its own schema after
completion. Tests rebuild isolated fixtures between cases. If the test process
is forcibly killed, an unused `reply_test_*` schema may remain for manual
cleanup. No existing account rows are read or changed.

Database queries, Drizzle account lookups, HTTP handlers, token checks, and the
startup migration are real. Only the database connection wiring, random code
sequence, rate limiter, and outbound sender are replaced. The sender never
imports or calls a mail provider. A test-only session secret is restored after
the suite.

Concurrency cases hold a PostgreSQL row lock until all confirmations are
observably blocked in separate database sessions, then release them. This
checks actual competing updates rather than relying on HTTP timing.

Coverage includes single-use correct codes, the five-guess cap under concurrent
requests, expiry, resend replacement and reset, pending and verified mailbox
changes, account deletion/recreation, sender rejection/exception cleanup, and
an older send failure racing with a newer successful resend. Migration cases
exercise fresh creation, repeated startup, username-only legacy records, and
partial migration recovery, including database constraints and deletion
cascades. This is mailbox verification coverage, not delivery-history coverage.
