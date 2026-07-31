import { describe, it, expect } from 'vitest';
import { hashPassword, isHashed, verifyAndMigratePassword } from './auth';

// ─── hashPassword ─────────────────────────────────────────────────────────────

describe('hashPassword', () => {
  it('returns a 64-character lowercase hex string', async () => {
    const hash = await hashPassword('mypassword');
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('is deterministic — same input always yields the same hash', async () => {
    const h1 = await hashPassword('consistency');
    const h2 = await hashPassword('consistency');
    expect(h1).toBe(h2);
  });

  it('is sensitive to input — different passwords yield different hashes', async () => {
    const h1 = await hashPassword('password1');
    const h2 = await hashPassword('password2');
    expect(h1).not.toBe(h2);
  });
});

// ─── isHashed ─────────────────────────────────────────────────────────────────

describe('isHashed', () => {
  it('recognises a valid SHA-256 hex string as hashed', async () => {
    const hash = await hashPassword('test');
    expect(isHashed(hash)).toBe(true);
  });

  it('rejects a plain-text password as not hashed', () => {
    expect(isHashed('plaintext')).toBe(false);
  });

  it('rejects strings that are 64 chars but contain uppercase', () => {
    const upperHex = 'A'.repeat(64);
    expect(isHashed(upperHex)).toBe(false);
  });

  it('rejects strings that are 63 chars (too short)', () => {
    expect(isHashed('a'.repeat(63))).toBe(false);
  });
});

// ─── Sign-up: new account stores a hash (not plain text) ─────────────────────

describe('sign-up — new account stores a hash', () => {
  it('stores a hashed value, not the original password', async () => {
    const password = 'SuperSecret123';
    const stored = await hashPassword(password);
    expect(stored).not.toBe(password);
    expect(isHashed(stored)).toBe(true);
  });
});

// ─── Sign-in with correct hashed password ─────────────────────────────────────

describe('verifyAndMigratePassword — hashed stored value', () => {
  it('returns valid=true for the correct password', async () => {
    const password = 'CorrectHorseBattery';
    const stored = await hashPassword(password);
    const { valid, newHash } = await verifyAndMigratePassword(stored, password);
    expect(valid).toBe(true);
    expect(newHash).toBeNull();
  });

  it('returns valid=false for the wrong password', async () => {
    const stored = await hashPassword('actualPassword');
    const { valid, newHash } = await verifyAndMigratePassword(stored, 'wrongPassword');
    expect(valid).toBe(false);
    expect(newHash).toBeNull();
  });

  it('returns valid=false for an empty input against a hashed record', async () => {
    const stored = await hashPassword('actualPassword');
    const { valid } = await verifyAndMigratePassword(stored, '');
    expect(valid).toBe(false);
  });
});

// ─── Legacy plain-text migration ──────────────────────────────────────────────

describe('verifyAndMigratePassword — legacy plain-text stored value', () => {
  it('accepts the correct plain-text password and returns a new hash', async () => {
    const plainStored = 'legacyPassword';
    const { valid, newHash } = await verifyAndMigratePassword(plainStored, 'legacyPassword');
    expect(valid).toBe(true);
    expect(newHash).not.toBeNull();
    // The returned hash must be a proper SHA-256 hex
    expect(isHashed(newHash!)).toBe(true);
    // And must NOT equal the plain-text password
    expect(newHash).not.toBe(plainStored);
  });

  it('the migration hash matches what hashPassword produces', async () => {
    const plainStored = 'legacyPassword';
    const { newHash } = await verifyAndMigratePassword(plainStored, 'legacyPassword');
    const expected = await hashPassword('legacyPassword');
    expect(newHash).toBe(expected);
  });

  it('rejects the wrong password against a plain-text record', async () => {
    const plainStored = 'legacyPassword';
    const { valid, newHash } = await verifyAndMigratePassword(plainStored, 'wrongPassword');
    expect(valid).toBe(false);
    expect(newHash).toBeNull();
  });

  it('after migration, the new hash verifies correctly on next sign-in', async () => {
    const plainStored = 'legacyPassword';
    const { newHash } = await verifyAndMigratePassword(plainStored, 'legacyPassword');
    // Simulate next sign-in: stored is now the hash
    const { valid: validOnReauth } = await verifyAndMigratePassword(newHash!, 'legacyPassword');
    expect(validOnReauth).toBe(true);
  });
});

// ─── Admin reset: stores a new hash ───────────────────────────────────────────

describe('admin reset password — stores a new hash', () => {
  it('hashing the new password produces a valid hash (not plain text)', async () => {
    const newPass = 'AdminNewPass456!';
    const hashed = await hashPassword(newPass);
    expect(isHashed(hashed)).toBe(true);
    expect(hashed).not.toBe(newPass);
  });

  it('after reset, the new hash verifies with the new password', async () => {
    const newPass = 'AdminNewPass456!';
    const hashed = await hashPassword(newPass);
    const { valid } = await verifyAndMigratePassword(hashed, newPass);
    expect(valid).toBe(true);
  });

  it('after reset, the old password no longer works', async () => {
    const oldPass = 'OldPass123';
    const newPass = 'AdminNewPass456!';
    // Admin resets: new hash is stored
    const hashed = await hashPassword(newPass);
    // Old password must not verify against the new hash
    const { valid } = await verifyAndMigratePassword(hashed, oldPass);
    expect(valid).toBe(false);
  });
});
