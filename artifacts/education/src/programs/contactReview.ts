import { REVIEW_INTERVAL_DAYS, reviewDue } from './catalogReview.ts';

interface Contact {
  recipient: string;
  sourceUrl: string;
  checkedAt: string;
}
interface Source {
  url: string;
  finalUrl?: string;
  status?: number;
  content?: string;
  diagnostic?: string;
}
export interface ContactReviewRecord extends Contact {
  id: string;
  editorialReviewDue: boolean;
  result: 'present' | 'missing' | 'unconfirmed';
  finalUrl?: string;
  status?: number;
  diagnostic?: string;
}
export interface ContactReviewReport {
  checkedAt: string;
  distinctUrls: number;
  needsReview: number;
  records: ContactReviewRecord[];
}

/** Source-page GETs only. Never send mail or probe SMTP, DNS or mailbox existence. */
async function readSource(url: string, fetcher: typeof fetch): Promise<Source> {
  try {
    if (new URL(url).protocol !== 'https:') return { url, diagnostic: 'HTTPS source required' };
    const response = await fetcher(url, { redirect: 'follow', signal: AbortSignal.timeout(15_000) });
    const source: Source = { url, finalUrl: response.url || url, status: response.status };
    if (!response.ok || response.redirected || !/^(text\/html|text\/plain|application\/xhtml\+xml)\b/i.test(response.headers.get('content-type') || '')) {
      await response.body?.cancel();
      return { ...source, diagnostic: response.redirected ? 'Redirect requires human source review' : 'Source unavailable or unsupported content type' };
    }
    // Bound body size as well as request duration. Never classify partial content.
    const reader = response.body?.getReader();
    if (!reader) return { ...source, diagnostic: 'Empty source response' };
    const decoder = new TextDecoder();
    let size = 0;
    let content = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 2_000_000) {
        await reader.cancel();
        return { ...source, diagnostic: 'Source exceeds 2 MB review limit' };
      }
      content += decoder.decode(value, { stream: true });
    }
    content += decoder.decode();
    if (!content.trim() || /cf-chl-|verify you are human|checking your browser|<title[^>]*>\s*(?:captcha|access denied|just a moment)/i.test(content)) {
      return { ...source, diagnostic: 'Empty page or possible access challenge' };
    }
    return { ...source, content };
  } catch (error) {
    const err = error as { name?: string; cause?: { code?: string } };
    return { url, diagnostic: err.cause?.code || err.name || 'Network request failed' };
  }
}

/** Match whole addresses, including common HTML entities and encoded mailto links. */
export function sourceListsMailbox(content: string, recipient: string): boolean {
  const decoded = content.replace(/&#(x[0-9a-f]+|\d+);?/gi, (match, value: string) => {
    const code = value[0].toLowerCase() === 'x' ? parseInt(value.slice(1), 16) : Number(value);
    return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match;
  }).replace(/&(commat|period|amp|quot|apos|lt|gt);/gi, (_, name: string) =>
    ({ commat: '@', period: '.', amp: '&', quot: '"', apos: "'", lt: '<', gt: '>' }[name.toLowerCase()]!))
    .replace(/(?:%[0-9a-f]{2})+/gi, value => {
      try { return decodeURIComponent(value); } catch { return value; }
    });
  const addresses: string[] = decoded.match(/[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)+/gi) || [];
  return addresses.some(address => address.toLowerCase() === recipient.toLowerCase());
}

const needsAttention = (record: ContactReviewRecord) => record.editorialReviewDue || record.result !== 'present';

export async function buildContactReviewReport(
  contacts: Readonly<Record<string, Contact>>, now = new Date(), fetcher: typeof fetch = fetch,
): Promise<ContactReviewReport> {
  const urls = [...new Set(Object.values(contacts).map(contact => contact.sourceUrl))];
  const sources = new Map<string, Source>();
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(4, urls.length) }, async () => {
    while (cursor < urls.length) {
      const url = urls[cursor++];
      sources.set(url, await readSource(url, fetcher));
    }
  }));
  const records = Object.entries(contacts).map(([id, contact]): ContactReviewRecord => {
    const source = sources.get(contact.sourceUrl)!;
    return {
      id, ...contact, editorialReviewDue: reviewDue(contact.checkedAt, now),
      result: source.content === undefined ? 'unconfirmed' : sourceListsMailbox(source.content, contact.recipient) ? 'present' : 'missing',
      finalUrl: source.finalUrl, status: source.status, diagnostic: source.diagnostic,
    };
  });
  return { checkedAt: now.toISOString(), distinctUrls: urls.length, needsReview: records.filter(needsAttention).length, records };
}

function text(value: string): string {
  return value.replace(/[\r\n]+/g, ' ').replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/[\\`*_[\]|]/g, '\\$&');
}

export function renderContactReviewSummary(report: ContactReviewReport): string {
  return [
    '# Admissions email source review',
    `Checked: ${report.checkedAt}. Contacts: ${report.records.length}. Distinct sources: ${report.distinctUrls}. Need review: ${report.needsReview}.`,
    'PRESENT means the listed address appears in fetched source content, not that the mailbox works or accepts applicants.',
    'MISSING means not found in fetched content; dynamic/obfuscated pages and soft errors need manual inspection. UNCONFIRMED means the source could not be reliably checked, not that an address is invalid.',
    'No email is sent. Never disable TLS. No addresses or human review dates are changed automatically.',
    'Human action: open the official source, confirm the published admissions role and exact address, and review any redirect or access failure. Only then edit the specific entry in artifacts/education/src/programs/accountEmail.ts. Never guess a replacement or refresh unchecked dates.',
    '',
    ...report.records.flatMap(record => [
      `## ${text(record.id)} — ${record.result.toUpperCase()}`,
      `Mailbox: ${text(record.recipient)}`,
      `Source: ${text(record.sourceUrl)}${record.status ? ` (HTTP ${record.status})` : ''}${record.finalUrl && record.finalUrl !== record.sourceUrl ? ` → ${text(record.finalUrl)}` : ''}`,
      `Last human review: ${text(record.checkedAt)}${record.editorialReviewDue ? ` — EDITORIAL REVIEW REQUIRED: ${REVIEW_INTERVAL_DAYS}-day limit reached, invalid date or future date.` : ''}`,
      ...(record.diagnostic ? [`Diagnostic: ${text(record.diagnostic)}`] : []),
      '',
    ]),
  ].join('\n');
}
