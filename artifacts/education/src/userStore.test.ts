import { describe, it, expect, beforeEach } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  USERS_KEY,
  type StoredUser,
  UserStoreCorruptError,
  getUsers,
  saveUsers,
} from './userStore';
import { StorageCorruptBanner } from './StorageCorruptBanner';

// ─── localStorage mock (Node test environment has no DOM) ──────────────────────

const store: Record<string, string> = {};
const localStorageMock = {
  getItem:    (k: string)            => store[k] ?? null,
  setItem:    (k: string, v: string) => { store[k] = v; },
  removeItem: (k: string)            => { delete store[k]; },
  clear:      ()                     => { Object.keys(store).forEach((k) => delete store[k]); },
};
Object.defineProperty(globalThis, 'localStorage', {
  value: localStorageMock,
  writable: true,
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

const validUser: StoredUser = {
  username:  'alice',
  email:     'alice@example.com',
  password:  'a'.repeat(64),   // fake 64-char hex hash
  createdAt: '2026-01-01T00:00:00.000Z',
};

// ─── getUsers — key absent ─────────────────────────────────────────────────────

describe('getUsers — key absent', () => {
  beforeEach(() => localStorageMock.clear());

  it('returns an empty array when ge_users is not set', () => {
    expect(getUsers()).toEqual([]);
  });
});

// ─── getUsers — malformed / corrupt values ────────────────────────────────────

describe('getUsers — corrupt data throws UserStoreCorruptError', () => {
  beforeEach(() => localStorageMock.clear());

  it('throws UserStoreCorruptError for invalid JSON (bad json string)', () => {
    localStorage.setItem(USERS_KEY, '{{bad json');
    expect(() => getUsers()).toThrow(UserStoreCorruptError);
  });

  it('error message mentions the key name', () => {
    localStorage.setItem(USERS_KEY, '{{bad json');
    expect(() => getUsers()).toThrow(USERS_KEY);
  });

  it('throws UserStoreCorruptError when stored value is an empty string', () => {
    localStorage.setItem(USERS_KEY, '');
    expect(() => getUsers()).toThrow(UserStoreCorruptError);
  });

  it('throws UserStoreCorruptError when stored value is a JSON object (not an array)', () => {
    localStorage.setItem(USERS_KEY, JSON.stringify({ username: 'alice' }));
    expect(() => getUsers()).toThrow(UserStoreCorruptError);
  });

  it('throws UserStoreCorruptError when stored value is a JSON string (not an array)', () => {
    localStorage.setItem(USERS_KEY, JSON.stringify('just a string'));
    expect(() => getUsers()).toThrow(UserStoreCorruptError);
  });

  it('throws UserStoreCorruptError when stored value is a JSON number', () => {
    localStorage.setItem(USERS_KEY, '42');
    expect(() => getUsers()).toThrow(UserStoreCorruptError);
  });

  it('throws UserStoreCorruptError when a record is missing the username field', () => {
    const bad = [{ email: 'x@x.com', password: 'a'.repeat(64), createdAt: '2026-01-01' }];
    localStorage.setItem(USERS_KEY, JSON.stringify(bad));
    expect(() => getUsers()).toThrow(UserStoreCorruptError);
  });

  it('throws UserStoreCorruptError when a record is missing the password field', () => {
    const bad = [{ username: 'alice', email: 'x@x.com', createdAt: '2026-01-01' }];
    localStorage.setItem(USERS_KEY, JSON.stringify(bad));
    expect(() => getUsers()).toThrow(UserStoreCorruptError);
  });

  it('throws UserStoreCorruptError when a record is missing the createdAt field', () => {
    const bad = [{ username: 'alice', email: 'x@x.com', password: 'a'.repeat(64) }];
    localStorage.setItem(USERS_KEY, JSON.stringify(bad));
    expect(() => getUsers()).toThrow(UserStoreCorruptError);
  });

  it('throws UserStoreCorruptError when a record has an empty username', () => {
    const bad = [{ username: '', email: 'x@x.com', password: 'a'.repeat(64), createdAt: '2026-01-01' }];
    localStorage.setItem(USERS_KEY, JSON.stringify(bad));
    expect(() => getUsers()).toThrow(UserStoreCorruptError);
  });

  it('does NOT throw when the stored value is a valid empty array ([])', () => {
    localStorage.setItem(USERS_KEY, '[]');
    expect(() => getUsers()).not.toThrow();
    expect(getUsers()).toEqual([]);
  });

  it('does NOT throw for a well-formed user list', () => {
    localStorage.setItem(USERS_KEY, JSON.stringify([validUser]));
    expect(() => getUsers()).not.toThrow();
    expect(getUsers()).toEqual([validUser]);
  });
});

// ─── saveUsers — round-trip validation ───────────────────────────────────────

describe('saveUsers — round-trip validation', () => {
  beforeEach(() => localStorageMock.clear());

  it('persists a valid user list so getUsers returns the same data', () => {
    saveUsers([validUser]);
    expect(getUsers()).toEqual([validUser]);
  });

  it('persists an empty array and getUsers returns []', () => {
    saveUsers([]);
    expect(getUsers()).toEqual([]);
  });

  it('overwrites the previous list on a second save', () => {
    const bob: StoredUser = {
      username:  'bob',
      email:     'bob@example.com',
      password:  'b'.repeat(64),
      createdAt: '2026-06-15T00:00:00.000Z',
    };
    saveUsers([validUser]);
    saveUsers([bob]);
    expect(getUsers()).toEqual([bob]);
  });

  it('does not write when JSON.stringify throws (circular reference)', () => {
    // Seed good data first so we can verify it is NOT overwritten.
    localStorage.setItem(USERS_KEY, JSON.stringify([validUser]));

    const circular = { ...validUser } as unknown as Record<string, unknown>;
    circular['self'] = circular; // creates a circular reference

    expect(() => saveUsers([circular as unknown as StoredUser])).toThrow();
    // The previously stored good data must be intact.
    expect(localStorage.getItem(USERS_KEY)).toBe(JSON.stringify([validUser]));
  });
});

// ─── StorageCorruptBanner — component rendering ───────────────────────────────

describe('StorageCorruptBanner', () => {
  it('renders an element with data-testid="banner-storage-corrupt"', () => {
    const html = renderToStaticMarkup(
      createElement(StorageCorruptBanner, { message: 'test error' }),
    );
    expect(html).toContain('data-testid="banner-storage-corrupt"');
  });

  it('includes the provided message in the rendered output', () => {
    const msg = 'parsed value is not an array';
    const html = renderToStaticMarkup(
      createElement(StorageCorruptBanner, { message: msg }),
    );
    expect(html).toContain(msg);
  });

  it('renders an alert role for accessibility', () => {
    const html = renderToStaticMarkup(
      createElement(StorageCorruptBanner, { message: 'err' }),
    );
    expect(html).toContain('role="alert"');
  });

  it('does not render a dismiss button when onDismiss is not provided', () => {
    const html = renderToStaticMarkup(
      createElement(StorageCorruptBanner, { message: 'err' }),
    );
    expect(html).not.toContain('data-testid="button-dismiss-storage-corrupt"');
  });

  it('renders a dismiss button when onDismiss is provided', () => {
    const html = renderToStaticMarkup(
      createElement(StorageCorruptBanner, { message: 'err', onDismiss: () => {} }),
    );
    expect(html).toContain('data-testid="button-dismiss-storage-corrupt"');
  });
});
