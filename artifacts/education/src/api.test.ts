// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { isUnavailableResponse, apiSaveContacted, apiFetchContacted, apiSignin, apiSignup } from './api';

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

describe('apiSignin — cross-device profile prefill', () => {
  const jsonResponse = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

  beforeEach(() => localStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  it('returns the full profile when the server user has all fields set', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      jsonResponse(200, {
        user: { country: 'India', institution: 'IIT Delhi', degree: 'B.Tech', field: 'Computer Science', purpose: 'Employment & HR' },
        token: 'tok-alice',
      }),
    );

    const result = await apiSignin('alice', 'pw');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.profile).toEqual({
        country: 'India',
        institution: 'IIT Delhi',
        degree: 'B.Tech',
        field: 'Computer Science',
        purpose: 'Employment & HR',
      });
    }
  });

  it('returns partial profile when only some fields are filled on the server', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      jsonResponse(200, {
        user: { country: 'Nigeria', institution: null, degree: null, field: null, purpose: 'Professional Licensing' },
        token: 'tok-bob',
      }),
    );

    const result = await apiSignin('bob', 'pw');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.profile).toEqual({ country: 'Nigeria', purpose: 'Professional Licensing' });
    }
  });

  it('returns no profile when the server user has no profile fields', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      jsonResponse(200, { user: {}, token: 'tok-carol' }),
    );

    const result = await apiSignin('carol', 'pw');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.profile).toBeUndefined();
    }
  });

  it('omits fields that are empty strings on the server', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      jsonResponse(200, {
        user: { country: 'Brazil', institution: '', degree: '', field: '', purpose: '' },
        token: 'tok-dave',
      }),
    );

    const result = await apiSignin('dave', 'pw');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.profile).toEqual({ country: 'Brazil' });
    }
  });
});

describe('apiSignup — profile forwarding (country + goal)', () => {
  const jsonResponse = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

  beforeEach(() => localStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  it('sends country and purpose nested under a profile key in the request body', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      jsonResponse(201, { user: {}, token: 'tok-alice' }),
    );

    await apiSignup('alice', 'alice@example.com', 'pw', { country: 'Nigeria', purpose: 'Employment & HR' });

    const body = JSON.parse((fetchSpy.mock.calls[0]![1] as RequestInit).body as string) as Record<string, unknown>;
    expect((body.profile as Record<string, string>).country).toBe('Nigeria');
    expect((body.profile as Record<string, string>).purpose).toBe('Employment & HR');
  });

  it('omits the profile key entirely when no profile object is passed', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      jsonResponse(201, { user: {}, token: 'tok-bob' }),
    );

    await apiSignup('bob', 'bob@example.com', 'pw');

    const body = JSON.parse((fetchSpy.mock.calls[0]![1] as RequestInit).body as string) as Record<string, unknown>;
    expect(body.profile).toBeUndefined();
  });

  it('returns ok:true and stores the auth token on success', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      jsonResponse(201, { user: {}, token: 'tok-carol' }),
    );

    const result = await apiSignup('carol', 'carol@example.com', 'pw', { country: 'Brazil' });

    expect(result.ok).toBe(true);
    // Token must be saved for the username (case-insensitive key)
    expect(localStorage.getItem('ge_auth_token_carol')).toBe('tok-carol');
  });

  it('returns ok:false with username_taken when the server responds 409', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      jsonResponse(409, { error: 'username_taken' }),
    );

    const result = await apiSignup('alice', 'alice@example.com', 'pw', { country: 'India' });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('username_taken');
  });
});
