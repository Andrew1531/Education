import { describe, it, expect, vi } from 'vitest';
import { PROGRAMS } from './catalog';
import { buildProgramReviewReport, renderProgramReviewSummary } from './catalogReviewReport';
import type { LinkReview } from './catalogReview';

const now = new Date('2026-11-01T00:00:00Z');
const reachable = async (url: string): Promise<LinkReview> => ({ url, status: 200, result: 'reachable' });

describe('maintainer report (no live requests)', () => {
  it('deduplicates links, keeps titles and leaves records and dates unchanged', async () => {
    const record = Object.freeze({ ...PROGRAMS[0], checkedAt: '2026-10-31' });
    const before = JSON.stringify(record);
    const check = vi.fn(reachable);
    const report = await buildProgramReviewReport([record, { ...record, id: 'other' }], now, check);
    expect(check).toHaveBeenCalledTimes(new Set([record.url, record.sourceUrl]).size);
    expect(report.records[0].program).toBe(record.title);
    expect(report.needsReview).toBe(0);
    expect(renderProgramReviewSummary(report)).toContain('No findings requiring attention');
    expect(JSON.stringify(record)).toBe(before);
  });

  it('reports broken URLs, redirects, overdue dates and unconfirmed TLS with actions', async () => {
    const results: LinkReview[] = [
      { url: 'https://example.edu/missing', status: 404, result: 'broken' },
      { url: 'https://example.edu/moved', finalUrl: 'https://example.edu/new', status: 200, result: 'redirected' },
      { url: 'https://catalog.uaf.edu/award', result: 'unconfirmed', diagnostic: 'UNABLE_TO_VERIFY_LEAF_SIGNATURE' },
      { url: 'https://dentistry.iu.edu/award', result: 'unconfirmed', diagnostic: 'UNABLE_TO_GET_ISSUER_CERT_LOCALLY' },
      { url: 'https://example.edu/ok', status: 200, result: 'reachable' },
    ];
    const programs = results.map((r, i) => ({
      ...PROGRAMS[0], id: `record-${i}`, url: r.url, sourceUrl: r.url,
      checkedAt: i === 4 ? '2025-01-01' : '2026-10-31',
    }));
    const report = await buildProgramReviewReport(programs, now, async url => results.find(r => r.url === url)!);
    expect(report.needsReview).toBe(5);
    const summary = renderProgramReviewSummary(report);
    for (const phrase of ['BROKEN', 'HTTP 404', 'REDIRECTED', 'https://example.edu/new',
      'UNCONFIRMED', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'UNABLE_TO_GET_ISSUER_CERT_LOCALLY',
      '2025-01-01', '180-day', 'Last human review', 'Do not remove', 'Never disable TLS']) {
      expect(summary).toContain(phrase.replaceAll('_', '\\_'));
    }
    expect(report.records[4].editorialReviewDue).toBe(true);
  });

  it('flags malformed and future dates even when links are reachable', async () => {
    const programs = ['2026-02-30', 'bad', '2026-11-02'].map((checkedAt, i) => ({
      ...PROGRAMS[0], checkedAt, id: `date-${i}`,
    }));
    const report = await buildProgramReviewReport(programs, now, reachable);
    expect(report.needsReview).toBe(3);
    expect(report.records.every(p => p.editorialReviewDue)).toBe(true);
    for (const p of programs) expect(renderProgramReviewSummary(report)).toContain(p.checkedAt);
  });

  it('escapes catalog text in Markdown summaries without changing JSON', async () => {
    const title = '<img src=x> [title]';
    const report = await buildProgramReviewReport([{ ...PROGRAMS[0], title, checkedAt: 'bad' }], now, reachable);
    expect(report.records[0].program).toBe(title);
    expect(renderProgramReviewSummary(report)).toContain('&lt;img src=x&gt; \\[title\\]');
  });

  it('bounds concurrent URL checks to four', async () => {
    let active = 0;
    let peak = 0;
    const programs = Array.from({ length: 9 }, (_, i) => ({
      ...PROGRAMS[0], url: `https://example.edu/${i}`, sourceUrl: `https://example.edu/${i}`,
    }));
    const report = await buildProgramReviewReport(programs, now, async url => {
      active++;
      peak = Math.max(peak, active);
      await new Promise(resolve => setTimeout(resolve, 1));
      active--;
      return reachable(url);
    });
    expect(peak).toBe(4);
    expect(report.distinctUrls).toBe(9);
  });
});
