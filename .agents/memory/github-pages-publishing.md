---
name: GitHub Pages publishing
description: Release verification and authentication constraints for the public GitHub Pages site.
---

Treat a workspace commit and a live GitHub Pages release as separate states. Never claim a metadata or tracking change is live until the `main`-branch Pages workflow runs successfully and the public HTML contains it.

For this site, push requested updates to the live branch (`main`), not only a staging branch.

**Why:** The user instructed: “yes, push it to the live branch always”.

**How to apply:** Treat `main` as the intended destination when the user asks to push this site's updates; preserve remote changes and verify the release.

Public route HTML must be generated during the normal Pages build; do not restore the old practice of copying the homepage over the 404 document.

**Why:** GitHub Pages has no SPA rewrite server. Public routes need their own files, while unknown URLs should remain genuine not-found responses rather than a homepage carrying indexable metadata.

**Why:** A correctly committed tracking change remained absent from the public site because `main` had not received it. Direct Git credentials were invalid, SSH was unavailable, and the installed GitHub connector could read but its write request was blocked by a connector-side Cloudflare 403.

**How to apply:** Check the live HTML and the latest Pages run before reporting success. If all repository write paths remain blocked, give the user the exact GitHub web edit or authentication action rather than implying a local commit was published.

The connector's Contents API PUT can receive a Cloudflare block while Git Data API writes succeed. Do not equate a blocked Contents request with all repository writes being unavailable.

**Why:** A discovery-file update succeeded through creating a tree and commit and fast-forwarding the branch after the Contents write route had failed.

**How to apply:** Use the current remote tree as the base, include only authorized files, and update the branch without force so concurrent changes cannot be overwritten.