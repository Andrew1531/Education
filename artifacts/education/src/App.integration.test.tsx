// @vitest-environment jsdom
/**
 * Integration tests: mounts the full App tree and verifies the
 * StorageCorruptBanner is shown (or absent) based on `ge_users` content.
 *
 * These tests deliberately seed localStorage *before* rendering so the
 * startup useEffect encounters the value on first run — exactly the
 * production code path.
 */
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor, act, cleanup, fireEvent } from '@testing-library/react';
import App from './App';
import { USERS_KEY } from './userStore';

// jsdom provides localStorage natively — no manual mock needed.

// App calls window.scrollTo on login/logout; jsdom does not implement it.
beforeEach(() => {
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  localStorage.clear();
});

// Unmount all rendered components so DOM is clean for the next test.
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

// ─── StorageCorruptBanner — application-level integration ─────────────────────

describe('App — StorageCorruptBanner visibility', () => {
  it('shows the banner when ge_users contains malformed JSON', async () => {
    localStorage.setItem(USERS_KEY, '{{bad json');

    await act(async () => {
      render(<App />);
    });

    // App renders the banner in two places (global + AuthView), so use
    // getAllByTestId and assert at least one is present.
    await waitFor(() => {
      const banners = screen.getAllByTestId('banner-storage-corrupt');
      expect(banners.length).toBeGreaterThan(0);
    });
  });

  it('shows the banner when ge_users is a valid JSON object (not an array)', async () => {
    localStorage.setItem(USERS_KEY, JSON.stringify({ username: 'alice' }));

    await act(async () => {
      render(<App />);
    });

    await waitFor(() => {
      const banners = screen.getAllByTestId('banner-storage-corrupt');
      expect(banners.length).toBeGreaterThan(0);
    });
  });

  it('does NOT show the banner when ge_users is absent (first-run)', async () => {
    // key absent — getUsers() returns [] without throwing
    await act(async () => {
      render(<App />);
    });

    await waitFor(() => {
      expect(screen.queryByTestId('banner-storage-corrupt')).toBeNull();
    });
  });

  it('does NOT show the banner when ge_users contains a valid user list', async () => {
    const validUser = {
      username:  'alice',
      email:     'alice@example.com',
      password:  'a'.repeat(64),
      createdAt: '2026-01-01T00:00:00.000Z',
    };
    localStorage.setItem(USERS_KEY, JSON.stringify([validUser]));

    await act(async () => {
      render(<App />);
    });

    await waitFor(() => {
      expect(screen.queryByTestId('banner-storage-corrupt')).toBeNull();
    });
  });

  it('does NOT show the banner when ge_users holds an empty array', async () => {
    localStorage.setItem(USERS_KEY, '[]');

    await act(async () => {
      render(<App />);
    });

    await waitFor(() => {
      expect(screen.queryByTestId('banner-storage-corrupt')).toBeNull();
    });
  });
});

// ─── Sign-up duplicate username rejection ──────────────────────────────────────

describe('App — sign-up rejects duplicate username', () => {
  // A valid user already persisted before each test.
  const seededUser = {
    username:  'alice',
    email:     'alice@example.com',
    password:  'a'.repeat(64),
    createdAt: '2026-01-01T00:00:00.000Z',
  };

  beforeEach(() => {
    localStorage.setItem(USERS_KEY, JSON.stringify([seededUser]));
  });

  async function renderAndFillSignUp(username: string, password: string, email: string) {
    await act(async () => { render(<App />); });

    // App defaults to sign-up mode (isSignUp = true).
    await act(async () => {
      fireEvent.change(screen.getByTestId('input-username'), { target: { value: username } });
      fireEvent.change(screen.getByTestId('input-password'), { target: { value: password } });
      fireEvent.change(screen.getByTestId('input-email'),    { target: { value: email } });
    });

    await act(async () => {
      fireEvent.submit(screen.getByTestId('form-auth'));
    });
  }

  it('shows an error when the submitted username already exists', async () => {
    await renderAndFillSignUp('alice', 'any-password', 'newalice@example.com');

    await waitFor(() => {
      expect(screen.queryByText(/already exists/i)).not.toBeNull();
    });
  });

  it('does not write a second entry to the store on duplicate sign-up', async () => {
    await renderAndFillSignUp('alice', 'any-password', 'duplicate@example.com');

    await waitFor(() => {
      expect(screen.queryByText(/already exists/i)).not.toBeNull();
    });

    const stored = JSON.parse(localStorage.getItem(USERS_KEY) ?? '[]') as unknown[];
    expect(stored).toHaveLength(1);
  });

  it('rejects a duplicate username that differs only in case', async () => {
    await renderAndFillSignUp('ALICE', 'any-password', 'upper@example.com');

    await waitFor(() => {
      expect(screen.queryByText(/already exists/i)).not.toBeNull();
    });

    const stored = JSON.parse(localStorage.getItem(USERS_KEY) ?? '[]') as unknown[];
    expect(stored).toHaveLength(1);
  });

  it('does not log the user in when a duplicate username is submitted', async () => {
    await renderAndFillSignUp('alice', 'any-password', 'newalice@example.com');

    await waitFor(() => {
      expect(screen.queryByText(/already exists/i)).not.toBeNull();
    });

    // nav-user-badge only appears after a successful login
    expect(screen.queryByTestId('nav-user-badge')).toBeNull();
  });

  it('allows sign-up with a brand-new username when the store already has users', async () => {
    await renderAndFillSignUp('bob', 'mypassword123', 'bob@example.com');

    // Successful sign-up logs the user in; nav badge should appear
    await waitFor(() => {
      expect(screen.queryByTestId('nav-user-badge')).not.toBeNull();
    });

    const stored = JSON.parse(localStorage.getItem(USERS_KEY) ?? '[]') as unknown[];
    expect(stored).toHaveLength(2);
  });
});
