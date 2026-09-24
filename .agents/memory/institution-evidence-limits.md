---
name: Institution evidence limits
description: Avoid false rejection of real institutions when public directory lookups fail.
---

Treat directory absence, spelling differences, and provider outages as uncertainty, never proof that a school is fake or closed. Do not make incomplete directory coverage a hard gate to general career guidance. Clearly distinguish unverified guidance from evidence-backed institution identity, and neither implies accreditation.

**Why:** Real colleges failed lookup because Wikidata did not correct a transposed spelling and Wikimedia returned HTTP 429 from the running API even after earlier live checks succeeded. A passing mocked test does not establish live provider availability.

**How to apply:** Check the running endpoint with the user's exact input, distinguish provider errors from negative matches, require confirmation for spelling suggestions, and preserve explicit uncertainty in reports. Do not hardcode individual schools to hide coverage problems.