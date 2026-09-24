// @vitest-environment jsdom
/**
 * Task #49 — Evaluator profile fields (country + goal) reach the admin board
 * when a signed-in user submits the evaluator *after* signing up.
 *
 * The code path under test:
 *   EvaluatorView.handleSubmit → apiSaveProfile → POST /auth/profile
 *
 * Verified behaviours:
 *  1. Submitting the evaluator form fires a /auth/profile request that carries
 *     the country and purpose the user typed.
 *  2. Submitting with country + goal stores them in localStorage ge_profile so
 *     the page works even when the backend is offline.
 *  3. A second submission with updated values overwrites the previous profile.
 *  4. Submitting without a signed-in user does NOT call /auth/profile (no
 *     username in localStorage → no server write).
 */
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor, act, cleanup, fireEvent } from '@testing-library/react';
import App from './App';
import { USERS_KEY } from './userStore';

// ─── Shared setup ─────────────────────────────────────────────────────────────

const VALID_USER = {
  username: 'evaluser',
  email: 'eval@example.com',
  password: 'a'.repeat(64),
  createdAt: '2026-01-01T00:00:00.000Z',
};

// HMAC-SHA256("test-session-secret", "evaluser") — matches the token the
// backend issues. Seeded so apiSaveProfile includes x-auth-token.
const EVALUSER_TOKEN = '9a4d16d057f81fbdf7ad679a6b12b916534dd22b16e23e61ec49530804cfbb5f';
const AUTH_TOKEN_KEY = `ge_auth_token_${VALID_USER.username.toLowerCase()}`;

function seedLoggedIn() {
  localStorage.setItem(USERS_KEY, JSON.stringify([VALID_USER]));
  localStorage.setItem('ge_username', VALID_USER.username);
  // Seed the per-user auth token so apiSaveProfile attaches x-auth-token.
  localStorage.setItem(AUTH_TOKEN_KEY, EVALUSER_TOKEN);
}

const jsonOk = (body: unknown) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });

beforeEach(() => {
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  // Default: backend available, accept any call.
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonOk({ ok: true })));
  if (!URL.createObjectURL) URL.createObjectURL = vi.fn().mockReturnValue('blob:mock');
  if (!URL.revokeObjectURL) URL.revokeObjectURL = vi.fn();
  localStorage.clear();
  sessionStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

// ─── Helper ───────────────────────────────────────────────────────────────────

async function submitEvaluator(opts: {
  country: string;
  institution: string;
  degree: string;
  field: string;
  purpose?: string;
}) {
  await waitFor(() => expect(screen.queryByTestId('form-eval')).not.toBeNull());
  const verification = {
    status: 'verified', message: 'corroborated', accreditationChecked: false,
    retrievedAt: '2026-01-01T00:00:00.000Z',
    selected: {
      entityId: 'Q123', name: opts.institution, description: 'university', aliases: [],
      country: opts.country, countryMatch: true, higherEducationType: 'university',
      officialWebsite: 'https://example.edu/', websiteAvailability: 'not_checked',
      closureDate: null, wikipediaUrl: null, archiveUrl: null,
      sources: [{ name: 'Wikidata', url: 'https://www.wikidata.org/wiki/Q123', retrievedAt: '2026-01-01T00:00:00.000Z' }],
    },
    candidates: [],
  };
  vi.mocked(fetch).mockImplementation(async (input) => String(input).includes('/institutions/verify')
    ? jsonOk(verification)
    : jsonOk({ ok: true }));
  await act(async () => {
    fireEvent.change(screen.getByTestId('input-country'),     { target: { value: opts.country } });
    fireEvent.change(screen.getByTestId('input-institution'), { target: { value: opts.institution } });
    fireEvent.change(screen.getByTestId('input-degree'),      { target: { value: opts.degree } });
    fireEvent.change(screen.getByTestId('input-field'),       { target: { value: opts.field } });
    if (opts.purpose) {
      fireEvent.change(screen.getByTestId('select-purpose'), { target: { value: opts.purpose } });
    }
  });
  await act(async () => { fireEvent.click(screen.getByTestId('button-check-institution')); });
  await waitFor(() => expect(screen.queryByTestId('institution-verified')).not.toBeNull());
  await act(async () => { fireEvent.submit(screen.getByTestId('form-eval')); });
}

// ─── 1 · /auth/profile is called with country and purpose ────────────────────

describe('EvaluatorView submit — /auth/profile receives country and purpose', () => {
  it('calls /auth/profile with the submitted country and purpose', async () => {
    seedLoggedIn();
    const fetchSpy = vi.fn().mockResolvedValue(jsonOk({ ok: true }));
    vi.stubGlobal('fetch', fetchSpy);

    await act(async () => { render(<App />); });
    await submitEvaluator({
      country: 'Nigeria',
      institution: 'University of Lagos',
      degree: 'B.Sc',
      field: 'Accounting',
      purpose: 'Employment & HR',
    });

    await waitFor(() => expect(screen.queryByTestId('results-container')).not.toBeNull());

    // Find the /auth/profile call
    const profileCall = fetchSpy.mock.calls.find(([url]: [unknown]) =>
      typeof url === 'string' && url.includes('/auth/profile'),
    );
    expect(profileCall).toBeDefined();

    const body = JSON.parse((profileCall![1] as RequestInit).body as string) as Record<string, unknown>;
    expect((body.profile as Record<string, string>).country).toBe('Nigeria');
    expect((body.profile as Record<string, string>).purpose).toBe('Employment & HR');
    expect(body.username).toBe(VALID_USER.username);
  });

  it('includes institution and field in the /auth/profile call', async () => {
    seedLoggedIn();
    const fetchSpy = vi.fn().mockResolvedValue(jsonOk({ ok: true }));
    vi.stubGlobal('fetch', fetchSpy);

    await act(async () => { render(<App />); });
    await submitEvaluator({
      country: 'Brazil',
      institution: 'USP',
      degree: 'M.Eng',
      field: 'Engineering',
    });

    await waitFor(() => expect(screen.queryByTestId('results-container')).not.toBeNull());

    const profileCall = fetchSpy.mock.calls.find(([url]: [unknown]) =>
      typeof url === 'string' && url.includes('/auth/profile'),
    );
    expect(profileCall).toBeDefined();
    const body = JSON.parse((profileCall![1] as RequestInit).body as string) as Record<string, unknown>;
    const profile = body.profile as Record<string, string>;
    expect(profile.country).toBe('Brazil');
    expect(profile.institution).toBe('USP');
    expect(profile.field).toBe('Engineering');
  });
});

// ─── 2 · ge_profile is written for offline resilience ────────────────────────

describe('EvaluatorView submit — ge_profile written to localStorage', () => {
  it('stores country and purpose in ge_profile after submission', async () => {
    seedLoggedIn();
    await act(async () => { render(<App />); });
    await submitEvaluator({
      country: 'India',
      institution: 'IIT Delhi',
      degree: 'B.Tech',
      field: 'Computer Science',
      purpose: 'University Admission',
    });

    await waitFor(() => expect(screen.queryByTestId('results-container')).not.toBeNull());

    const profile = JSON.parse(localStorage.getItem('ge_profile') || '{}') as Record<string, string>;
    expect(profile.country).toBe('India');
    expect(profile.purpose).toBe('University Admission');
  });
});

// ─── 3 · A second submission overwrites the profile ───────────────────────────

describe('EvaluatorView submit — repeated submissions update the profile', () => {
  it('overwrites ge_profile with the latest submission values', async () => {
    seedLoggedIn();
    await act(async () => { render(<App />); });

    await submitEvaluator({ country: 'Mexico', institution: 'UNAM', degree: 'Lic.', field: 'Accounting' });
    await waitFor(() => expect(screen.queryByTestId('results-container')).not.toBeNull());

    // Simulate the user going back and re-submitting with new values.
    await submitEvaluator({ country: 'Colombia', institution: 'U. Nacional', degree: 'M.Sc', field: 'Engineering' });
    await waitFor(() => {
      const profile = JSON.parse(localStorage.getItem('ge_profile') || '{}') as Record<string, string>;
      expect(profile.country).toBe('Colombia');
    });
  });
});

describe('EvaluatorView restore — saved inputs require fresh evidence', () => {
  it('prefills saved inputs but does not rebuild a verified-looking report on reload', async () => {
    seedLoggedIn();
    localStorage.setItem('ge_profile', JSON.stringify({
      country: 'Nigeria',
      institution: 'University of Lagos',
      degree: 'B.Sc',
      field: 'Computer Science',
      purpose: 'Employment & HR',
    }));
    localStorage.setItem(
      `ge_roadmap_steps_${VALID_USER.username}`,
      JSON.stringify([true, false, true, false]),
    );

    await act(async () => { render(<App />); });

    await waitFor(() => expect(screen.queryByTestId('form-eval')).not.toBeNull());
    expect((screen.getByTestId('input-institution') as HTMLInputElement).value).toBe('University of Lagos');
    expect(screen.queryByTestId('results-container')).toBeNull();
    expect((screen.getByTestId('button-eval-submit') as HTMLButtonElement).disabled).toBe(true);
  });
});

// ─── 4 · No /auth/profile call when user is not signed in ────────────────────

describe('EvaluatorView submit — no profile push without a signed-in user', () => {
  it('does not call /auth/profile when ge_username is cleared before submit', async () => {
    // Seed + render so the evaluator is visible, then clear the session key
    // before submitting — simulates a session that expired between page load
    // and form submission. The submit handler checks ge_username at call time.
    seedLoggedIn();

    const fetchSpy = vi.fn().mockResolvedValue(jsonOk({ ok: true }));
    vi.stubGlobal('fetch', fetchSpy);

    await act(async () => { render(<App />); });
    await waitFor(() => expect(screen.queryByTestId('form-eval')).not.toBeNull());

    // Clear session key AFTER render so the evaluator is already mounted.
    localStorage.removeItem('ge_username');

    await submitEvaluator({ country: 'Peru', institution: 'PUCP', degree: 'B.A.', field: 'Accounting' });
    await waitFor(() => expect(screen.queryByTestId('results-container')).not.toBeNull());

    const profileCall = fetchSpy.mock.calls.find(([url]: [unknown]) =>
      typeof url === 'string' && url.includes('/auth/profile'),
    );
    expect(profileCall).toBeUndefined();
  });
});
