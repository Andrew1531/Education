---
name: Webhook verification compatibility
description: Svix return-value behavior and delivery-status interpretation.
---

Treat signature verification and payload parsing as separate operations, always
parsing only after verification succeeds.

**Why:** Svix 2.9 changed verification to return nothing; code assuming the older
parsed-object return can reject every valid webhook despite successful checks.
Preserve this separation across SDK upgrades.

**How to apply:** Check the installed verifier's contract rather than copying
examples from older SDK releases; keep a real signed-payload regression test.
