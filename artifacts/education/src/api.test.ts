// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  isUnavailableResponse,
  apiSaveContacted,
  apiFetchContacted,
  apiSaveRoadmapSteps,
  apiFetchRoadmapSteps,
  apiSignin,
  apiSignup,
  apiListUsers,
  apiUpsertSchoolOpportunity,
  apiDeleteSchoolOpportunity,
  type Opportunity,
} from './api';

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

describe('admin cold-start recovery', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  it('retries the central user list once after an infrastructure failure', async () => {
    localStorage.setItem('ge_admin_api_key', 'test-admin-key');
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
      .mockRejectedValueOnce(new TypeError('deployment is waking'))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        users: [{
          username: 'alice',
          email: 'alice@example.com',
          hasSalt: true,
          createdAt: '2026-08-17T18:06:56.596Z',
          country: 'Nigeria',
          institution: 'University of Lagos',
          degree: 'BSc',
          field: 'Computer Science',
          purpose: 'Employment & HR',
        }],
      }), { status: 200, headers: { 'Content-Type': 'application/json' } }));

    const users = await apiListUsers();

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(users).toHaveLength(1);
    expect(users[0]?.username).toBe('alice');
    const retryHeaders = (fetchSpy.mock.calls[1]![1] as RequestInit).headers as Record<string, string>;
    expect(retryHeaders['x-admin-key']).toBe('test-admin-key');
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

describe('roadmap progress sync auth', () => {
  const jsonResponse = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

  beforeEach(() => localStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  it('does not call the backend without an auth token', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    await apiSaveRoadmapSteps('alice', [true, false, true, false]);
    expect(await apiFetchRoadmapSteps('alice')).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('sends and restores roadmap state with the signed-in user token', async () => {
    localStorage.setItem('ge_auth_token_alice', 'tok-alice');
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse(200, { ok: true }))
      .mockResolvedValueOnce(jsonResponse(200, {
        roadmapSteps: [true, false, true, false],
      }));

    await apiSaveRoadmapSteps('Alice', [true, false, true, false]);
    expect(await apiFetchRoadmapSteps('Alice')).toEqual([
      true, false, true, false,
    ]);

    expect(fetchSpy.mock.calls[0]?.[0]).toBe('/api/auth/roadmap-steps');
    expect(fetchSpy.mock.calls[1]?.[0]).toBe('/api/auth/roadmap-steps?username=Alice');
    const save = fetchSpy.mock.calls[0]?.[1] as RequestInit;
    const restore = fetchSpy.mock.calls[1]?.[1] as RequestInit;
    expect(save.headers).toMatchObject({ 'x-auth-token': 'tok-alice' });
    expect(restore.headers).toMatchObject({ 'x-auth-token': 'tok-alice' });
    expect(JSON.parse(save.body as string)).toEqual({
      username: 'Alice',
      roadmapSteps: [true, false, true, false],
    });
  });

  it('does not expose progress when the server rejects the token', async () => {
    localStorage.setItem('ge_auth_token_alice', 'tok-for-another-user');
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse(401, { error: 'unauthorized' }),
    );

    expect(await apiFetchRoadmapSteps('alice')).toBeNull();
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

describe('school opportunity per-record sync', () => {
  const jsonResponse = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('ge_auth_token_alice', 'tok-alice');
  });
  afterEach(() => vi.restoreAllMocks());

  it('upserts the school at the matching atomic record URL', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(jsonResponse(200, { ok: true }));
    const opportunity: Opportunity = {
      id: '123456',
      kind: 'school',
      title: 'Public University',
      organization: 'Public University',
      location: 'Albany, NY',
      url: 'https://example.edu/',
      sourceName: 'U.S. Department of Education College Scorecard',
      sourceUrl: 'https://api.data.gov/ed/collegescorecard/v1/schools.json',
      sourceRetrievedAt: '2026-08-31T12:00:00.000Z',
      status: 'saved',
      deadline: null,
      notes: '',
      nextAction: '',
      readinessChecks: [],
      createdAt: '2026-08-31T12:00:00.000Z',
      updatedAt: '2026-08-31T12:00:00.000Z',
    };

    await apiUpsertSchoolOpportunity('Alice', opportunity);

    expect(fetchSpy.mock.calls[0]?.[0]).toBe('/api/auth/opportunities/123456');
    const request = fetchSpy.mock.calls[0]?.[1] as RequestInit;
    expect(request.method).toBe('PUT');
    expect(request.headers).toMatchObject({ 'x-auth-token': 'tok-alice' });
    expect(JSON.parse(request.body as string)).toEqual({ username: 'Alice', opportunity });
  });

  it('deletes only the requested school record', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(jsonResponse(200, { ok: true }));

    await apiDeleteSchoolOpportunity('Alice', '123456');

    expect(fetchSpy.mock.calls[0]?.[0]).toBe('/api/auth/opportunities/123456?username=Alice');
    expect((fetchSpy.mock.calls[0]?.[1] as RequestInit).method).toBe('DELETE');
  });
});
