// @vitest-environment jsdom
/**
 * Task #51 — Country dropdown in Spanish and return-visit prefill.
 *
 * Verified behaviours:
 *  1. Both CountryPicker instances show English placeholder by default.
 *  2. Switching to Spanish updates both placeholders correctly.
 *  3. EvaluatorView prefills a canonical saved country ("Brazil") on mount.
 *  4. EvaluatorView prefills a legacy free-text country ("brasil") on mount
 *     — no crash, value appears verbatim in the input.
 *  5. EvaluatorView prefills a 2-letter code legacy entry ("BR") on mount.
 *  6. Sign-up form is a blank form (no country prefill — first-time user).
 *  7. A country submitted through the sign-up form is stored in ge_profile.
 */
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor, act, cleanup, fireEvent } from '@testing-library/react';
import App from './App';
import { USERS_KEY } from './userStore';

// ─── Shared setup ─────────────────────────────────────────────────────────────

const VALID_USER = {
  username: 'retuser',
  email: 'ret@example.com',
  password: 'a'.repeat(64),
  createdAt: '2026-01-01T00:00:00.000Z',
};

const jsonResp = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

beforeEach(() => {
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  // Default: backend unreachable so syncOwnAccount doesn't interfere.
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: false,
    status: 503,
    headers: { get: () => null },
    json: () => Promise.resolve({}),
    text: () => Promise.resolve(''),
  }));
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Log the user in via localStorage so the evaluator view renders. */
function seedLoggedIn() {
  localStorage.setItem(USERS_KEY, JSON.stringify([VALID_USER]));
  localStorage.setItem('ge_username', VALID_USER.username);
}

/** Click the first language-toggle button (EN → ES). */
async function switchToSpanish() {
  const btns = screen.getAllByTestId('button-lang-toggle');
  await act(async () => { fireEvent.click(btns[0]); });
}

// ─── 1 + 2 · Placeholder language ────────────────────────────────────────────

describe('CountryPicker — placeholder language', () => {
  it('shows English placeholders in both pickers by default', async () => {
    // ── Evaluator picker (logged-in) ──
    seedLoggedIn();
    await act(async () => { render(<App />); });
    await waitFor(() => expect(screen.queryByTestId('input-country')).not.toBeNull());
    const evalPicker = screen.getByTestId('input-country') as HTMLInputElement;
    expect(evalPicker.placeholder).toMatch(/India|Nigeria|Brazil/i);
    expect(evalPicker.placeholder).not.toMatch(/ej\.|Brasil/i);

    // ── Sign-up picker (unauthenticated) ──
    cleanup();
    localStorage.clear();
    await act(async () => { render(<App />); });
    await waitFor(() => expect(screen.queryByTestId('input-signup-country')).not.toBeNull());
    const signupPicker = screen.getByTestId('input-signup-country') as HTMLInputElement;
    expect(signupPicker.placeholder).toMatch(/India|Nigeria|Brazil/i);
    expect(signupPicker.placeholder).not.toMatch(/ej\.|Brasil/i);
  });

  it('shows Spanish placeholders in both pickers after switching to ES', async () => {
    // ── Evaluator picker ──
    seedLoggedIn();
    await act(async () => { render(<App />); });
    await waitFor(() => expect(screen.queryByTestId('input-country')).not.toBeNull());

    await switchToSpanish();

    await waitFor(() => {
      const evalPicker = screen.getByTestId('input-country') as HTMLInputElement;
      expect(evalPicker.placeholder).toMatch(/ej\.|Brasil/i);
    });

    // ── Sign-up picker (unauthenticated) ──
    cleanup();
    localStorage.clear();
    await act(async () => { render(<App />); });
    await waitFor(() => expect(screen.queryByTestId('input-signup-country')).not.toBeNull());

    await switchToSpanish();

    await waitFor(() => {
      const signupPicker = screen.getByTestId('input-signup-country') as HTMLInputElement;
      expect(signupPicker.placeholder).toMatch(/ej\.|Brasil/i);
    });
    // English placeholder must be gone
    const signupPicker2 = screen.getByTestId('input-signup-country') as HTMLInputElement;
    expect(signupPicker2.placeholder).not.toMatch(/^e\.g\./);
  });
});

// ─── 3 · Evaluator prefill — canonical country ────────────────────────────────

describe('EvaluatorView — return-visit prefill (canonical country)', () => {
  it('prefills the country input with a previously saved canonical value', async () => {
    seedLoggedIn();
    localStorage.setItem('ge_profile', JSON.stringify({ country: 'Brazil' }));

    await act(async () => { render(<App />); });
    await waitFor(() => expect(screen.queryByTestId('input-country')).not.toBeNull());

    const picker = screen.getByTestId('input-country') as HTMLInputElement;
    expect(picker.value).toBe('Brazil');
  });
});

// ─── 4 · Evaluator prefill — legacy free-text (lowercase) ────────────────────

describe('EvaluatorView — return-visit prefill (legacy free-text)', () => {
  it('prefills the country input with a lowercase legacy value without crashing', async () => {
    seedLoggedIn();
    localStorage.setItem('ge_profile', JSON.stringify({ country: 'brasil' }));

    await act(async () => { render(<App />); });
    await waitFor(() => expect(screen.queryByTestId('input-country')).not.toBeNull());

    const picker = screen.getByTestId('input-country') as HTMLInputElement;
    expect(picker.value).toBe('brasil'); // displayed verbatim — no crash
  });
});

// ─── 5 · Evaluator prefill — legacy 2-letter code ────────────────────────────

describe('EvaluatorView — return-visit prefill (2-letter code)', () => {
  it('prefills the country input with a 2-letter legacy code without crashing', async () => {
    seedLoggedIn();
    localStorage.setItem('ge_profile', JSON.stringify({ country: 'BR' }));

    await act(async () => { render(<App />); });
    await waitFor(() => expect(screen.queryByTestId('input-country')).not.toBeNull());

    const picker = screen.getByTestId('input-country') as HTMLInputElement;
    expect(picker.value).toBe('BR');
  });
});

// ─── 6 · Sign-up form — no prefill ───────────────────────────────────────────

describe('AuthView — sign-up country field starts blank', () => {
  it('renders the sign-up country picker with no prefilled value', async () => {
    // ge_profile may exist from a prior visit; sign-up form must still be blank.
    localStorage.setItem('ge_profile', JSON.stringify({ country: 'India' }));

    await act(async () => { render(<App />); });
    await waitFor(() => expect(screen.queryByTestId('input-signup-country')).not.toBeNull());

    const picker = screen.getByTestId('input-signup-country') as HTMLInputElement;
    expect(picker.value).toBe('');
  });
});

// ─── 7 · Sign-up country stored in ge_profile ────────────────────────────────

describe('AuthView — sign-up country stored in ge_profile (offline path)', () => {
  it('stores the submitted country in ge_profile after offline sign-up', async () => {
    await act(async () => { render(<App />); });
    await waitFor(() => expect(screen.queryByTestId('input-signup-country')).not.toBeNull());

    await act(async () => {
      fireEvent.change(screen.getByTestId('input-username'), { target: { value: 'newuser' } });
      fireEvent.change(screen.getByTestId('input-password'), { target: { value: 'password1' } });
      fireEvent.change(screen.getByTestId('input-email'),    { target: { value: 'new@example.com' } });
      fireEvent.change(screen.getByTestId('input-signup-country'), { target: { value: 'Nigeria' } });
    });
    await act(async () => { fireEvent.submit(screen.getByTestId('form-auth')); });

    await waitFor(() => expect(screen.queryByTestId('nav-user-badge')).not.toBeNull());

    const profile = JSON.parse(localStorage.getItem('ge_profile') || '{}') as Record<string, string>;
    expect(profile.country).toBe('Nigeria');
  });

  it('stores the country in ge_profile after a successful server sign-up', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      jsonResp(201, { user: { username: 'newuser', email: 'new@example.com' }, token: 'tok' }),
    ));

    await act(async () => { render(<App />); });
    await waitFor(() => expect(screen.queryByTestId('input-signup-country')).not.toBeNull());

    await act(async () => {
      fireEvent.change(screen.getByTestId('input-username'), { target: { value: 'newuser' } });
      fireEvent.change(screen.getByTestId('input-password'), { target: { value: 'password1' } });
      fireEvent.change(screen.getByTestId('input-email'),    { target: { value: 'new@example.com' } });
      fireEvent.change(screen.getByTestId('input-signup-country'), { target: { value: 'Nigeria' } });
    });
    await act(async () => { fireEvent.submit(screen.getByTestId('form-auth')); });

    await waitFor(() => expect(screen.queryByTestId('nav-user-badge')).not.toBeNull());

    const profile = JSON.parse(localStorage.getItem('ge_profile') || '{}') as Record<string, string>;
    expect(profile.country).toBe('Nigeria');
  });
});
