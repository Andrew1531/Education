import { mkdir, writeFile } from 'node:fs/promises';
import { PROGRAMS } from '../src/programs/catalog.ts';
import { buildProgramReviewReport, renderProgramReviewSummary } from '../src/programs/catalogReviewReport.ts';

// A separate maintainer command: never executed in visitor browsers or unit tests.
const directory = new URL('../../../generated-artifacts/program-review/', import.meta.url);
if (process.env.NODE_TLS_REJECT_UNAUTHORIZED === '0') {
  throw new Error('Program review requires TLS verification. Remove NODE_TLS_REJECT_UNAUTHORIZED=0.');
}
const report = await buildProgramReviewReport(PROGRAMS);
const summary = renderProgramReviewSummary(report);
await mkdir(directory, { recursive: true });
await writeFile(new URL('report.json', directory), JSON.stringify(report, null, 2));
await writeFile(new URL('summary.md', directory), summary);
console.log(summary);
console.log(`Reports: ${directory.pathname}`);
process.exitCode = report.needsReview ? 1 : 0;
