import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { randomBytes, pbkdf2, createHash, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { eq } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";

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
  const configured = process.env.ADMIN_API_KEY;
  if (!configured) {
    if (process.env.NODE_ENV !== "production") return next();
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

// Create account
router.post("/auth/signup", async (req, res) => {
  const { username, email, password } = req.body ?? {};
  if (typeof username !== "string" || !username.trim() || typeof password !== "string" || !password) {
    return res.status(400).json({ error: "username and password are required" });
  }
  const uname = username.trim();
  const { hash, salt } = await hashPassword(password);
  // Conflict-safe insert: simultaneous signups cannot 500 on the unique index
  const inserted = await db
    .insert(usersTable)
    .values({ username: uname, email: typeof email === "string" ? email : "", passwordHash: hash, salt })
    .onConflictDoNothing({ target: usersTable.username })
    .returning();
  if (inserted.length === 0) {
    return res.status(409).json({ error: "username_taken" });
  }
  return res.status(201).json({ user: publicUser(inserted[0]!) });
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
  return res.json({ user: publicUser(user) });
});

// Self-sync: a visitor's browser pushes its own locally-stored account (and
// evaluation profile) so it appears on the central admin board. Insert is
// conflict-safe; profile fields are only filled in when currently empty, and
// only updated freely by the account owner via /auth/profile below.
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
  return res.json({ ok: true });
});

// Save the signed-in user's evaluation profile (school, country, intention…)
router.post("/auth/profile", async (req, res) => {
  const { username } = req.body ?? {};
  if (typeof username !== "string" || !username.trim()) {
    return res.status(400).json({ error: "username is required" });
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

// Admin: list all users (no password material exposed)
router.get("/users", adminGuard, async (_req, res) => {
  const rows = await db.select().from(usersTable);
  return res.json({ users: rows.map(publicUser) });
});

// Admin: import accounts that exist only in a browser's localStorage.
// Accepts already-hashed records from the frontend store; skips duplicates.
router.post("/users/import", adminGuard, async (req, res) => {
  const list = Array.isArray(req.body?.users) ? req.body.users : [];
  let imported = 0;
  for (const u of list) {
    if (typeof u?.username !== "string" || !u.username.trim() || typeof u?.password !== "string") continue;
    const inserted = await db
      .insert(usersTable)
      .values({
        username: u.username.trim(),
        email: typeof u.email === "string" ? u.email : "",
        passwordHash: u.password,
        salt: typeof u.salt === "string" ? u.salt : "",
        createdAt: u.createdAt && !Number.isNaN(Date.parse(u.createdAt)) ? new Date(u.createdAt) : new Date(),
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
  if (typeof email !== "string") return res.status(400).json({ error: "email is required" });
  const [updated] = await db
    .update(usersTable)
    .set({ email })
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
