import { describe, it, expect } from 'vitest';
import { hashPassword, isHashed, verifyAndMigratePassword } from './auth';

// Helper: produce a legacy SHA-256 hex without salt (simulates old stored value)
async function sha256Hex(password: string): Promise<string> {
  const enc = new TextEncoder();
  const buf = await crypto.subtle.digest('SHA-256', enc.encode(password));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
}

// ─── hashPassword ─────────────────────────────────────────────────────────────

describe('hashPassword', () => {
  it('returns a 64-character lowercase hex hash', async () => {
    const { hash } = await hashPassword('mypassword');
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('returns a 32-character lowercase hex salt', async () => {
    const { salt } = await hashPassword('mypassword');
    expect(salt).toMatch(/^[a-f0-9]{32}$/);
  });

  it('is deterministic when the same salt is reused', async () => {
    const { hash: h1, salt } = await hashPassword('consistency');
    const { hash: h2 } = await hashPassword('consistency', salt);
    expect(h1).toBe(h2);
  });

  it('produces different hashes for different passwords (same salt)', async () => {
    const { salt } = await hashPassword('password1');
    const { hash: h1 } = await hashPassword('password1', salt);
    const { hash: h2 } = await hashPassword('password2', salt);
    expect(h1).not.toBe(h2);
  });

  it('produces different hashes for the same password with different salts', async () => {
    const { hash: h1 } = await hashPassword('samepassword');
    const { hash: h2 } = await hashPassword('samepassword');
    // Extremely unlikely to collide with random 16-byte salts
    expect(h1).not.toBe(h2);
  });
});

// ─── isHashed ─────────────────────────────────────────────────────────────────

describe('isHashed', () => {
  it('recognises a PBKDF2 hash (64-char hex) as hashed', async () => {
    const { hash } = await hashPassword('test');
    expect(isHashed(hash)).toBe(true);
  });

  it('recognises a legacy SHA-256 hex as hashed', async () => {
    const legacy = await sha256Hex('test');
    expect(isHashed(legacy)).toBe(true);
  });

  it('rejects a plain-text password as not hashed', () => {
    expect(isHashed('plaintext')).toBe(false);
  });

  it('rejects strings that are 64 chars but contain uppercase', () => {
    expect(isHashed('A'.repeat(64))).toBe(false);
  });

  it('rejects strings that are 63 chars (too short)', () => {
    expect(isHashed('a'.repeat(63))).toBe(false);
  });
});

// ─── Sign-up: new account stores a PBKDF2 hash (not plain text) ──────────────

describe('sign-up — new account stores a PBKDF2 hash', () => {
  it('stores a hashed value, not the original password', async () => {
    const password = 'SuperSecret123';
    const { hash } = await hashPassword(password);
    expect(hash).not.toBe(password);
    expect(isHashed(hash)).toBe(true);
  });

  it('always produces a salt alongside the hash', async () => {
    const { salt } = await hashPassword('SuperSecret123');
    expect(salt.length).toBeGreaterThan(0);
  });
});

// ─── Sign-in with correct PBKDF2 hash ─────────────────────────────────────────

describe('verifyAndMigratePassword — PBKDF2 stored value', () => {
  it('returns valid=true for the correct password', async () => {
    const password = 'CorrectHorseBattery';
    const { hash, salt } = await hashPassword(password);
    const { valid, newHash, newSalt } = await verifyAndMigratePassword(hash, password, salt);
    expect(valid).toBe(true);
    expect(newHash).toBeNull();
    expect(newSalt).toBeNull();
  });

  it('returns valid=false for the wrong password', async () => {
    const { hash, salt } = await hashPassword('actualPassword');
    const { valid } = await verifyAndMigratePassword(hash, 'wrongPassword', salt);
    expect(valid).toBe(false);
  });

  it('returns valid=false for an empty input against a PBKDF2 record', async () => {
    const { hash, salt } = await hashPassword('actualPassword');
    const { valid } = await verifyAndMigratePassword(hash, '', salt);
    expect(valid).toBe(false);
  });
});

// ─── Legacy SHA-256 migration ─────────────────────────────────────────────────

describe('verifyAndMigratePassword — legacy SHA-256 stored value (no salt)', () => {
  it('accepts the correct password and returns a new PBKDF2 hash + salt', async () => {
    const plainStored = await sha256Hex('legacyPassword');
    const { valid, newHash, newSalt } = await verifyAndMigratePassword(plainStored, 'legacyPassword');
    expect(valid).toBe(true);
    expect(newHash).not.toBeNull();
    expect(newSalt).not.toBeNull();
    // Upgraded hash must be a proper 64-char hex
    expect(isHashed(newHash!)).toBe(true);
    // Must not equal the old SHA-256 hash
    expect(newHash).not.toBe(plainStored);
  });

  it('rejects the wrong password against a SHA-256 record', async () => {
    const plainStored = await sha256Hex('legacyPassword');
    const { valid, newHash } = await verifyAndMigratePassword(plainStored, 'wrongPassword');
    expect(valid).toBe(false);
    expect(newHash).toBeNull();
  });

  it('after migration the new PBKDF2 hash verifies correctly on next sign-in', async () => {
    const plainStored = await sha256Hex('legacyPassword');
    const { newHash, newSalt } = await verifyAndMigratePassword(plainStored, 'legacyPassword');
    // Simulate next sign-in with PBKDF2 hash + salt
    const { valid } = await verifyAndMigratePassword(newHash!, 'legacyPassword', newSalt!);
    expect(valid).toBe(true);
  });

  it('after migration the wrong password does not verify', async () => {
    const plainStored = await sha256Hex('legacyPassword');
    const { newHash, newSalt } = await verifyAndMigratePassword(plainStored, 'legacyPassword');
    const { valid } = await verifyAndMigratePassword(newHash!, 'wrongPassword', newSalt!);
    expect(valid).toBe(false);
  });
});

// ─── Legacy plain-text migration ──────────────────────────────────────────────

describe('verifyAndMigratePassword — legacy plain-text stored value', () => {
  it('accepts the correct plain-text password and returns a new PBKDF2 hash + salt', async () => {
    const { valid, newHash, newSalt } = await verifyAndMigratePassword('legacyPassword', 'legacyPassword');
    expect(valid).toBe(true);
    expect(newHash).not.toBeNull();
    expect(newSalt).not.toBeNull();
    expect(isHashed(newHash!)).toBe(true);
    expect(newHash).not.toBe('legacyPassword');
  });

  it('rejects the wrong password against a plain-text record', async () => {
    const { valid, newHash } = await verifyAndMigratePassword('legacyPassword', 'wrongPassword');
    expect(valid).toBe(false);
    expect(newHash).toBeNull();
  });

  it('after migration the new PBKDF2 hash verifies correctly on next sign-in', async () => {
    const { newHash, newSalt } = await verifyAndMigratePassword('legacyPassword', 'legacyPassword');
    const { valid } = await verifyAndMigratePassword(newHash!, 'legacyPassword', newSalt!);
    expect(valid).toBe(true);
  });
});

// ─── Admin reset: stores a new PBKDF2 hash with fresh salt ───────────────────

describe('admin reset password — stores a new PBKDF2 hash', () => {
  it('hashing the new password produces a valid hash (not plain text)', async () => {
    const { hash } = await hashPassword('AdminNewPass456!');
    expect(isHashed(hash)).toBe(true);
    expect(hash).not.toBe('AdminNewPass456!');
  });

  it('after reset, the new hash verifies with the new password', async () => {
    const { hash, salt } = await hashPassword('AdminNewPass456!');
    const { valid } = await verifyAndMigratePassword(hash, 'AdminNewPass456!', salt);
    expect(valid).toBe(true);
  });

  it('after reset, the old password no longer works', async () => {
    const { hash, salt } = await hashPassword('AdminNewPass456!');
    const { valid } = await verifyAndMigratePassword(hash, 'OldPass123', salt);
    expect(valid).toBe(false);
  });
});
