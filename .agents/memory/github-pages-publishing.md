---
name: GitHub Pages publishing
description: Release verification and authentication constraints for the public GitHub Pages site.
---

Treat a workspace commit and a live GitHub Pages release as separate states. Never claim a metadata or tracking change is live until the `main`-branch Pages workflow runs successfully and the public HTML contains it.

**Why:** A correctly committed tracking change remained absent from the public site because `main` had not received it. Direct Git credentials were invalid, SSH was unavailable, and the installed GitHub connector could read but its write request was blocked by a connector-side Cloudflare 403.

**How to apply:** Check the live HTML and the latest Pages run before reporting success. If all repository write paths remain blocked, give the user the exact GitHub web edit or authentication action rather than implying a local commit was published.