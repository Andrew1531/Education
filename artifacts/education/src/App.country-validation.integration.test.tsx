// @vitest-environment jsdom
/**
 * Task #52 — Country field rejects non-canonical values at submit time.
 *
 * Tested paths:
 *  AuthView (sign-up):
 *   - Typing a non-country string shows errCountry inline
 *   - A canonical country (exact match, case-insensitive) passes validation
 *   - Leaving country blank on sign-up passes (field is optional)
 *
 *  EvaluatorView:
 *   - Submitting with a non-country string shows errCountry inline (data-testid="error-country")
 *   - A canonical country value passes and produces the results panel
 *   - The error clears when the user starts typing a new value
 */
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor, act, cleanup, fireEvent } from '@testing-library/react';
import App from './App';
import { USERS_KEY } from './userStore';

// ── helpers ──────────────────────────────────────────────────────────────────

const jsonResp = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

function stubFetch(opts: { signupOk?: boolean } = {}) {
  return vi.fn().mockImplementation(async (url: unknown) => {
    const u = String(url);
    if (u.includes('/auth/signup') || u.includes('/auth/sync')) {
      return jsonResp(200, { ok: opts.signupOk ?? true, token: 'tok' });
    }
    if (u.includes('/auth/signin')) return jsonResp(200, { ok: true });
    if (u.includes('/auth/profile')) return jsonResp(200, { ok: true });
    if (u.includes('/users/import')) return jsonResp(200, { imported: 0 });
    if (u.includes('/users')) return jsonResp(200, { users: [] });
    return jsonResp(200, { ok: true });
  });
}

const ERR_EN = /Please select a country from the list/i;
const ERR_ES = /Por favor selecciona un país de la lista/i;

// ── setup / teardown ─────────────────────────────────────────────────────────

beforeEach(() => {
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  if (!URL.createObjectURL) URL.createObjectURL = vi.fn().mockReturnValue('blob:mock');
  if (!URL.revokeObjectURL) URL.revokeObjectURL = vi.fn();
  localStorage.clear();
  sessionStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  window.history.pushState({}, '', '/');
});

// ── AuthView — sign-up country validation ────────────────────────────────────

describe('AuthView sign-up — country validation', () => {
  async function renderSignUp() {
    vi.stubGlobal('fetch', stubFetch());
    window.history.pushState({}, '', '/');
    localStorage.setItem(USERS_KEY, JSON.stringify([]));
    await act(async () => { render(<App />); });
    // The auth form defaults to sign-up mode (isSignUp = true) — country field
    // is already visible; no toggle click needed.
    await waitFor(() => expect(screen.queryByTestId('form-auth')).not.toBeNull());
  }

  it('shows the country error when a non-canonical value is submitted', async () => {
    await renderSignUp();
    fireEvent.change(screen.getByTestId('input-username'), { target: { value: 'alice' } });
    fireEvent.change(screen.getByTestId('input-password'), { target: { value: 'password123' } });
    fireEvent.change(screen.getByTestId('input-email'), { target: { value: 'alice@example.com' } });
    fireEvent.change(screen.getByTestId('input-signup-country'), { target: { value: 'north pole' } });
    await act(async () => { fireEvent.click(screen.getByTestId('button-auth-submit')); });
    await waitFor(() => expect(screen.queryByText(ERR_EN)).not.toBeNull());
  });

  it('accepts a canonical country name (case-insensitive) without error', async () => {
    await renderSignUp();
    fireEvent.change(screen.getByTestId('input-username'), { target: { value: 'alice' } });
    fireEvent.change(screen.getByTestId('input-password'), { target: { value: 'password123' } });
    fireEvent.change(screen.getByTestId('input-email'), { target: { value: 'alice@example.com' } });
    // "nigeria" — correct name, lowercase
    fireEvent.change(screen.getByTestId('input-signup-country'), { target: { value: 'nigeria' } });
    await act(async () => { fireEvent.click(screen.getByTestId('button-auth-submit')); });
    await waitFor(() => expect(screen.queryByText(ERR_EN)).toBeNull());
  });

  it('passes validation when the country field is left blank (optional)', async () => {
    await renderSignUp();
    fireEvent.change(screen.getByTestId('input-username'), { target: { value: 'alice' } });
    fireEvent.change(screen.getByTestId('input-password'), { target: { value: 'password123' } });
    fireEvent.change(screen.getByTestId('input-email'), { target: { value: 'alice@example.com' } });
    // Leave country blank — should not trigger errCountry
    await act(async () => { fireEvent.click(screen.getByTestId('button-auth-submit')); });
    await waitFor(() => expect(screen.queryByText(ERR_EN)).toBeNull());
  });

  it('shows the Spanish country error on the sign-up form when UI language is Spanish', async () => {
    await renderSignUp();
    // Toggle language to Spanish
    const langBtns = screen.getAllByTestId('button-lang-toggle');
    await act(async () => { fireEvent.click(langBtns[0]); });
    // Wait for Spanish UI to render (hero heading switches language)
    await waitFor(() => expect(screen.queryByText(/Reconocida en EE\.UU\./i)).not.toBeNull());
    fireEvent.change(screen.getByTestId('input-username'), { target: { value: 'alice' } });
    fireEvent.change(screen.getByTestId('input-password'), { target: { value: 'password123' } });
    fireEvent.change(screen.getByTestId('input-email'), { target: { value: 'alice@example.com' } });
    fireEvent.change(screen.getByTestId('input-signup-country'), { target: { value: 'north pole' } });
    await act(async () => { fireEvent.click(screen.getByTestId('button-auth-submit')); });
    await waitFor(() => expect(screen.queryByText(ERR_ES)).not.toBeNull());
  });
});

// ── EvaluatorView — country validation ───────────────────────────────────────

describe('EvaluatorView — country validation', () => {
  /** Sign in and render the evaluator form. */
  async function renderEvaluator() {
    vi.stubGlobal('fetch', stubFetch());
    window.history.pushState({}, '', '/');
    // Seed a local user and set the session key so App thinks we're logged in.
    const user = { username: 'alice', email: 'alice@example.com', password: 'hash', salt: 's', createdAt: new Date().toISOString() };
    localStorage.setItem(USERS_KEY, JSON.stringify([user]));
    localStorage.setItem('ge_username', 'alice');
    await act(async () => { render(<App />); });
    // Wait for the evaluator country input to appear
    await waitFor(() => expect(screen.queryByTestId('input-country')).not.toBeNull());
  }

  it('shows data-testid="error-country" when a non-canonical value is submitted', async () => {
    await renderEvaluator();
    fireEvent.change(screen.getByTestId('input-country'), { target: { value: 'xyz' } });
    fireEvent.change(screen.getByTestId('input-institution'), { target: { value: 'MIT' } });
    fireEvent.change(screen.getByTestId('input-degree'), { target: { value: 'B.Sc' } });
    // Field of study — find by placeholder text
    const fieldInput = screen.getByPlaceholderText(/accounting|computer science/i);
    fireEvent.change(fieldInput, { target: { value: 'Engineering' } });
    await act(async () => { fireEvent.submit(screen.getByTestId('form-eval')); });
    await waitFor(() => expect(screen.queryByTestId('error-country')).not.toBeNull());
  });

  it('shows the error message text when country is invalid', async () => {
    await renderEvaluator();
    fireEvent.change(screen.getByTestId('input-country'), { target: { value: 'fakeland' } });
    fireEvent.change(screen.getByTestId('input-institution'), { target: { value: 'SomeU' } });
    fireEvent.change(screen.getByTestId('input-degree'), { target: { value: 'MBA' } });
    const fieldInput = screen.getByPlaceholderText(/accounting|computer science/i);
    fireEvent.change(fieldInput, { target: { value: 'Business' } });
    await act(async () => { fireEvent.submit(screen.getByTestId('form-eval')); });
    await waitFor(() => expect(screen.queryByText(ERR_EN)).not.toBeNull());
  });

  it('clears the error when the user changes the country input', async () => {
    await renderEvaluator();
    // First submit to trigger error
    fireEvent.change(screen.getByTestId('input-country'), { target: { value: 'fakeland' } });
    fireEvent.change(screen.getByTestId('input-institution'), { target: { value: 'SomeU' } });
    fireEvent.change(screen.getByTestId('input-degree'), { target: { value: 'MBA' } });
    const fieldInput = screen.getByPlaceholderText(/accounting|computer science/i);
    fireEvent.change(fieldInput, { target: { value: 'Business' } });
    await act(async () => { fireEvent.submit(screen.getByTestId('form-eval')); });
    await waitFor(() => expect(screen.queryByTestId('error-country')).not.toBeNull());
    // Now change the field — error should disappear immediately
    await act(async () => {
      fireEvent.change(screen.getByTestId('input-country'), { target: { value: 'India' } });
    });
    await waitFor(() => expect(screen.queryByTestId('error-country')).toBeNull());
  });

  it('does not show the country error when a canonical country is submitted', async () => {
    await renderEvaluator();
    fireEvent.change(screen.getByTestId('input-country'), { target: { value: 'Brazil' } });
    fireEvent.change(screen.getByTestId('input-institution'), { target: { value: 'USP' } });
    fireEvent.change(screen.getByTestId('input-degree'), { target: { value: 'B.Sc' } });
    const fieldInput = screen.getByPlaceholderText(/accounting|computer science/i);
    fireEvent.change(fieldInput, { target: { value: 'Engineering' } });
    await act(async () => { fireEvent.submit(screen.getByTestId('form-eval')); });
    await waitFor(() => expect(screen.queryByTestId('error-country')).toBeNull());
  });

  it('shows the Spanish error message when the UI language is Spanish', async () => {
    await renderEvaluator();
    // Toggle language to Spanish — same pattern used by App.i18n tests.
    const langBtns = screen.getAllByTestId('button-lang-toggle');
    await act(async () => { fireEvent.click(langBtns[0]); });
    // Wait for Spanish UI to appear before submitting.
    await waitFor(() => expect(screen.queryByText(/Transforma Tu Educación Extranjera en/i)).not.toBeNull());
    fireEvent.change(screen.getByTestId('input-country'), { target: { value: 'xyz' } });
    fireEvent.change(screen.getByTestId('input-institution'), { target: { value: 'UNAM' } });
    fireEvent.change(screen.getByTestId('input-degree'), { target: { value: 'Lic.' } });
    fireEvent.change(screen.getByTestId('input-field'), { target: { value: 'Ingeniería' } });
    await act(async () => { fireEvent.submit(screen.getByTestId('form-eval')); });
    await waitFor(() => expect(screen.queryByText(ERR_ES)).not.toBeNull());
  });
});
