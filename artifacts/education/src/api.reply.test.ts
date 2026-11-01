// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiReviewSchoolContacts, apiSchoolReplyVerification, apiSendReviewedSchoolOutreach } from './api';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { 'content-type': 'application/json' },
});
beforeEach(() => { localStorage.clear(); localStorage.setItem('ge_auth_token_owner', 'owner-token'); });
afterEach(() => vi.restoreAllMocks());

describe('school reply API contract', () => {
  it('sends opt-in for review, preserves the signed address, and binds consent to that exact address', async () => {
    const preview = { text: 'Exact package', token: 'signed', expiresAt: Date.now() + 1000, replyTo: 'owner@example.org' };
    const fetch = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(json({ contacts: [], preview }))
      .mockResolvedValueOnce(json({ results: [] }));
    const review = await apiReviewSchoolContacts('owner', ['123'], true);
    expect(review.preview).toEqual(preview);
    expect(JSON.parse(fetch.mock.calls[0][1]!.body as string).includeReplyAddress).toBe(true);
    await apiSendReviewedSchoolOutreach('owner', 'request-id', [{ schoolId: '123', email: 'admissions@example.edu' }], true, review.preview);
    expect(JSON.parse(fetch.mock.calls[1][1]!.body as string)).toMatchObject({ preview, replyConsent: 'owner@example.org' });
  });
  it('does not send address consent when opting out or when consent is false', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => json({ results: [] }));
    await apiSendReviewedSchoolOutreach('owner', 'request-id', [], true, { text: 'No reply', token: 'signed', expiresAt: 10, replyTo: null });
    expect(JSON.parse(fetch.mock.calls[0][1]!.body as string)).not.toHaveProperty('replyConsent');
    await apiSendReviewedSchoolOutreach('owner', 'request-id', [], false, { text: 'Reply', token: 'signed', expiresAt: 10, replyTo: 'owner@example.org' });
    expect(JSON.parse(fetch.mock.calls[1][1]!.body as string)).not.toHaveProperty('replyConsent');
  });
  it('uses authenticated account verification and does not pass a client-selected email', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(json({ email: 'owner@example.org', verified: true }));
    await apiSchoolReplyVerification('owner', 'confirm', '123456');
    expect(fetch.mock.calls[0][0]).toBe('/api/auth/school-reply-verification');
    expect(JSON.parse(fetch.mock.calls[0][1]!.body as string)).toEqual({ username: 'owner', action: 'confirm', code: '123456' });
    expect(fetch.mock.calls[0][1]!.headers).toMatchObject({ 'x-auth-token': 'owner-token' });
  });
  it('fails closed on static-hosting HTML responses or missing account authentication', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response('<html>Static host</html>', {
      status: 404, headers: { 'content-type': 'text/html' },
    }));
    await expect(apiSchoolReplyVerification('owner', 'request')).rejects.toThrow();
    localStorage.clear();
    fetch.mockClear();
    await expect(apiSchoolReplyVerification('owner', 'request')).rejects.toThrow('Not authenticated');
    await expect(apiSendReviewedSchoolOutreach('owner', 'request-id', [], true)).rejects.toThrow('Not authenticated');
    expect(fetch).not.toHaveBeenCalled();
  });
});
