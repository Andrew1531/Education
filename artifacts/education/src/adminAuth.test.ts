import { describe, it, expect, beforeEach } from 'vitest';
import {
  verifyAdminPass,
  setAdminPassHash,
  ADMIN_KEY,
  ADMIN_DEFAULT_PASSWORD,
} from './adminAuth';

// ─── localStorage mock for Node test environment ───────────────────────────
const store: Record<string, string> = {};
const localStorageMock = {
  getItem:    (k: string)           => store[k] ?? null,
  setItem:    (k: string, v: string) => { store[k] = v; },
  removeItem: (k: string)           => { delete store[k]; },
  clear:      ()                    => { Object.keys(store).forEach((k) => delete store[k]); },
};
Object.defineProperty(globalThis, 'localStorage', {
  value: localStorageMock,
  writable: true,
});

// ─── verifyAdminPass — first run (no key in storage) ──────────────────────

describe('verifyAdminPass — first run (key absent)', () => {
  beforeEach(() => localStorageMock.clear());

  it('accepts the default password and returns true', async () => {
    expect(await verifyAdminPass(ADMIN_DEFAULT_PASSWORD)).toBe(true);
  });

  it('initialises a PBKDF2 JSON record on first use', async () => {
    await verifyAdminPass(ADMIN_DEFAULT_PASSWORD);
    const raw = localStorage.getItem(ADMIN_KEY);
    expect(raw).not.toBeNull();
    const { hash, salt } = JSON.parse(raw!);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    expect(salt).toMatch(/^[a-f0-9]{32}$/);
  });

  it('rejects a wrong password on first run', async () => {
    expect(await verifyAdminPass('not-the-default')).toBe(false);
  });

  it('still initialises storage even when the input is wrong', async () => {
    await verifyAdminPass('wrong');
    // Key should exist now — the hash was stored from the default
    expect(localStorage.getItem(ADMIN_KEY)).not.toBeNull();
  });

  it('rejects an empty string on first run', async () => {
    expect(await verifyAdminPass('')).toBe(false);
  });
});

// ─── verifyAdminPass — PBKDF2 record already stored ───────────────────────

describe('verifyAdminPass — PBKDF2 record stored', () => {
  beforeEach(async () => {
    localStorageMock.clear();
    // Simulate a previous setAdminPassHash call
    await setAdminPassHash('custom-pass-99!');
  });

  it('accepts the correct custom password', async () => {
    expect(await verifyAdminPass('custom-pass-99!')).toBe(true);
  });

  it('rejects the wrong password', async () => {
    expect(await verifyAdminPass('wrong-pass')).toBe(false);
  });

  it('rejects the default password once a custom one is set', async () => {
    expect(await verifyAdminPass(ADMIN_DEFAULT_PASSWORD)).toBe(false);
  });
});

// ─── verifyAdminPass — corrupt / legacy fallback ───────────────────────────

describe('verifyAdminPass — corrupt or legacy stored value', () => {
  beforeEach(() => localStorageMock.clear());

  it('treats a plain-text stored value (legacy) as matching itself', async () => {
    localStorage.setItem(ADMIN_KEY, ADMIN_DEFAULT_PASSWORD);
    expect(await verifyAdminPass(ADMIN_DEFAULT_PASSWORD)).toBe(true);
  });

  it('rejects a wrong password against a plain-text stored value', async () => {
    localStorage.setItem(ADMIN_KEY, ADMIN_DEFAULT_PASSWORD);
    expect(await verifyAdminPass('wrong')).toBe(false);
  });

  it('migrates a plain-text stored value to PBKDF2 on successful verify', async () => {
    localStorage.setItem(ADMIN_KEY, ADMIN_DEFAULT_PASSWORD);
    await verifyAdminPass(ADMIN_DEFAULT_PASSWORD);
    const raw = localStorage.getItem(ADMIN_KEY);
    const { hash, salt } = JSON.parse(raw!);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    expect(salt).toBeDefined();
  });

  it('migrated PBKDF2 hash verifies correctly on a subsequent call', async () => {
    localStorage.setItem(ADMIN_KEY, ADMIN_DEFAULT_PASSWORD);
    await verifyAdminPass(ADMIN_DEFAULT_PASSWORD); // triggers migration
    // Second call should now use the stored PBKDF2 record
    expect(await verifyAdminPass(ADMIN_DEFAULT_PASSWORD)).toBe(true);
  });
});

// ─── setAdminPassHash — changing the admin password ───────────────────────

describe('setAdminPassHash — password change', () => {
  beforeEach(async () => {
    localStorageMock.clear();
    // Seed with the default so there is a prior value
    await verifyAdminPass(ADMIN_DEFAULT_PASSWORD);
  });

  it('stores a PBKDF2 JSON record with the new password', async () => {
    await setAdminPassHash('NewAdmin!Pass42');
    const raw = localStorage.getItem(ADMIN_KEY);
    const { hash, salt } = JSON.parse(raw!);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    expect(salt).toMatch(/^[a-f0-9]{32}$/);
  });

  it('new password verifies correctly after the change', async () => {
    await setAdminPassHash('NewAdmin!Pass42');
    expect(await verifyAdminPass('NewAdmin!Pass42')).toBe(true);
  });

  it('old password is rejected after the change', async () => {
    await setAdminPassHash('NewAdmin!Pass42');
    expect(await verifyAdminPass(ADMIN_DEFAULT_PASSWORD)).toBe(false);
  });

  it('each change uses a fresh salt (no salt reuse)', async () => {
    await setAdminPassHash('PassA');
    const { salt: s1 } = JSON.parse(localStorage.getItem(ADMIN_KEY)!);
    await setAdminPassHash('PassB');
    const { salt: s2 } = JSON.parse(localStorage.getItem(ADMIN_KEY)!);
    // With 16 random bytes, collision probability is negligible
    expect(s1).not.toBe(s2);
  });

  it('a second change invalidates the first custom password', async () => {
    await setAdminPassHash('First!Pass');
    await setAdminPassHash('Second!Pass');
    expect(await verifyAdminPass('First!Pass')).toBe(false);
    expect(await verifyAdminPass('Second!Pass')).toBe(true);
  });
});
