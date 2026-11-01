# Official program directory review

This is an editorial sample, not nationwide coverage, accreditation verification,
admission eligibility, licensing advice, or a credential-equivalency decision.
Locations identify the institution, not a promise of online delivery.

## Evidence reviewed on 2026-10-31

New records link directly to the official award page in both `url` and `sourceUrl`.
The page title and award requirements establish the listed level:

- University of Alaska Fairbanks: Applied Accounting and Applied Business
  undergraduate certificates (30 credits) and A.A.S. awards (60-credit minimum).
  These are not graduate certificates. The accounting certificate's entry expectations
  include basic computer skills; ask the department about placement.
- University of Arkansas – Fort Smith: Engineering (Electrical), Associate of
  Science. Do not confuse it with the partner University of Arkansas bachelor's
  program, which requires separate admission. Do not carry the page's bachelor's
  accreditation statement onto the associate award.
- Wichita State: BS and MS in Mechanical Engineering; BS in Biological Sciences
  with Biological/Biomedical Emphasis; MS in Biological Sciences. Keep the BS
  emphasis in the title. Neither biomedical terminology nor an academic master's
  establishes clinical licensing.
- Indiana University Indianapolis: Master of Science in Dentistry (M.S.D.),
  a combined master's and clinical certificate. Admissions require prior dental
  education accepted by the school, GPA, English proficiency and major-specific
  review. The clinical certificate is not independently offered. Do not list
  specialties as additional master's degrees or substitute a DDS/DMD for a master's.

No associate biology or lower-level dentistry match was added without suitable
same-field, same-level evidence. Dental hygiene/assisting are not dentistry matches.
There are no rankings, equivalency scores or government API dependencies.

The initial live check confirmed 20 of 25 distinct URLs. All four UAF URLs and
the IU dentistry URL were unconfirmed by the workspace's direct HTTP client;
an independent curl check reported certificate-chain validation failures for
both hosts. Their award-page contents were successfully retrieved and reviewed
through the research fetch service. Keep these five live-check findings visible;
do not disable TLS verification or call the links broken based on these failures.

## Repeatable stale-link review

Run `pnpm --filter @workspace/education review:programs` from the workspace root.
It checks every distinct program and source URL with a bounded GET and flags reviews
180 days old, malformed dates and future review dates. Normal unit tests use
mocked network responses; only this explicit command makes live requests.
The legacy `catalog.live.test.ts` is also live only when explicitly enabled with
`PROGRAM_LINK_REVIEW=1`; it is skipped by ordinary `pnpm test` runs.

### Scheduled maintainer check

`.github/workflows/program-directory-review.yml` runs the same command every
Monday at 13:00 UTC, separately from unit tests and the deployment workflow.
After this change is merged into the default branch, GitHub Actions can run the
schedule; maintainers can also use **Actions → Review official program sources →
Run workflow** to trigger it manually. Scheduled runs use the default branch and
may be delayed by GitHub. Check that Actions and scheduled workflows are enabled
in the repository; this does not publish the website.

Each completed check writes `generated-artifacts/program-review/summary.md` and
`report.json` (ignored by Git and deployments). The Actions run summary shows
flagged program IDs, titles, institutions, original/final URLs, HTTP status or
network/TLS diagnostic, last human review dates and next actions. The downloadable
`official-program-source-review` artifact contains all results, including successful
URLs, and is retained for 30 days. Local runs print the report and its location.
Requests use four concurrent workers and a 15-second timeout per URL.

Exit code 0 means no findings; exit code 1 means at least one link or editorial date
needs attention, **not** that a program is invalid. The workflow uploads reports
even when findings fail the check. If setup fails before a report is produced,
the run summary points to the logs and explicitly leaves status unknown. Maintainers
should inspect failed runs and configure their GitHub Actions failure notifications
if they want alerts; this workflow does not create issues or send email itself.
It needs read-only repository permissions and no API keys.

Strict TLS verification stays enabled. Known UAF/IU certificate-chain failures are
not suppressed or allowlisted: they remain visible as unconfirmed findings with
the diagnostic code, and can fail a run until verified from a trusted environment.
The command refuses `NODE_TLS_REJECT_UNAUTHORIZED=0`.

- `reachable`: HTTP success only; still inspect the award title and requirements.
- `redirected`: inspect the final URL for a moved award, homepage or unrelated page.
- `broken`: HTTP 404/410; investigate removal or a replacement official URL.
- `unconfirmed`: timeout, access denial, throttling or other failure. Retry or open
  manually; do not infer closure or remove an institution from this result alone.

All non-reachable outcomes fail the maintainer check for attention, not as a
determination that the program is invalid. Soft-404 and changed content can return
HTTP 200, so manual content review remains necessary. Review both English and Spanish
caveats after changes, including international admissions, licensing and exact award
level. Update only the reviewed record's `checkedAt`; successful HTTP checks never
refresh editorial dates automatically. If records reviewed together later diverge,
split their shared date rather than re-dating unchecked records.
