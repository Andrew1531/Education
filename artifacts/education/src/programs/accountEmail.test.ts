import { describe, expect, it } from 'vitest';
import type { Opportunity } from '../api';
import { accountEmailDrafts, emailComposeUrl, validAccountEmail } from './accountEmail';

const saved = (id: string) => ({ id, kind: 'school' } as Opportunity);
const profile = { degree: 'Licenciatura', institution: 'Example University', country: 'Ecuador', field: 'Accounting' };

describe('Direct account-mail correspondence', () => {
  it('uses sourced undergraduate and graduate contacts separately, not saved arbitrary recipient data', () => {
    const drafts = accountEmailDrafts([saved('wsu-cs-bs'), saved('wsu-business-bba'), saved('wsu-cs-ms')], profile, false);
    expect(drafts).toHaveLength(2);
    expect(drafts[0].recipient).toBe('admissions@wichita.edu');
    expect(drafts[0].programs).toHaveLength(2);
    expect(drafts[1].recipient).toBe('wsugradschool@wichita.edu');
    expect(drafts.every(d => d.sourceUrl.startsWith('https://www.wichita.edu/'))).toBe(true);
  });
  it('preserves honest contact-page-only paths and skips unsourced legacy records', () => {
    const drafts = accountEmailDrafts([saved('umgc-cs-bs'), { ...saved('not-a-sourced-id'), url: 'https://attacker.example' }], profile, false);
    expect(drafts).toHaveLength(1);
    expect(drafts[0].recipient).toBeNull();
    expect(drafts[0].sourceUrl).toBe('https://www.umgc.edu/admission/request-information');
    expect(emailComposeUrl('gmail', 'owner@example.com', drafts[0])).toBeNull();
  });
  it('includes only the reviewed active education and does not claim an official equivalency', () => {
    const [draft] = accountEmailDrafts([saved('uaf-accounting-cert')], profile, false);
    expect(draft.body).toContain('Original award name: Licenciatura');
    expect(draft.body).toContain('not an official U.S. equivalency');
    expect(draft.body).toContain('Please reply directly to the email address I am sending');
    expect(draft.body).not.toMatch(/api.key|password|Reply-To:/i);
  });
  it('builds encoded compose-only URLs without pretending to send, or spoofing a From/Reply-To header', () => {
    const [draft] = accountEmailDrafts([saved('uaf-accounting-cert')], profile, false);
    for (const provider of ['gmail', 'outlook'] as const) {
      const url = new URL(emailComposeUrl(provider, 'owner+school@example.com', draft)!);
      expect(url.protocol).toBe('https:');
      expect(url.searchParams.get('to')).toBe('uaf-admissions@alaska.edu');
      expect(url.searchParams.get('body')).toBe(draft.body);
      expect(url.searchParams.has('from')).toBe(false);
      expect(url.searchParams.has('reply_to')).toBe(false);
      if (provider === 'gmail') expect(url.searchParams.get('authuser')).toBe('owner+school@example.com');
    }
  });
  it('rejects missing addresses and injected mail headers', () => {
    expect(validAccountEmail('')).toBe(false);
    expect(validAccountEmail('owner@example.com\r\nBcc: other@example.org')).toBe(false);
    const [draft] = accountEmailDrafts([saved('wsu-cs-bs')], profile, false);
    expect(emailComposeUrl('gmail', '', draft)).toBeNull();
  });
  it('supports Spanish without altering the self-reported original award name', () => {
    const [draft] = accountEmailDrafts([saved('uafs-engineering-as')], profile, true);
    expect(draft.recipient).toBe('admissions@uafs.edu');
    expect(draft.body).toContain('Nombre original del título: Licenciatura');
    expect(draft.body).toContain('no constituyen una equivalencia oficial');
    expect(draft.subject).toContain('Consulta de admisión');
  });
});
