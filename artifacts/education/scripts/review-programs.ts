import { mkdir, writeFile } from 'node:fs/promises';
import { PROGRAMS } from '../src/programs/catalog.ts';
import { buildProgramReviewReport, renderProgramReviewSummary } from '../src/programs/catalogReviewReport.ts';
import { ADMISSIONS_CONTACTS } from '../src/programs/accountEmail.ts';
import { buildContactReviewReport, renderContactReviewSummary } from '../src/programs/contactReview.ts';

// A separate maintainer command: never executed in visitor browsers or unit tests.
const directory = new URL('../../../generated-artifacts/program-review/', import.meta.url);
if (process.env.NODE_TLS_REJECT_UNAUTHORIZED === '0') {
  throw new Error('Program review requires TLS verification. Remove NODE_TLS_REJECT_UNAUTHORIZED=0.');
}
const report = await buildProgramReviewReport(PROGRAMS);
const contacts = await buildContactReviewReport(ADMISSIONS_CONTACTS);
const summary = `${renderProgramReviewSummary(report)}\n\n${renderContactReviewSummary(contacts)}`;
await mkdir(directory, { recursive: true });
await writeFile(new URL('report.json', directory), JSON.stringify({ ...report, contacts }, null, 2));
await writeFile(new URL('summary.md', directory), summary);
console.log(summary);
console.log(`Reports: ${directory.pathname}`);
process.exitCode = report.needsReview || contacts.needsReview ? 1 : 0;
