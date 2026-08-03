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
import { render, screen, waitFor, act, cleanup } from '@testing-library/react';
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
