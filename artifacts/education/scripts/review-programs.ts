import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { PROGRAMS } from '../src/programs/catalog.ts';
import { buildProgramReviewReport, renderProgramReviewSummary } from '../src/programs/catalogReviewReport.ts';
import { ADMISSIONS_CONTACTS } from '../src/programs/accountEmail.ts';
import { buildContactReviewReport, renderContactReviewSummary } from '../src/programs/contactReview.ts';

// A separate maintainer command, never executed in visitor browsers.
// Tests can isolate real report writes without changing the scheduled output path.
const outputFlag = process.argv.indexOf('--output-dir');
if (outputFlag !== -1 && !process.argv[outputFlag + 1]) {
  throw new Error('--output-dir requires a directory');
}
const directory = outputFlag === -1
  ? new URL('../../../generated-artifacts/program-review/', import.meta.url)
  : pathToFileURL(resolve(process.argv[outputFlag + 1]) + sep);
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
