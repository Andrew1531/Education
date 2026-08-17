import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Lightweight per-user auth tokens. Issued on successful signup, sign-in, or
 * self-sync (where the client proves knowledge of the stored password hash),
 * and required by endpoints that read or write per-user state, so a client
 * cannot act on another account just by naming its username.
 *
 * Token = HMAC-SHA256(SESSION_SECRET, normalized username). Stateless and
 * deterministic — no session table needed. In production a missing
 * SESSION_SECRET fails closed (no tokens issued, nothing verifies).
 */
function secret(): string | null {
  const s = process.env.SESSION_SECRET;
  if (s) return s;
  if (process.env.NODE_ENV !== "production") return "dev-session-secret";
  return null;
}

function normalize(username: string): string {
  return username.trim().toLowerCase();
}

export function issueUserToken(username: string): string | null {
  const s = secret();
  if (!s || !normalize(username)) return null;
  return createHmac("sha256", s).update(normalize(username)).digest("hex");
}

export function verifyUserToken(username: string, token: unknown): boolean {
  if (typeof token !== "string" || !token) return false;
  const expected = issueUserToken(username);
  if (!expected) return false;
  const a = Buffer.from(token);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
