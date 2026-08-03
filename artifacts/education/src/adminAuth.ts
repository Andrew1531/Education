import { hashPassword, verifyAndMigratePassword } from './auth';

export const ADMIN_KEY = 'ge_admin_pass';

/** Default password used on first run before any admin has changed it. */
export const ADMIN_DEFAULT_PASSWORD = 'verifed2026';

/**
 * Verify the admin password; lazily initialises the hash on first use.
 *
 * - If no key is stored: hashes the default password with PBKDF2, persists it,
 *   then checks whether `input` matches it. This means the very first call
 *   always "migrates" the implicit default into storage.
 * - If a JSON `{ hash, salt }` entry is stored: uses PBKDF2 to verify.
 * - If a legacy string entry is stored (SHA-256 hex or plain text): verifies
 *   and silently migrates to PBKDF2 on success.
 */
export async function verifyAdminPass(input: string): Promise<boolean> {
  const stored = localStorage.getItem(ADMIN_KEY);
  if (!stored) {
    // First run: hash the default password with PBKDF2 and persist it.
    const { hash, salt } = await hashPassword(ADMIN_DEFAULT_PASSWORD);
    localStorage.setItem(ADMIN_KEY, JSON.stringify({ hash, salt }));
    const check = await hashPassword(input, salt);
    return check.hash === hash;
  }

  // New format: JSON { hash, salt }
  try {
    const parsed = JSON.parse(stored) as { hash: string; salt: string };
    if (parsed.hash && parsed.salt) {
      const { valid } = await verifyAndMigratePassword(parsed.hash, input, parsed.salt);
      return valid;
    }
  } catch { /* not JSON — fall through to legacy path */ }

  // Legacy string (SHA-256 hex or plain text): verify and silently migrate.
  const { valid, newHash, newSalt } = await verifyAndMigratePassword(stored, input);
  if (valid && newHash && newSalt) {
    localStorage.setItem(ADMIN_KEY, JSON.stringify({ hash: newHash, salt: newSalt }));
  }
  return valid;
}

/** Hash `newPass` with PBKDF2 and persist it as the admin credential. */
export async function setAdminPassHash(newPass: string): Promise<void> {
  const { hash, salt } = await hashPassword(newPass);
  localStorage.setItem(ADMIN_KEY, JSON.stringify({ hash, salt }));
}
