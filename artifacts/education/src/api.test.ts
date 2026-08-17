// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { isUnavailableResponse, apiSaveContacted, apiFetchContacted, apiSignin } from './api';

function fakeRes(status: number, contentType: string | null) {
  return { status, headers: { get: (n: string) => (n.toLowerCase() === 'content-type' ? contentType : null) } };
}

describe('isUnavailableResponse', () => {
  it('treats an HTML 404 (GitHub Pages SPA fallback) as backend-unavailable', () => {
    expect(isUnavailableResponse(fakeRes(404, 'text/html; charset=utf-8'))).toBe(true);
  });

  it('treats any non-JSON error (gateway, cold start, rate limit) as backend-unavailable', () => {
    expect(isUnavailableResponse(fakeRes(502, 'text/html'))).toBe(true);
    expect(isUnavailableResponse(fakeRes(503, null))).toBe(true);
    expect(isUnavailableResponse(fakeRes(504, 'text/plain'))).toBe(true);
    expect(isUnavailableResponse(fakeRes(500, 'text/html'))).toBe(true);
  });

  it('never treats deliberate rejections as outages, even without JSON', () => {
    expect(isUnavailableResponse(fakeRes(401, 'text/html'))).toBe(false);
    expect(isUnavailableResponse(fakeRes(403, 'text/html'))).toBe(false);
    expect(isUnavailableResponse(fakeRes(429, 'text/html'))).toBe(false);
  });

  it('keeps real API responses, including JSON 404s and auth failures', () => {
    expect(isUnavailableResponse(fakeRes(404, 'application/json'))).toBe(false);
    expect(isUnavailableResponse(fakeRes(401, 'application/json'))).toBe(false);
    expect(isUnavailableResponse(fakeRes(409, 'application/json'))).toBe(false);
    expect(isUnavailableResponse(fakeRes(400, 'application/json'))).toBe(false);
    expect(isUnavailableResponse(fakeRes(200, 'application/json'))).toBe(false);
    expect(isUnavailableResponse(fakeRes(200, 'text/html'))).toBe(false);
  });
});

describe('contacted-agency sync auth', () => {
  const jsonResponse = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

  beforeEach(() => localStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  it('does not call the backend without an auth token', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    await apiSaveContacted('alice', { WES: '2026-08-17' });
    expect(await apiFetchContacted('alice')).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('stores the token from sign-in and sends it with contacted requests', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse(200, { user: {}, token: 'tok-alice' }))
      .mockResolvedValueOnce(jsonResponse(200, { ok: true }))
      .mockResolvedValueOnce(jsonResponse(200, { contacted: { WES: '2026-08-17' } }));

    expect(await apiSignin('Alice', 'pw')).toEqual({ ok: true });
    await apiSaveContacted('Alice', { WES: '2026-08-17' });
    expect(await apiFetchContacted('Alice')).toEqual({ WES: '2026-08-17' });

    const saveHeaders = (fetchSpy.mock.calls[1]![1] as RequestInit).headers as Record<string, string>;
    const fetchHeaders = (fetchSpy.mock.calls[2]![1] as RequestInit).headers as Record<string, string>;
    expect(saveHeaders['x-auth-token']).toBe('tok-alice');
    expect(fetchHeaders['x-auth-token']).toBe('tok-alice');
  });

  it('returns null when the server rejects the token (another account)', async () => {
    localStorage.setItem('ge_auth_token_bob', 'tok-bob');
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse(401, { error: 'unauthorized' }));
    expect(await apiFetchContacted('bob')).toBeNull();
  });
});
