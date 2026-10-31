---
name: Institution evidence limits
description: Avoid false rejection of real institutions when public directory lookups fail.
---

Treat directory absence, spelling differences, and provider outages as uncertainty, never proof that a school is fake or closed. Do not make incomplete directory coverage a hard gate to general career guidance. Clearly distinguish unverified guidance from evidence-backed institution identity, and neither implies accreditation.

Check every institution users enter for evidence that it is real. Keep this institution-identity check alongside the uniform qualification-guidance workflow.

**Why:** The user said, “I want all institutions that people enter to be verified and confirmed that they are real”.

**How to apply:** Require supporting evidence before displaying a confirmed institution status. Attempt verification for every entry, but explicitly disclose unresolved cases rather than promising complete worldwide coverage or falsely confirming an institution.

**Why:** Real colleges failed lookup because Wikidata did not correct a transposed spelling and Wikimedia returned HTTP 429 from the running API even after earlier live checks succeeded. A passing mocked test does not establish live provider availability.

**How to apply:** Check the running endpoint with the user's exact input, distinguish provider errors from negative matches, require confirmation for spelling suggestions, and preserve explicit uncertainty in reports. Do not hardcode individual schools to hide coverage problems.