import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { randomBytes, pbkdf2, createHash, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { eq, sql, type SQL } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
import { issueUserToken, verifyUserToken } from "../lib/userToken";

const pbkdf2Async = promisify(pbkdf2);
const router: IRouter = Router();

const ITERATIONS = 100_000;
const KEYLEN = 32;
const DIGEST = "sha256";

async function hashPassword(password: string, salt?: string) {
  const s = salt || randomBytes(16).toString("hex");
  const derived = await pbkdf2Async(password, s, ITERATIONS, KEYLEN, DIGEST);
  return { hash: derived.toString("hex"), salt: s };
}

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

/**
 * Admin guard for account-listing and account-management endpoints.
 * Requires the x-admin-key header to match the ADMIN_API_KEY secret.
 * In development (no key configured, non-production), access is allowed
 * so the local preview keeps working; in production a missing key fails
 * closed.
 */
function adminGuard(req: Request, res: Response, next: NextFunction) {
  // Fail closed in EVERY environment: without a configured key, no admin
  // access — never an open dev backdoor.
  const configured = process.env.ADMIN_API_KEY;
  if (!configured) {
    return res.status(503).json({ error: "admin_key_not_configured" });
  }
  const provided = req.header("x-admin-key") || "";
  if (!safeEqual(provided, configured)) {
    return res.status(401).json({ error: "unauthorized" });
  }
  return next();
}

interface UserRow {
  username: string;
  email: string;
  salt: string;
  createdAt: Date;
  country: string | null;
  institution: string | null;
  degree: string | null;
  field: string | null;
  purpose: string | null;
}

function publicUser(u: UserRow) {
  return {
    username: u.username,
    email: u.email,
    hasSalt: Boolean(u.salt),
    createdAt: u.createdAt.toISOString(),
    country: u.country,
    institution: u.institution,
    degree: u.degree,
    field: u.field,
    purpose: u.purpose,
  };
}

function cleanProfile(body: unknown): Partial<Record<"country" | "institution" | "degree" | "field" | "purpose", string>> {
  const src = (body ?? {}) as Record<string, unknown>;
  const out: Record<string, string> = {};
  for (const k of ["country", "institution", "degree", "field", "purpose"] as const) {
    if (typeof src[k] === "string" && (src[k] as string).trim()) out[k] = (src[k] as string).trim().slice(0, 300);
  }
  return out;
}

/** Basic email format check: something@something.tld with no whitespace. */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Create account
router.post("/auth/signup", async (req, res) => {
  const { username, email, password } = req.body ?? {};
  if (typeof username !== "string" || !username.trim() || typeof password !== "string" || !password) {
    return res.status(400).json({ error: "username and password are required" });
  }
  if (typeof email !== "string" || !EMAIL_RE.test(email.trim())) {
    return res.status(400).json({ error: "valid_email_required" });
  }
  const uname = username.trim();
  const profile = cleanProfile(req.body?.profile);
  const { hash, salt } = await hashPassword(password);
  // Conflict-safe insert: simultaneous signups cannot 500 on the unique index
  const inserted = await db
    .insert(usersTable)
    .values({ username: uname, email: email.trim(), passwordHash: hash, salt, ...profile })
    .onConflictDoNothing({ target: usersTable.username })
    .returning();
  if (inserted.length === 0) {
    return res.status(409).json({ error: "username_taken" });
  }
  return res.status(201).json({ user: publicUser(inserted[0]!), token: issueUserToken(uname) });
});

// Sign in — supports records imported from browsers that stored older
// password formats (unsalted SHA-256 hex, or plain text from the very first
// app version); those are upgraded to PBKDF2 on first successful sign-in.
router.post("/auth/signin", async (req, res) => {
  const { username, password } = req.body ?? {};
  if (typeof username !== "string" || typeof password !== "string") {
    return res.status(400).json({ error: "username and password are required" });
  }
  const [user] = await db.select().from(usersTable).where(eq(usersTable.username, username.trim()));
  if (!user) return res.status(401).json({ error: "invalid_credentials" });

  let valid = false;
  if (user.salt) {
    const { hash } = await hashPassword(password, user.salt);
    valid = safeEqual(hash, user.passwordHash);
  } else {
    // Legacy imported record: unsalted SHA-256 hex or plaintext
    const sha256 = createHash("sha256").update(password).digest("hex");
    valid = safeEqual(sha256, user.passwordHash) || safeEqual(password, user.passwordHash);
    if (valid) {
      const { hash, salt } = await hashPassword(password);
      await db.update(usersTable).set({ passwordHash: hash, salt }).where(eq(usersTable.id, user.id));
    }
  }
  if (!valid) return res.status(401).json({ error: "invalid_credentials" });
  return res.json({ user: publicUser(user), token: issueUserToken(user.username) });
});

// Self-sync: a visitor's browser pushes its own locally-stored account (and
// evaluation profile) so it appears on the central admin board. Insert is
// conflict-safe; profile fields are only filled in when currently empty, and
// only updated freely by the account owner via /auth/profile below.
//
// INTENTIONAL: unlike /auth/signup, a blank email is accepted here. This path
// exists to rescue accounts created in old app versions before email was
// required — rejecting them would silently lose those leads entirely. The
// admin board flags a missing email with "⚠ Still needed" so it is visible,
// not hidden. New signups can never take this path with a blank email: the
// current frontend requires a valid email before an account exists locally.
// Locked in by tests in users.test.ts — do not flip without updating them.
router.post("/auth/sync", async (req, res) => {
  const { username, email, password, salt, createdAt } = req.body ?? {};
  if (typeof username !== "string" || !username.trim() || typeof password !== "string") {
    return res.status(400).json({ error: "username and password are required" });
  }
  const profile = cleanProfile(req.body?.profile);
  const inserted = await db
    .insert(usersTable)
    .values({
      username: username.trim(),
      email: typeof email === "string" ? email : "",
      passwordHash: password,
      salt: typeof salt === "string" ? salt : "",
      createdAt: typeof createdAt === "string" && !Number.isNaN(Date.parse(createdAt)) ? new Date(createdAt) : new Date(),
      ...profile,
    })
    .onConflictDoNothing({ target: usersTable.username })
    .returning();
  if (inserted.length === 0 && Object.keys(profile).length > 0) {
    // Account already exists — fill in any missing profile fields
    const [existing] = await db.select().from(usersTable).where(eq(usersTable.username, username.trim()));
    if (existing) {
      const updates: Record<string, string> = {};
      for (const [k, v] of Object.entries(profile)) {
        if (!existing[k as keyof typeof existing]) updates[k] = v;
      }
      if (Object.keys(updates).length > 0) {
        await db.update(usersTable).set(updates).where(eq(usersTable.id, existing.id));
      }
    }
  }
  // Issue a token when the caller proved knowledge of the stored password
  // hash (it either just created the record, or sent a matching hash).
  const [row] = inserted.length > 0
    ? inserted
    : await db.select().from(usersTable).where(eq(usersTable.username, username.trim()));
  const token = row && safeEqual(row.passwordHash, password) ? issueUserToken(row.username) : null;
  return res.json({ ok: true, token });
});

// Save the signed-in user's evaluation profile (school, country, intention…).
// Requires the caller's x-auth-token to match the requested username, the same
// as /auth/contacted and /auth/roadmap-steps, so only the owner can update it.
router.post("/auth/profile", async (req, res) => {
  const { username } = req.body ?? {};
  if (typeof username !== "string" || !username.trim()) {
    return res.status(400).json({ error: "username is required" });
  }
  if (!verifyUserToken(username, req.header("x-auth-token"))) {
    return res.status(401).json({ error: "unauthorized" });
  }
  const profile = cleanProfile(req.body?.profile);
  if (Object.keys(profile).length === 0) return res.json({ ok: true });
  const [updated] = await db
    .update(usersTable)
    .set(profile)
    .where(eq(usersTable.username, username.trim()))
    .returning();
  if (!updated) return res.status(404).json({ error: "not_found" });
  return res.json({ user: publicUser(updated) });
});

/**
 * Sanitize a contacted-agencies map: { [agencyName]: "YYYY-MM-DD" }.
 * Returns null when the payload is not a plain object. Caps entry count and
 * string lengths so the column cannot be abused as arbitrary storage.
 * Exported for direct unit testing.
 */
export function cleanContacted(body: unknown): Record<string, string> | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const out: Record<string, string> = {};
  let count = 0;
  for (const [k, v] of Object.entries(body as Record<string, unknown>)) {
    if (typeof v !== "string" || !k.trim()) continue;
    out[k.slice(0, 200)] = v.slice(0, 40);
    if (++count >= 100) break;
  }
  return out;
}

// Fetch the signed-in user's contacted-agency checkmarks (restores them on a new device).
// Requires the caller's x-auth-token to match the requested username.
router.get("/auth/contacted", async (req, res) => {
  const username = typeof req.query.username === "string" ? req.query.username.trim() : "";
  if (!username) return res.status(400).json({ error: "username is required" });
  if (!verifyUserToken(username, req.header("x-auth-token"))) {
    return res.status(401).json({ error: "unauthorized" });
  }
  const [user] = await db.select().from(usersTable).where(eq(usersTable.username, username));
  if (!user) return res.status(404).json({ error: "not_found" });
  return res.json({ contacted: user.contactedAgencies ?? {} });
});

// Save the signed-in user's contacted-agency checkmarks.
//
// Uses a single atomic PostgreSQL JSONB merge expression so concurrent saves
// from two devices can never erase each other's checkmarks — there is no
// separate read before the write, so the TOCTOU race is eliminated entirely:
//
//   SET contacted_agencies =
//     COALESCE(contacted_agencies, '{}') || $incoming::jsonb [- $key ...]
//
// The `||` operator is applied by PostgreSQL inside the UPDATE, which holds a
// row-level lock for the duration. A second concurrent UPDATE waits for the
// first to commit, then reads the already-committed value.
//
// Explicit removals (agencies the user deliberately un-checked on this device)
// are subtracted after the union using the jsonb `-` operator so that an
// un-check propagates even when the server still has the agency from another
// device's earlier save.
router.post("/auth/contacted", async (req, res) => {
  const { username } = req.body ?? {};
  if (typeof username !== "string" || !username.trim()) {
    return res.status(400).json({ error: "username is required" });
  }
  if (!verifyUserToken(username, req.header("x-auth-token"))) {
    return res.status(401).json({ error: "unauthorized" });
  }
  const incoming = cleanContacted(req.body?.contacted);
  if (incoming === null) return res.status(400).json({ error: "contacted must be an object" });

  // Optional list of agency names explicitly un-checked by this device.
  const removals: string[] = Array.isArray(req.body?.removals)
    ? (req.body.removals as unknown[])
        .filter((k): k is string => typeof k === "string" && k.trim().length > 0)
        .slice(0, 100)
    : [];

  // Build atomic JSONB merge expression. Start with the column || incoming,
  // then subtract each explicitly removed key via the jsonb `-` operator.
  // This is a single SQL expression evaluated atomically inside the UPDATE.
  const incomingJson = JSON.stringify(incoming);
  let mergeExpr: SQL = sql`COALESCE(${usersTable.contactedAgencies}, '{}') || ${incomingJson}::jsonb`;
  for (const key of removals) {
    mergeExpr = sql`${mergeExpr} - ${key}`;
  }

  const [updated] = await db
    .update(usersTable)
    .set({ contactedAgencies: mergeExpr })
    .where(eq(usersTable.username, username.trim()))
    .returning();
  if (!updated) return res.status(404).json({ error: "not_found" });
  return res.json({ ok: true });
});

/**
 * Sanitize a roadmap-steps array: boolean[] of up to 20 elements.
 * Returns null when the payload is not an array.
 */
function cleanRoadmapSteps(body: unknown): boolean[] | null {
  if (!Array.isArray(body)) return null;
  return body.slice(0, 20).map((v) => Boolean(v));
}

// Fetch the signed-in user's roadmap step checkmarks (restores them on a new device).
// Requires the caller's x-auth-token to match the requested username.
router.get("/auth/roadmap-steps", async (req, res) => {
  const username = typeof req.query.username === "string" ? req.query.username.trim() : "";
  if (!username) return res.status(400).json({ error: "username is required" });
  if (!verifyUserToken(username, req.header("x-auth-token"))) {
    return res.status(401).json({ error: "unauthorized" });
  }
  const [user] = await db.select().from(usersTable).where(eq(usersTable.username, username));
  if (!user) return res.status(404).json({ error: "not_found" });
  return res.json({ roadmapSteps: user.roadmapSteps ?? [] });
});

// Save the signed-in user's roadmap step checkmarks (full replace).
router.post("/auth/roadmap-steps", async (req, res) => {
  const { username } = req.body ?? {};
  if (typeof username !== "string" || !username.trim()) {
    return res.status(400).json({ error: "username is required" });
  }
  if (!verifyUserToken(username, req.header("x-auth-token"))) {
    return res.status(401).json({ error: "unauthorized" });
  }
  const roadmapSteps = cleanRoadmapSteps(req.body?.roadmapSteps);
  if (roadmapSteps === null) return res.status(400).json({ error: "roadmapSteps must be an array" });
  const [updated] = await db
    .update(usersTable)
    .set({ roadmapSteps })
    .where(eq(usersTable.username, username.trim()))
    .returning();
  if (!updated) return res.status(404).json({ error: "not_found" });
  return res.json({ ok: true });
});

// Admin: list all users (no password material exposed)
router.get("/users", adminGuard, async (_req, res) => {
  const rows = await db.select().from(usersTable);
  return res.json({ users: rows.map(publicUser) });
});

// Admin: import accounts that exist only in a browser's localStorage.
// Accepts already-hashed records from the frontend store; skips duplicates.
// Profile fields (country, institution, degree, field, purpose) are preserved
// when present so the admin board shows them for pre-backend accounts.
router.post("/users/import", adminGuard, async (req, res) => {
  const list = Array.isArray(req.body?.users) ? req.body.users : [];
  let imported = 0;
  for (const u of list) {
    if (typeof u?.username !== "string" || !u.username.trim() || typeof u?.password !== "string") continue;
    const profile = cleanProfile(u);
    const inserted = await db
      .insert(usersTable)
      .values({
        username: u.username.trim(),
        email: typeof u.email === "string" ? u.email : "",
        passwordHash: u.password,
        salt: typeof u.salt === "string" ? u.salt : "",
        createdAt: u.createdAt && !Number.isNaN(Date.parse(u.createdAt)) ? new Date(u.createdAt) : new Date(),
        ...profile,
      })
      .onConflictDoNothing({ target: usersTable.username })
      .returning();
    if (inserted.length > 0) imported++;
  }
  return res.json({ imported });
});

// Admin: update a user's email
router.patch("/users/:username/email", adminGuard, async (req, res) => {
  const { email } = req.body ?? {};
  if (typeof email !== "string" || !EMAIL_RE.test(email.trim())) {
    return res.status(400).json({ error: "valid_email_required" });
  }
  const [updated] = await db
    .update(usersTable)
    .set({ email: email.trim() })
    .where(eq(usersTable.username, String(req.params.username)))
    .returning();
  if (!updated) return res.status(404).json({ error: "not_found" });
  return res.json({ user: publicUser(updated) });
});

// Admin: reset a user's password
router.patch("/users/:username/password", adminGuard, async (req, res) => {
  const { password } = req.body ?? {};
  if (typeof password !== "string" || !password) return res.status(400).json({ error: "password is required" });
  const { hash, salt } = await hashPassword(password);
  const [updated] = await db
    .update(usersTable)
    .set({ passwordHash: hash, salt })
    .where(eq(usersTable.username, String(req.params.username)))
    .returning();
  if (!updated) return res.status(404).json({ error: "not_found" });
  return res.json({ user: publicUser(updated) });
});

// Admin: delete a user
router.delete("/users/:username", adminGuard, async (req, res) => {
  const deleted = await db.delete(usersTable).where(eq(usersTable.username, String(req.params.username))).returning();
  if (deleted.length === 0) return res.status(404).json({ error: "not_found" });
  return res.json({ ok: true });
});

export default router;
