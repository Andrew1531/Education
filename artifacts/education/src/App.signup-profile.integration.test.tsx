// @vitest-environment jsdom
/**
 * Integration tests: country + goal survive both signup paths.
 *
 * Server path: when the API is reachable, apiSignup receives the profile in
 * its request body — verified by inspecting the captured fetch call.
 *
 * Offline path: when the API is unreachable (ApiUnavailableError), the form's
 * saveSignupProfile() merges the answers into ge_profile without clobbering
 * evaluator answers that are already there.
 *
 * syncOwnAccount path: on the next page load the profile stored in ge_profile
 * is pushed to the server via apiSyncSelf.
 */
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor, act, cleanup, fireEvent } from '@testing-library/react';
import App from './App';
import { USERS_KEY } from './userStore';

// jsdom provides localStorage natively.

beforeEach(() => {
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

const jsonResponse = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

/** Fill and submit the sign-up form with optional country + goal. */
async function submitSignUp(opts: {
  username: string;
  password: string;
  email: string;
  country?: string;
  goal?: string;
}) {
  await act(async () => { render(<App />); });

  await act(async () => {
    fireEvent.change(screen.getByTestId('input-username'), { target: { value: opts.username } });
    fireEvent.change(screen.getByTestId('input-password'), { target: { value: opts.password } });
    fireEvent.change(screen.getByTestId('input-email'),    { target: { value: opts.email } });
    if (opts.country) {
      fireEvent.change(screen.getByTestId('input-signup-country'), { target: { value: opts.country } });
    }
    if (opts.goal) {
      fireEvent.change(screen.getByTestId('select-signup-goal'), { target: { value: opts.goal } });
    }
  });

  await act(async () => {
    fireEvent.submit(screen.getByTestId('form-auth'));
  });
}

// ─── Server-mode path ─────────────────────────────────────────────────────────

describe('App sign-up — server path sends country + goal in the API body', () => {
  it('forwards country and goal to /auth/signup when the backend is reachable', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse(201, { user: {}, token: 'tok-test' }),
    );

    await submitSignUp({
      username: 'alice',
      password: 'hunter2',
      email: 'alice@example.com',
      country: 'Nigeria',
      goal: 'Employment & HR',
    });

    // Wait for the logged-in state (nav badge) so we know the submit completed.
    await waitFor(() => {
      expect(screen.queryByTestId('nav-user-badge')).not.toBeNull();
    });

    // Find the /auth/signup call (the first POST that targets that path).
    const signupCall = fetchSpy.mock.calls.find(([url]) =>
      typeof url === 'string' && url.includes('/auth/signup'),
    );
    expect(signupCall).toBeDefined();

    const body = JSON.parse((signupCall![1] as RequestInit).body as string) as Record<string, unknown>;
    expect((body.profile as Record<string, string>).country).toBe('Nigeria');
    expect((body.profile as Record<string, string>).purpose).toBe('Employment & HR');
  });

  it('stores country + goal in ge_profile even after a successful server signup', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse(201, { user: {}, token: 'tok-test' }),
    );

    await submitSignUp({
      username: 'alice',
      password: 'hunter2',
      email: 'alice@example.com',
      country: 'Brazil',
      goal: 'University Admission',
    });

    await waitFor(() => {
      expect(screen.queryByTestId('nav-user-badge')).not.toBeNull();
    });

    const profile = JSON.parse(localStorage.getItem('ge_profile') ?? 'null') as Record<string, string> | null;
    expect(profile?.country).toBe('Brazil');
    expect(profile?.purpose).toBe('University Admission');
  });
});

// ─── Offline path ─────────────────────────────────────────────────────────────

describe('App sign-up — offline path saves country + goal to ge_profile', () => {
  beforeEach(() => {
    // Simulate the API being unreachable: fetch always rejects with a network error.
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'));
  });

  it('stores country in ge_profile after an offline signup', async () => {
    await submitSignUp({
      username: 'bob',
      password: 'hunter2',
      email: 'bob@example.com',
      country: 'India',
    });

    await waitFor(() => {
      expect(screen.queryByTestId('nav-user-badge')).not.toBeNull();
    });

    const profile = JSON.parse(localStorage.getItem('ge_profile') ?? 'null') as Record<string, string> | null;
    expect(profile?.country).toBe('India');
  });

  it('stores goal in ge_profile after an offline signup', async () => {
    await submitSignUp({
      username: 'carol',
      password: 'hunter2',
      email: 'carol@example.com',
      goal: 'Professional Licensing',
    });

    await waitFor(() => {
      expect(screen.queryByTestId('nav-user-badge')).not.toBeNull();
    });

    const profile = JSON.parse(localStorage.getItem('ge_profile') ?? 'null') as Record<string, string> | null;
    expect(profile?.purpose).toBe('Professional Licensing');
  });

  it('stores both country and goal when both are provided', async () => {
    await submitSignUp({
      username: 'dave',
      password: 'hunter2',
      email: 'dave@example.com',
      country: 'Mexico',
      goal: 'Immigration (USCIS)',
    });

    await waitFor(() => {
      expect(screen.queryByTestId('nav-user-badge')).not.toBeNull();
    });

    const profile = JSON.parse(localStorage.getItem('ge_profile') ?? 'null') as Record<string, string> | null;
    expect(profile?.country).toBe('Mexico');
    expect(profile?.purpose).toBe('Immigration (USCIS)');
  });

  it('does not clobber existing evaluator answers already in ge_profile', async () => {
    // The evaluator already ran; it wrote institution + field + country.
    const existingProfile = {
      institution: 'University of Lagos',
      field: 'Computer Science',
      degree: 'B.Sc',
      country: 'Nigeria', // evaluator set it first
      purpose: 'Employment & HR', // evaluator set it first
    };
    localStorage.setItem('ge_profile', JSON.stringify(existingProfile));

    await submitSignUp({
      username: 'eve',
      password: 'hunter2',
      email: 'eve@example.com',
      country: 'India',           // should NOT overwrite Nigeria
      goal: 'University Admission', // should NOT overwrite Employment & HR
    });

    await waitFor(() => {
      expect(screen.queryByTestId('nav-user-badge')).not.toBeNull();
    });

    const profile = JSON.parse(localStorage.getItem('ge_profile') ?? 'null') as Record<string, string> | null;
    // Evaluator values must be preserved.
    expect(profile?.country).toBe('Nigeria');
    expect(profile?.purpose).toBe('Employment & HR');
    // Other evaluator fields must also be untouched.
    expect(profile?.institution).toBe('University of Lagos');
    expect(profile?.field).toBe('Computer Science');
    expect(profile?.degree).toBe('B.Sc');
  });

  it('fills in country when ge_profile exists but country is missing', async () => {
    // Evaluator ran but only set field/degree, not country.
    const existingProfile = { institution: 'UNAM', field: 'Law', degree: 'LLB' };
    localStorage.setItem('ge_profile', JSON.stringify(existingProfile));

    await submitSignUp({
      username: 'frank',
      password: 'hunter2',
      email: 'frank@example.com',
      country: 'Mexico',
    });

    await waitFor(() => {
      expect(screen.queryByTestId('nav-user-badge')).not.toBeNull();
    });

    const profile = JSON.parse(localStorage.getItem('ge_profile') ?? 'null') as Record<string, string> | null;
    // New country should be added.
    expect(profile?.country).toBe('Mexico');
    // Existing fields must remain intact.
    expect(profile?.institution).toBe('UNAM');
    expect(profile?.field).toBe('Law');
  });

  it('skips writing ge_profile when neither country nor goal is provided', async () => {
    await submitSignUp({
      username: 'grace',
      password: 'hunter2',
      email: 'grace@example.com',
      // no country, no goal
    });

    await waitFor(() => {
      expect(screen.queryByTestId('nav-user-badge')).not.toBeNull();
    });

    // ge_profile must not be created at all.
    expect(localStorage.getItem('ge_profile')).toBeNull();
  });

  it('creates the user entry in the local user store when offline', async () => {
    await submitSignUp({
      username: 'heidi',
      password: 'hunter2',
      email: 'heidi@example.com',
      country: 'Colombia',
    });

    await waitFor(() => {
      expect(screen.queryByTestId('nav-user-badge')).not.toBeNull();
    });

    const users = JSON.parse(localStorage.getItem(USERS_KEY) ?? '[]') as Array<{ username: string }>;
    expect(users.some((u) => u.username === 'heidi')).toBe(true);
  });
});

// ─── Sign-in — cross-device profile prefill ───────────────────────────────────

describe('App sign-in — server profile seeds ge_profile on a fresh device', () => {
  /** Fill and submit the sign-in form. */
  async function submitSignIn(username: string, password: string) {
    await act(async () => { render(<App />); });

    // Switch to sign-in mode
    await act(async () => {
      fireEvent.click(screen.getByTestId('button-toggle-auth'));
    });

    await act(async () => {
      fireEvent.change(screen.getByTestId('input-username'), { target: { value: username } });
      fireEvent.change(screen.getByTestId('input-password'), { target: { value: password } });
    });

    await act(async () => {
      fireEvent.submit(screen.getByTestId('form-auth'));
    });
  }

  it('seeds ge_profile from server values when the device has no local profile', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse(200, {
        user: { country: 'India', institution: 'IIT Delhi', degree: 'B.Tech', field: 'Computer Science', purpose: 'Employment & HR' },
        token: 'tok-alice',
      }),
    );

    await submitSignIn('alice', 'hunter2');

    await waitFor(() => {
      expect(screen.queryByTestId('nav-user-badge')).not.toBeNull();
    });

    const profile = JSON.parse(localStorage.getItem('ge_profile') ?? 'null') as Record<string, string> | null;
    expect(profile?.country).toBe('India');
    expect(profile?.institution).toBe('IIT Delhi');
    expect(profile?.degree).toBe('B.Tech');
    expect(profile?.field).toBe('Computer Science');
    expect(profile?.purpose).toBe('Employment & HR');
  });

  it('does not overwrite existing local ge_profile values with older server values', async () => {
    // User previously ran the evaluator on this device and saved different answers.
    const localProfile = {
      country: 'Brazil',
      institution: 'USP',
      degree: 'M.Sc',
      field: 'Physics',
      purpose: 'University Admission',
    };
    localStorage.setItem('ge_profile', JSON.stringify(localProfile));

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse(200, {
        user: { country: 'Nigeria', institution: 'UI', degree: 'B.Sc', field: 'Biology', purpose: 'Professional Licensing' },
        token: 'tok-bob',
      }),
    );

    await submitSignIn('bob', 'hunter2');

    await waitFor(() => {
      expect(screen.queryByTestId('nav-user-badge')).not.toBeNull();
    });

    const profile = JSON.parse(localStorage.getItem('ge_profile') ?? 'null') as Record<string, string> | null;
    // Local values must win.
    expect(profile?.country).toBe('Brazil');
    expect(profile?.institution).toBe('USP');
    expect(profile?.degree).toBe('M.Sc');
    expect(profile?.field).toBe('Physics');
    expect(profile?.purpose).toBe('University Admission');
  });

  it('fills only the missing fields when the local profile is partial', async () => {
    // Only country is already known locally.
    localStorage.setItem('ge_profile', JSON.stringify({ country: 'Mexico' }));

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse(200, {
        user: { country: 'Nigeria', institution: 'OAU', degree: 'B.Sc', field: 'Chemistry', purpose: 'Employment & HR' },
        token: 'tok-carol',
      }),
    );

    await submitSignIn('carol', 'hunter2');

    await waitFor(() => {
      expect(screen.queryByTestId('nav-user-badge')).not.toBeNull();
    });

    const profile = JSON.parse(localStorage.getItem('ge_profile') ?? 'null') as Record<string, string> | null;
    // Local country wins; server fills the rest.
    expect(profile?.country).toBe('Mexico');
    expect(profile?.institution).toBe('OAU');
    expect(profile?.degree).toBe('B.Sc');
    expect(profile?.field).toBe('Chemistry');
    expect(profile?.purpose).toBe('Employment & HR');
  });

  it('leaves ge_profile unchanged when the server returns no profile fields', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse(200, { user: {}, token: 'tok-dave' }),
    );

    await submitSignIn('dave', 'hunter2');

    await waitFor(() => {
      expect(screen.queryByTestId('nav-user-badge')).not.toBeNull();
    });

    // ge_profile should not be created when there is nothing to seed.
    expect(localStorage.getItem('ge_profile')).toBeNull();
  });
});

// ─── syncOwnAccount — next-load sync pushes ge_profile to the server ──────────

describe('syncOwnAccount — pushes saved ge_profile to the backend on page load', () => {
  it('calls /auth/sync with the profile stored in ge_profile', async () => {
    // Simulate a user who signed up offline: username in localStorage,
    // account in the local user store, and a profile in ge_profile.
    const localUser = {
      username: 'ivan',
      email: 'ivan@example.com',
      password: 'a'.repeat(64),
      salt: 'somesalt',
      createdAt: '2026-01-01T00:00:00.000Z',
    };
    localStorage.setItem(USERS_KEY, JSON.stringify([localUser]));
    localStorage.setItem('ge_username', 'ivan');
    localStorage.setItem('ge_profile', JSON.stringify({ country: 'Russia', purpose: 'Employment & HR' }));

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse(200, { ok: true, token: null }),
    );

    await act(async () => { render(<App />); });

    // syncOwnAccount fires on mount; give it a tick to resolve.
    await waitFor(() => {
      const syncCall = fetchSpy.mock.calls.find(([url]) =>
        typeof url === 'string' && url.includes('/auth/sync'),
      );
      expect(syncCall).toBeDefined();
      const body = JSON.parse((syncCall![1] as RequestInit).body as string) as Record<string, unknown>;
      expect((body.profile as Record<string, string>).country).toBe('Russia');
      expect((body.profile as Record<string, string>).purpose).toBe('Employment & HR');
    });
  });

  it('pushes ge_profile even when the user has no local store entry (server-only account)', async () => {
    // ge_username is set but the local user store is empty (account lives on server).
    // Seed the auth token so apiSaveProfile can authenticate the request.
    const juliaToken = 'b65a2915809ebbca98831b394d40f2e74f1f8c317a6947568154fc497da3af1a'; // HMAC-SHA256("test-session-secret","julia")
    localStorage.setItem('ge_auth_token_julia', juliaToken);
    localStorage.setItem(USERS_KEY, JSON.stringify([]));
    localStorage.setItem('ge_username', 'julia');
    localStorage.setItem('ge_profile', JSON.stringify({ country: 'Germany', purpose: 'University Admission' }));

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse(200, { ok: true }),
    );

    await act(async () => { render(<App />); });

    await waitFor(() => {
      // For a server-only account, apiSaveProfile is called (/auth/profile).
      const profileCall = fetchSpy.mock.calls.find(([url]) =>
        typeof url === 'string' && (url.includes('/auth/sync') || url.includes('/auth/profile')),
      );
      expect(profileCall).toBeDefined();
    });
  });

  it('does not call the backend when no username is saved (visitor not signed in)', async () => {
    // No ge_username — syncOwnAccount returns immediately.
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse(200, { ok: true }),
    );

    await act(async () => { render(<App />); });

    // Give any async effects time to fire.
    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });

    const syncCall = fetchSpy.mock.calls.find(([url]) =>
      typeof url === 'string' && url.includes('/auth/sync'),
    );
    expect(syncCall).toBeUndefined();
  });
});
