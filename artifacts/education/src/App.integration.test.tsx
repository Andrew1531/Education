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
import { StorageCorruptBanner } from './StorageCorruptBanner';
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

describe('App — corrupt storage on public routes', () => {
  it('shows the friendly service-unavailable notice (not the raw corruption banner) on the home page', async () => {
    localStorage.setItem(USERS_KEY, '{{bad json');

    await act(async () => { render(<App />); });

    await waitFor(() => {
      expect(screen.queryByTestId('banner-service-unavailable')).not.toBeNull();
    });

    // The actionable corruption banner must NOT be exposed to regular visitors.
    expect(screen.queryByTestId('banner-storage-corrupt')).toBeNull();
  });

  it('shows the friendly notice when ge_users is a valid JSON object (not an array)', async () => {
    localStorage.setItem(USERS_KEY, JSON.stringify({ username: 'alice' }));

    await act(async () => { render(<App />); });

    await waitFor(() => {
      expect(screen.queryByTestId('banner-service-unavailable')).not.toBeNull();
    });

    expect(screen.queryByTestId('banner-storage-corrupt')).toBeNull();
  });

  it('does NOT show either banner when ge_users is absent (first-run)', async () => {
    await act(async () => { render(<App />); });

    await waitFor(() => {
      expect(screen.queryByTestId('banner-storage-corrupt')).toBeNull();
      expect(screen.queryByTestId('banner-service-unavailable')).toBeNull();
    });
  });

  it('does NOT show either banner when ge_users contains a valid user list', async () => {
    const validUser = {
      username:  'alice',
      email:     'alice@example.com',
      password:  'a'.repeat(64),
      createdAt: '2026-01-01T00:00:00.000Z',
    };
    localStorage.setItem(USERS_KEY, JSON.stringify([validUser]));

    await act(async () => { render(<App />); });

    await waitFor(() => {
      expect(screen.queryByTestId('banner-storage-corrupt')).toBeNull();
      expect(screen.queryByTestId('banner-service-unavailable')).toBeNull();
    });
  });

  it('does NOT show either banner when ge_users holds an empty array', async () => {
    localStorage.setItem(USERS_KEY, '[]');

    await act(async () => { render(<App />); });

    await waitFor(() => {
      expect(screen.queryByTestId('banner-storage-corrupt')).toBeNull();
      expect(screen.queryByTestId('banner-service-unavailable')).toBeNull();
    });
  });
});

// ─── StorageCorruptBanner — admin route ───────────────────────────────────────

describe('App — StorageCorruptBanner on the admin route', () => {
  // Preserve and restore window.location around each test.
  let originalLocation: Location;

  beforeEach(() => {
    originalLocation = window.location;
    localStorage.setItem(USERS_KEY, '{{bad json');

    Object.defineProperty(window, 'location', {
      configurable: true,
      writable: true,
      value: { ...originalLocation, pathname: '/admin', reload: vi.fn() },
    });

    // Navigate the jsdom history to /admin so wouter picks up the route.
    window.history.pushState({}, '', '/admin');
  });

  /**
   * These tests exercise the corrupt-store banner behind the gate, not the
   * gate itself — the gate only opens on server-side verification, so stub
   * the server to accept the key, then unlock through the UI.
   */
  async function renderUnlocked() {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      JSON.stringify([]),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    )));
    await act(async () => { render(<App />); });
    await waitFor(() => expect(screen.queryByPlaceholderText(/admin password/i)).not.toBeNull());
    fireEvent.change(screen.getByPlaceholderText(/admin password/i), { target: { value: 'test-admin-key' } });
    await act(async () => { fireEvent.click(screen.getByText('Enter')); });
    await waitFor(() => expect(screen.queryByPlaceholderText(/admin password/i)).toBeNull());
  }

  afterEach(() => {
    vi.unstubAllGlobals();
    window.history.pushState({}, '', '/');
    Object.defineProperty(window, 'location', {
      configurable: true,
      writable: true,
      value: originalLocation,
    });
  });

  it('shows the actionable corruption banner on the admin route when ge_users is corrupt', async () => {
    await renderUnlocked();

    await waitFor(() => {
      expect(screen.queryByTestId('banner-storage-corrupt')).not.toBeNull();
    });
  });

  it('shows the Clear & Reset button on the admin route when ge_users is corrupt', async () => {
    await renderUnlocked();

    await waitFor(() => {
      expect(screen.queryByTestId('button-clear-corrupt-store')).not.toBeNull();
    });
  });

  it('clicking Confirm calls localStorage.removeItem and triggers a reload', async () => {
    const removeSpy = vi.spyOn(Storage.prototype, 'removeItem');

    await renderUnlocked();

    await waitFor(() => {
      expect(screen.queryByTestId('button-clear-corrupt-store')).not.toBeNull();
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId('button-clear-corrupt-store'));
    });

    await waitFor(() => {
      expect(screen.getByTestId('modal-confirm-clear-store')).not.toBeNull();
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId('button-confirm-clear-store'));
    });

    expect(removeSpy).toHaveBeenCalledWith(USERS_KEY);
    expect(window.location.reload).toHaveBeenCalledTimes(1);
  });

  it('clicking Cancel closes the dialog without touching storage or reloading', async () => {
    const removeSpy = vi.spyOn(Storage.prototype, 'removeItem');

    await renderUnlocked();

    await waitFor(() => {
      expect(screen.queryByTestId('button-clear-corrupt-store')).not.toBeNull();
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId('button-clear-corrupt-store'));
    });

    await waitFor(() => {
      expect(screen.getByTestId('modal-confirm-clear-store')).not.toBeNull();
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId('button-cancel-clear-store'));
    });

    await waitFor(() => {
      expect(screen.queryByTestId('modal-confirm-clear-store')).toBeNull();
    });

    expect(removeSpy).not.toHaveBeenCalledWith(USERS_KEY);
    expect(window.location.reload).not.toHaveBeenCalled();
  });
});

// ─── StorageCorruptBanner — dismiss button ────────────────────────────────────

describe('StorageCorruptBanner — dismiss button', () => {
  let originalLocation: Location;

  beforeEach(() => {
    originalLocation = window.location;
    Object.defineProperty(window, 'location', {
      configurable: true,
      writable: true,
      value: { ...originalLocation, reload: vi.fn() },
    });
  });

  afterEach(() => {
    Object.defineProperty(window, 'location', {
      configurable: true,
      writable: true,
      value: originalLocation,
    });
  });

  it('renders the × button when an onDismiss prop is provided', () => {
    render(<StorageCorruptBanner message="boom" onDismiss={() => {}} />);
    expect(screen.queryByTestId('button-dismiss-storage-corrupt')).not.toBeNull();
  });

  it('does NOT render the × button when onDismiss is omitted', () => {
    render(<StorageCorruptBanner message="boom" />);
    expect(screen.queryByTestId('button-dismiss-storage-corrupt')).toBeNull();
  });

  it('clicking × calls onDismiss without touching storage or reloading', async () => {
    const onDismiss = vi.fn();
    const removeSpy = vi.spyOn(Storage.prototype, 'removeItem');

    render(<StorageCorruptBanner message="boom" onDismiss={onDismiss} />);

    await act(async () => {
      fireEvent.click(screen.getByTestId('button-dismiss-storage-corrupt'));
    });

    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(removeSpy).not.toHaveBeenCalled();
    expect(window.location.reload).not.toHaveBeenCalled();
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

// ─── Sign-up email validation ──────────────────────────────────────────────────

describe('App — sign-up rejects invalid email', () => {
  async function renderAndSubmitSignUp(username: string, password: string, email: string) {
    await act(async () => { render(<App />); });

    await act(async () => {
      fireEvent.change(screen.getByTestId('input-username'), { target: { value: username } });
      fireEvent.change(screen.getByTestId('input-password'), { target: { value: password } });
      fireEvent.change(screen.getByTestId('input-email'),    { target: { value: email } });
    });

    await act(async () => {
      fireEvent.submit(screen.getByTestId('form-auth'));
    });
  }

  it('shows the email error message when email is empty', async () => {
    await renderAndSubmitSignUp('carol', 'anypassword', '');

    await waitFor(() => {
      expect(screen.queryByText(/valid email address/i)).not.toBeNull();
    });
  });

  it('shows the email error message when email is malformed (no @)', async () => {
    await renderAndSubmitSignUp('carol', 'anypassword', 'notanemail');

    await waitFor(() => {
      expect(screen.queryByText(/valid email address/i)).not.toBeNull();
    });
  });

  it('shows the email error message when email is malformed (no TLD)', async () => {
    await renderAndSubmitSignUp('carol', 'anypassword', 'user@nodomain');

    await waitFor(() => {
      expect(screen.queryByText(/valid email address/i)).not.toBeNull();
    });
  });

  it('does not create an account when email is empty', async () => {
    await renderAndSubmitSignUp('carol', 'anypassword', '');

    await waitFor(() => {
      expect(screen.queryByText(/valid email address/i)).not.toBeNull();
    });

    // User must not be logged in
    expect(screen.queryByTestId('nav-user-badge')).toBeNull();
    // Nothing written to the store
    const stored = JSON.parse(localStorage.getItem(USERS_KEY) ?? '[]') as unknown[];
    expect(stored).toHaveLength(0);
  });

  it('does not create an account when email is malformed', async () => {
    await renderAndSubmitSignUp('carol', 'anypassword', 'bad@@email');

    await waitFor(() => {
      expect(screen.queryByText(/valid email address/i)).not.toBeNull();
    });

    expect(screen.queryByTestId('nav-user-badge')).toBeNull();
    const stored = JSON.parse(localStorage.getItem(USERS_KEY) ?? '[]') as unknown[];
    expect(stored).toHaveLength(0);
  });
});

// ─── Admin password gate ──────────────────────────────────────────────────────

describe('App — admin password gate', () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    window.history.pushState({}, '', '/admin');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    window.history.pushState({}, '', '/');
    sessionStorage.clear();
    localStorage.clear();
    cleanup();
  });

  it('shows the password gate instead of the dashboard', async () => {
    await act(async () => { render(<App />); });
    await waitFor(() => {
      expect(screen.queryByPlaceholderText(/admin password/i)).not.toBeNull();
    });
    expect(screen.queryByText(/registered account/i)).toBeNull();
  });

  it('ignores forged client-storage flags — the gate stays closed', async () => {
    // A visitor setting flags in devtools must not unlock the dashboard.
    sessionStorage.setItem('ge_admin_unlocked', '1');
    localStorage.setItem('ge_admin_unlocked', '1');

    await act(async () => { render(<App />); });

    await waitFor(() => {
      expect(screen.queryByPlaceholderText(/admin password/i)).not.toBeNull();
    });
    expect(screen.queryByText(/registered account/i)).toBeNull();
  });

  it('does not unlock from a stored admin key the server rejects', async () => {
    localStorage.setItem('ge_admin_api_key', 'forged-key');
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      JSON.stringify({ error: 'unauthorized' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } },
    )));

    await act(async () => { render(<App />); });

    // Auto-revalidation runs against the (mocked) server and is rejected.
    await waitFor(() => {
      expect(screen.queryByPlaceholderText(/admin password/i)).not.toBeNull();
    });
    expect(screen.queryByText(/registered account/i)).toBeNull();
  });

  it('rejects a wrong password and keeps the gate closed', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      JSON.stringify({ error: 'unauthorized' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } },
    )));

    await act(async () => { render(<App />); });
    await waitFor(() => expect(screen.queryByPlaceholderText(/admin password/i)).not.toBeNull());

    fireEvent.change(screen.getByPlaceholderText(/admin password/i), { target: { value: 'not-the-password' } });
    await act(async () => { fireEvent.click(screen.getByText('Enter')); });

    await waitFor(() => {
      expect(screen.queryByText(/incorrect password/i)).not.toBeNull();
    });
    expect(screen.queryByText(/registered account/i)).toBeNull();
  });

  it('unlocks when the server accepts the submitted key', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      JSON.stringify([]),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    )));

    await act(async () => { render(<App />); });
    await waitFor(() => expect(screen.queryByPlaceholderText(/admin password/i)).not.toBeNull());

    fireEvent.change(screen.getByPlaceholderText(/admin password/i), { target: { value: 'the-real-admin-key' } });
    await act(async () => { fireEvent.click(screen.getByText('Enter')); });

    await waitFor(() => {
      expect(screen.queryByPlaceholderText(/admin password/i)).toBeNull();
    });
    // The server-validated key is stored for the admin API calls.
    expect(localStorage.getItem('ge_admin_api_key')).toBe('the-real-admin-key');
  });

  it('does not claim there are zero registrations when the central list is temporarily unavailable', async () => {
    const fetchMock = vi.fn()
      // The gate verifies the submitted key successfully.
      .mockResolvedValueOnce(new Response(
        JSON.stringify({ users: [] }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ))
      // The dashboard list retries once, then reports a connection problem.
      .mockRejectedValueOnce(new TypeError('deployment is waking'))
      .mockRejectedValueOnce(new TypeError('deployment is still waking'));
    vi.stubGlobal('fetch', fetchMock);

    await act(async () => { render(<App />); });
    await waitFor(() => expect(screen.queryByPlaceholderText(/admin password/i)).not.toBeNull());

    fireEvent.change(screen.getByPlaceholderText(/admin password/i), { target: { value: 'the-real-admin-key' } });
    await act(async () => { fireEvent.click(screen.getByText('Enter')); });

    await waitFor(() => {
      expect(screen.queryByTestId('admin-connection-error')).not.toBeNull();
    });
    expect(screen.queryByText(/^No users have registered yet\.$/i)).toBeNull();
    expect(screen.queryByText(/Account count temporarily unavailable/i)).not.toBeNull();
    expect(screen.queryAllByText(/saved accounts have not been deleted/i).length).toBeGreaterThan(0);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('fails closed when the server cannot be reached — no offline bypass', async () => {
    // jsdom fetch to a relative URL fails → ApiUnavailableError. Even the
    // old local default password must NOT unlock anything.
    await act(async () => { render(<App />); });
    await waitFor(() => expect(screen.queryByPlaceholderText(/admin password/i)).not.toBeNull());

    fireEvent.change(screen.getByPlaceholderText(/admin password/i), { target: { value: 'verifed2026' } });
    await act(async () => { fireEvent.click(screen.getByText('Enter')); });

    await waitFor(() => {
      expect(screen.queryByText(/cannot be reached/i)).not.toBeNull();
    });
    expect(screen.queryByPlaceholderText(/admin password/i)).not.toBeNull();
    expect(screen.queryByText(/registered account/i)).toBeNull();
  });

  it('ignores a forged local admin credential record', async () => {
    // An attacker overwriting the device-local PBKDF2 record gains nothing:
    // authorization comes only from the server.
    localStorage.setItem('ge_admin_pass', JSON.stringify({ hash: 'attacker', salt: 'attacker' }));

    await act(async () => { render(<App />); });
    await waitFor(() => expect(screen.queryByPlaceholderText(/admin password/i)).not.toBeNull());

    fireEvent.change(screen.getByPlaceholderText(/admin password/i), { target: { value: 'anything' } });
    await act(async () => { fireEvent.click(screen.getByText('Enter')); });

    await waitFor(() => {
      expect(screen.queryByText(/cannot be reached/i)).not.toBeNull();
    });
    expect(screen.queryByText(/registered account/i)).toBeNull();
  });
});
