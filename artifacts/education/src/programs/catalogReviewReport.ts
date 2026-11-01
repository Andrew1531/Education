import type { ProgramRecord } from './catalog.ts';
import { REVIEW_INTERVAL_DAYS, reviewDue, reviewLink } from './catalogReview.ts';
import type { LinkReview } from './catalogReview.ts';

export interface ProgramReviewRecord {
  id: string;
  program: string;
  institution: string;
  checkedAt: string;
  editorialReviewDue: boolean;
  links: LinkReview[];
}

export interface ProgramReviewReport {
  checkedAt: string;
  distinctUrls: number;
  needsReview: number;
  records: ProgramReviewRecord[];
}

/** Deduplicate sources and bound requests; never mutate the editorial catalog. */
export async function buildProgramReviewReport(
  programs: readonly ProgramRecord[],
  now = new Date(),
  checkLink: (url: string) => Promise<LinkReview> = reviewLink,
): Promise<ProgramReviewReport> {
  const urls = [...new Set(programs.flatMap(p => [p.url, p.sourceUrl]))];
  const reviews = new Map<string, LinkReview>();
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(4, urls.length) }, async () => {
    while (cursor < urls.length) {
      const url = urls[cursor++];
      reviews.set(url, await checkLink(url));
    }
  }));
  const records = programs.map(p => ({
    id: p.id, program: p.title, institution: p.institution, checkedAt: p.checkedAt,
    editorialReviewDue: reviewDue(p.checkedAt, now),
    links: [...new Set([p.url, p.sourceUrl])].map(url => reviews.get(url)!),
  }));
  return {
    checkedAt: now.toISOString(), distinctUrls: urls.length,
    needsReview: records.filter(needsAttention).length, records,
  };
}

function needsAttention(record: ProgramReviewRecord): boolean {
  return record.editorialReviewDue || record.links.some(r => r.result !== 'reachable');
}

// Prevent catalog text or diagnostic strings from injecting Markdown/HTML into CI summaries.
function text(value: string): string {
  return value.replace(/[\r\n]+/g, ' ').replace(/&/g, '&amp;')
    .replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/[\\`*_[\]|]/g, '\\$&');
}

export function renderProgramReviewSummary(report: ProgramReviewReport): string {
  const counts = { reachable: 0, redirected: 0, broken: 0, unconfirmed: 0 };
  for (const link of new Map(report.records.flatMap(p => p.links.map(r => [r.url, r] as const))).values()) {
    counts[link.result]++;
  }
  return [
    '# Official program source review',
    `Checked: ${report.checkedAt}. Programs: ${report.records.length}. Distinct URLs: ${report.distinctUrls}. Need review: ${report.needsReview}.`,
    `Links: ${counts.reachable} reachable; ${counts.redirected} redirected; ${counts.broken} broken; ${counts.unconfirmed} unconfirmed.`,
    '',
    'Reachability is not a check of accreditation, admissions eligibility or unchanged program requirements.',
    'This check does not delete entries or change editorial review dates.',
    'UAF and Indiana University sources have previously had certificate-chain failures in some environments. Network/TLS failures are UNCONFIRMED, not proof a program closed. Never disable TLS verification.',
    'Edit records in artifacts/education/src/programs/catalog.ts only after human review; see artifacts/education/src/programs/REVIEW.md.',
    '',
    ...(report.needsReview ? [] : ['No findings requiring attention. Human content review is still required on the editorial schedule.', '']),
    ...report.records.filter(needsAttention).flatMap(p => [
      `## ${text(p.id)} — ${text(p.program)}`,
      `Institution: ${text(p.institution)}`,
      `Last human review: ${text(p.checkedAt)}${p.editorialReviewDue ? ` — EDITORIAL REVIEW REQUIRED: ${REVIEW_INTERVAL_DAYS}-day limit reached, invalid date or future date. Read official award requirements and both language caveats before updating this date.` : ''}`,
      ...p.links.map(r => `- ${r.result.toUpperCase()}: ${text(r.url)}${r.status ? ` (HTTP ${r.status})` : ''}${r.diagnostic ? ` — ${text(r.diagnostic)}` : ''}${r.finalUrl && r.finalUrl !== r.url ? ` → ${text(r.finalUrl)}` : ''}`),
      'Action: confirm broken URLs on the official site; inspect redirect destinations for a moved award, homepage or unrelated page before replacing URLs; retry throttled/TLS/network failures or open manually from a trusted environment. Do not remove a record solely because this check failed.',
      '',
    ]),
  ].join('\n');
}
