const PBKDF2_ITERATIONS = 100_000;

/** Generate a random 16-byte salt as a lowercase hex string. */
function generateSalt(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Run PBKDF2-HMAC-SHA256 and return the result as a lowercase hex string. */
async function pbkdf2Hash(password: string, saltHex: string): Promise<string> {
  const enc = new TextEncoder();
  const saltBytes = new Uint8Array(saltHex.match(/../g)!.map((h) => parseInt(h, 16)));
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: saltBytes, iterations: PBKDF2_ITERATIONS },
    key,
    256,
  );
  return Array.from(new Uint8Array(bits), (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Hash a password with PBKDF2-HMAC-SHA256 (100 000 iterations).
 * Generates a fresh random salt unless one is supplied (supply it only when
 * re-deriving a hash for verification).
 */
export async function hashPassword(
  password: string,
  salt?: string,
): Promise<{ hash: string; salt: string }> {
  const s = salt ?? generateSalt();
  return { hash: await pbkdf2Hash(password, s), salt: s };
}

/**
 * True when a stored value looks like a raw 64-character hex digest.
 * This covers both legacy SHA-256 hashes (no salt) and the hash portion of a
 * PBKDF2 record — which is why callers must rely on the presence of a stored
 * salt to distinguish the two rather than this function alone.
 */
export function isHashed(s: string): boolean {
  return /^[a-f0-9]{64}$/.test(s);
}

/**
 * Verify a stored password against user input, migrating legacy hashes to
 * PBKDF2 on the fly when needed.
 *
 * - PBKDF2 path:    `storedSalt` is provided → derive and compare.
 * - Legacy SHA-256: no salt, `stored` is a 64-char hex → compare via
 *                   SHA-256, then re-hash with PBKDF2 and return the
 *                   new hash + salt for the caller to persist.
 * - Legacy plain:   no salt, not a hex digest → compare by equality,
 *                   then upgrade to PBKDF2.
 */
export async function verifyAndMigratePassword(
  stored: string,
  input: string,
  storedSalt?: string | null,
): Promise<{ valid: boolean; newHash: string | null; newSalt: string | null }> {
  // ── PBKDF2 path ──────────────────────────────────────────────────────────
  if (storedSalt) {
    const valid = (await pbkdf2Hash(input, storedSalt)) === stored;
    return { valid, newHash: null, newSalt: null };
  }

  // ── Legacy SHA-256 path ──────────────────────────────────────────────────
  if (isHashed(stored)) {
    const enc = new TextEncoder();
    const buf = await crypto.subtle.digest('SHA-256', enc.encode(input));
    const sha256 = Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
    if (sha256 === stored) {
      const { hash, salt } = await hashPassword(input);
      return { valid: true, newHash: hash, newSalt: salt };
    }
    return { valid: false, newHash: null, newSalt: null };
  }

  // ── Legacy plain-text path ───────────────────────────────────────────────
  if (stored === input) {
    const { hash, salt } = await hashPassword(input);
    return { valid: true, newHash: hash, newSalt: salt };
  }
  return { valid: false, newHash: null, newSalt: null };
}
