/** SHA-256 hex digest via Web Crypto — runs in every modern browser and Node 18+. */
export async function hashPassword(password: string): Promise<string> {
  const enc = new TextEncoder();
  const buf = await crypto.subtle.digest('SHA-256', enc.encode(password));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** True when a stored value looks like a SHA-256 hex (not a legacy plain-text entry). */
export function isHashed(s: string): boolean {
  return /^[a-f0-9]{64}$/.test(s);
}

/**
 * Compare a stored password against user input.
 * If the stored value is still plain-text (legacy), verify by equality and
 * return a new hash so the caller can upgrade the record.
 */
export async function verifyAndMigratePassword(
  stored: string,
  input: string,
): Promise<{ valid: boolean; newHash: string | null }> {
  if (isHashed(stored)) {
    return { valid: (await hashPassword(input)) === stored, newHash: null };
  }
  // Legacy plain-text: compare directly, then upgrade
  if (stored === input) {
    return { valid: true, newHash: await hashPassword(input) };
  }
  return { valid: false, newHash: null };
}
