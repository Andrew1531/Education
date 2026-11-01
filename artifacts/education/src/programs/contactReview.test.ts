import { describe, expect, it, vi } from 'vitest';
import { ADMISSIONS_CONTACTS } from './accountEmail';
import { buildContactReviewReport, renderContactReviewSummary, sourceListsMailbox } from './contactReview';

const now = new Date('2026-11-01T00:00:00Z');
const contact = Object.freeze({ recipient: 'admissions@example.edu', sourceUrl: 'https://example.edu/contact', checkedAt: '2026-11-01' });
const page = (body: string, status = 200, type = 'text/html') => new Response(body, { status, headers: { 'content-type': type } });

describe('admissions source review (mocked HTTP only)', () => {
  it.each([
    'Contact ADMISSIONS@example.edu today',
    '<a href="mailto:admissions@example.edu?subject=Hello">Email</a>',
    '<a href="mailto:admissions%40example.edu">Email</a>',
    'admissions&#64;example&#x2e;edu',
    'admissions&commat;example&period;edu',
  ])('matches published mailbox: %s', html => {
    expect(sourceListsMailbox(html, contact.recipient)).toBe(true);
  });

  it.each(['notadmissions@example.edu', 'admissions@example.edu.evil.com', 'admissions+other@example.edu', 'someone@example.edu'])(
    'does not accept a different mailbox: %s', html => expect(sourceListsMailbox(html, contact.recipient)).toBe(false),
  );

  it('checks every real registry entry, deduplicates sources, and never edits dates or recipients', async () => {
    const before = JSON.stringify(ADMISSIONS_CONTACTS);
    const fetcher = vi.fn(async () => page(Object.values(ADMISSIONS_CONTACTS).map(c => c.recipient).join(' ')));
    const report = await buildContactReviewReport(ADMISSIONS_CONTACTS, now, fetcher);
    expect(report.records).toHaveLength(Object.keys(ADMISSIONS_CONTACTS).length);
    expect(fetcher).toHaveBeenCalledTimes(new Set(Object.values(ADMISSIONS_CONTACTS).map(c => c.sourceUrl)).size);
    expect(report.needsReview).toBe(0);
    expect(JSON.stringify(ADMISSIONS_CONTACTS)).toBe(before);
    expect(fetcher).toHaveBeenCalledWith(expect.stringMatching(/^https:/), { redirect: 'follow', signal: expect.any(AbortSignal) });
  });

  it('flags a missing mailbox independently of overdue, malformed and future review dates', async () => {
    const contacts = Object.fromEntries(['2026-05-05', '2026-05-06', 'bad', '2026-02-30', '2026-11-02'].map((checkedAt, i) =>
      [`contact-${i}`, { ...contact, checkedAt }]));
    const report = await buildContactReviewReport(contacts, now, vi.fn(async () => page('No email address here')));
    expect(report.records.map(r => r.editorialReviewDue)).toEqual([true, false, true, true, true]);
    expect(report.records.every(r => r.result === 'missing')).toBe(true);
    expect(report.needsReview).toBe(5);
    const present = await buildContactReviewReport({ old: { ...contact, checkedAt: 'bad' } }, now, vi.fn(async () => page(contact.recipient)));
    expect(present.needsReview).toBe(1);
    expect(present.records[0].result).toBe('present');
  });

  it.each([403, 404, 410, 429, 500])('leaves HTTP %s unconfirmed, never missing', async status => {
    const report = await buildContactReviewReport({ contact }, now, vi.fn(async () => page('Error', status)));
    expect(report.records[0]).toMatchObject({ result: 'unconfirmed', status });
    expect(report.needsReview).toBe(1);
  });

  it.each(['UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'UNABLE_TO_GET_ISSUER_CERT_LOCALLY', 'ETIMEDOUT'])(
    'preserves network/TLS diagnostic %s as unconfirmed', async code => {
      const report = await buildContactReviewReport({ contact }, now,
        vi.fn().mockRejectedValue(new TypeError('fetch failed', { cause: { code } })));
      expect(report.records[0]).toMatchObject({ result: 'unconfirmed', diagnostic: code });
    },
  );

  it('leaves redirects, challenges, empty, oversized and unsupported responses unconfirmed', async () => {
    const redirect = page(contact.recipient);
    Object.defineProperties(redirect, { redirected: { value: true }, url: { value: 'https://other.edu/' } });
    for (const response of [redirect, page('Verify you are human'), page(''), page('x'.repeat(2_000_001)), page(contact.recipient, 200, 'application/pdf')]) {
      const report = await buildContactReviewReport({ contact }, now, vi.fn(async () => response));
      expect(report.records[0].result).toBe('unconfirmed');
    }
  });

  it('handles a body read failure as unconfirmed', async () => {
    const response = new Response(new ReadableStream({ start(controller) { controller.error(new Error('read failed')); } }), {
      headers: { 'content-type': 'text/html' },
    });
    const report = await buildContactReviewReport({ contact }, now, vi.fn(async () => response));
    expect(report.records[0].result).toBe('unconfirmed');
  });

  it('bounds concurrency at four and rejects non-HTTPS sources without fetching', async () => {
    let active = 0, peak = 0;
    const contacts = Object.fromEntries(Array.from({ length: 9 }, (_, i) => [String(i), { ...contact, sourceUrl: `https://example.edu/${i}` }]));
    await buildContactReviewReport(contacts, now, vi.fn(async () => {
      peak = Math.max(peak, ++active);
      await new Promise(resolve => setTimeout(resolve, 1));
      active--;
      return page(contact.recipient);
    }));
    expect(peak).toBe(4);
    const fetcher = vi.fn();
    const report = await buildContactReviewReport({ contact: { ...contact, sourceUrl: 'http://example.edu' } }, now, fetcher);
    expect(fetcher).not.toHaveBeenCalled();
    expect(report.records[0].result).toBe('unconfirmed');
  });

  it('reports human actions and escapes source text while keeping JSON intact', async () => {
    const report = await buildContactReviewReport({ '<script>': { ...contact, checkedAt: 'bad' } }, now, vi.fn(async () => page('Missing')));
    const summary = renderContactReviewSummary(report);
    for (const phrase of ['MISSING', '180-day', 'Last human review: bad', contact.recipient, contact.sourceUrl,
      'No email is sent', 'Never disable TLS', 'Human action', '&lt;script&gt;']) expect(summary).toContain(phrase);
    expect(report.records[0].id).toBe('<script>');
  });
});
