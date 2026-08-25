---
name: Contact form delivery
description: Confirmed production behavior and constraint for VerifED's public contact form.
---

The public contact form delivers through a browser-side Web3Forms POST and shows success only after the provider accepts the submission. A real production test confirmed direct delivery works without opening Outlook.

**Why:** The previous mailto implementation opened the visitor's email client instead of providing reliable in-site delivery and truthful status.

**How to apply:** Keep the public form provider-backed with inline bilingual success/error states. Do not add `mailto:` links or fallbacks anywhere in the app's contact flows.