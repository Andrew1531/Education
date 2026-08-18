// @vitest-environment jsdom
/**
 * Task #50 — Admin board shows country & goal for users registered before those
 * fields existed.
 *
 * The flow under test:
 *   Admin opens the dashboard → the frontend imports local users (profile merged
 *   in from ge_profile for the current user) → fetches the central user list →
 *   the admin board renders country/purpose from the server response.
 *
 * Verified behaviours:
 *  1. A user whose imported record includes country and purpose shows those
 *     values on the admin board (not "Not provided yet").
 *  2. A user whose record has no profile fields shows "Not provided yet" for
 *     both Country and Intention — confirming the negative path still works.
 */
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor, act, cleanup, fireEvent } from '@testing-library/react';
import App from './App';
import { USERS_KEY } from './userStore';

// ── Helpers ─────────────────────────────────────────────────────────────────

const jsonResponse = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

/** A server user object with country and purpose — matches publicUser() shape. */
function makeServerUser(overrides: Record<string, unknown> = {}) {
  return {
    username: 'legacyalice',
    email: 'alice@example.com',
    hasSalt: true,
    createdAt: new Date('2025-01-01').toISOString(),
    country: null,
    institution: null,
    degree: null,
    field: null,
    purpose: null,
    ...overrides,
  };
}

// ── Shared test setup ─────────────────────────────────────────────────────────

let originalLocation: Location;

beforeEach(() => {
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  if (!URL.createObjectURL) URL.createObjectURL = vi.fn().mockReturnValue('blob:mock');
  if (!URL.revokeObjectURL) URL.revokeObjectURL = vi.fn();

  // Store and override location to simulate /admin route.
  originalLocation = window.location;
  Object.defineProperty(window, 'location', {
    configurable: true,
    writable: true,
    value: { ...originalLocation, pathname: '/admin', reload: vi.fn() },
  });
  window.history.pushState({}, '', '/admin');

  localStorage.clear();
  sessionStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  window.history.pushState({}, '', '/');
  Object.defineProperty(window, 'location', {
    configurable: true,
    writable: true,
    value: originalLocation,
  });
});

/**
 * Render the app on /admin, wait for the AdminGate, enter the password, and
 * wait for the gate to close so the admin board is visible.
 */
async function renderAdminBoard(serverUsers: ReturnType<typeof makeServerUser>[]) {
  // Stub fetch: every call gets the server users list (import and list use the
  // same mock; the admin board just needs a 200 with { users: [...] }).
  const fetchSpy = vi.fn().mockImplementation(async (url: unknown) => {
    const u = String(url);
    if (u.includes('/api/users') || u.includes('/api/auth/sync') || u.includes('/api/auth/profile')) {
      return jsonResponse(200, { users: serverUsers, ok: true });
    }
    if (u.includes('/users/import')) return jsonResponse(200, { imported: 1 });
    return jsonResponse(200, { ok: true });
  });
  vi.stubGlobal('fetch', fetchSpy);

  await act(async () => { render(<App />); });
  await waitFor(() => expect(screen.queryByPlaceholderText(/admin password/i)).not.toBeNull());
  fireEvent.change(screen.getByPlaceholderText(/admin password/i), { target: { value: 'test-admin-key' } });
  await act(async () => { fireEvent.click(screen.getByText('Enter')); });
  // Gate closes after successful server verification.
  await waitFor(() => expect(screen.queryByPlaceholderText(/admin password/i)).toBeNull());
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Admin board — shows country and goal for legacy-imported users', () => {
  it('displays the country value when the server record has one', async () => {
    localStorage.setItem(USERS_KEY, JSON.stringify([]));
    await renderAdminBoard([makeServerUser({ country: 'Nigeria', purpose: 'University Admission' })]);

    await waitFor(() => {
      expect(screen.queryByText('Nigeria')).not.toBeNull();
    });
  });

  it('displays the purpose/intention value when the server record has one', async () => {
    localStorage.setItem(USERS_KEY, JSON.stringify([]));
    await renderAdminBoard([makeServerUser({ country: 'Nigeria', purpose: 'University Admission' })]);

    await waitFor(() => {
      expect(screen.queryByText('University Admission')).not.toBeNull();
    });
  });

  it('shows "Not provided yet" for country when the server record has none', async () => {
    localStorage.setItem(USERS_KEY, JSON.stringify([]));
    await renderAdminBoard([makeServerUser()]);

    await waitFor(() => {
      // "Not provided yet" appears for each missing field (country + intention).
      const missing = screen.queryAllByText('Not provided yet');
      expect(missing.length).toBeGreaterThanOrEqual(2);
    });
  });

  it('does not show "Not provided yet" for country or intention when all profile fields are set', async () => {
    localStorage.setItem(USERS_KEY, JSON.stringify([]));
    // Supply all three profile fields so no "Not provided yet" span appears.
    await renderAdminBoard([makeServerUser({
      country: 'Brazil',
      institution: 'USP',
      purpose: 'Employment & HR',
    })]);

    await waitFor(() => {
      // All three fields have values — zero "Not provided yet" spans.
      expect(screen.queryByText('Not provided yet')).toBeNull();
    });
  });
});
