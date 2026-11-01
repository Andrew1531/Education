import { mkdir, writeFile } from 'node:fs/promises';
import { PROGRAMS } from '../src/programs/catalog.ts';
import { reviewLink, reviewDue } from '../src/programs/catalogReview.ts';

// A separate maintainer command: never executed in visitor browsers or unit tests.
const directory = new URL('../../../generated-artifacts/program-review/', import.meta.url);
const urls = [...new Set(PROGRAMS.flatMap(p => [p.url, p.sourceUrl]))];
const reviews = new Map();
let cursor = 0;
await Promise.all(Array.from({ length: Math.min(4, urls.length) }, async () => {
  while (cursor < urls.length) {
    const url = urls[cursor++];
    reviews.set(url, await reviewLink(url));
  }
}));
const now = new Date();
const records = PROGRAMS.map(p => ({
  id: p.id, program: p.name, institution: p.institution, checkedAt: p.checkedAt,
  editorialReviewDue: reviewDue(p.checkedAt, now),
  links: [...new Set([p.url, p.sourceUrl])].map(url => reviews.get(url)),
}));
const flagged = records.filter(p => p.editorialReviewDue || p.links.some(r => r.result !== 'reachable'));
const lines = [
  '# Official program source review',
  `Checked: ${now.toISOString()}. Programs: ${records.length}. Need review: ${flagged.length}.`,
  '',
  'Reachability is not a check of accreditation, admissions eligibility or unchanged program requirements.',
  'This check does not delete entries or change editorial review dates.',
  'UAF and Indiana University sources have previously had certificate-chain failures in some environments. Network/TLS failures are unconfirmed, not proof a program closed. Never disable TLS verification.',
  '',
  ...flagged.flatMap(p => [
    `## ${p.id} — ${p.institution}`,
    `Last human review: ${p.checkedAt}${p.editorialReviewDue ? ' — OVERDUE: read the official award requirements and caveats before updating this date.' : ''}`,
    ...p.links.map(r => `- ${r.result.toUpperCase()}: ${r.url}${r.status ? ` (HTTP ${r.status})` : ''}${r.diagnostic ? ` — ${r.diagnostic}` : ''}${r.finalUrl && r.finalUrl !== r.url ? ` → ${r.finalUrl}` : ''}`),
    'Action: confirm broken URLs on the official site; review redirects before replacing URLs; retry throttled/TLS/network failures from a trusted environment. Do not remove a record solely because this check failed.',
    '',
  ]),
];
await mkdir(directory, { recursive: true });
await writeFile(new URL('report.json', directory), JSON.stringify({ checkedAt: now.toISOString(), records }, null, 2));
await writeFile(new URL('summary.md', directory), lines.join('\n'));
console.log(lines.slice(0, 3).join('\n'));
process.exitCode = flagged.length ? 1 : 0;
