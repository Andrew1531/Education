/**
 * Real PostgreSQL regression tests. DATABASE_URL must point at a development/test
 * database with CREATE SCHEMA permission. Every connection is pinned to a random,
 * private schema (no public fallback); only that schema is dropped on cleanup.
 * No outbound email provider is imported or called.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";
import { createHmac } from "node:crypto";
import { drizzle } from "drizzle-orm/node-postgres";

const fixture = vi.hoisted(() => ({
  schema: `reply_test_${crypto.randomUUID().replaceAll("-", "")}`,
  nextCode: 123450,
}));

// Replace only connection wiring, not queries, transactions, or database results.
vi.mock("@workspace/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@workspace/db")>();
  const Pool = actual.pool.constructor as new (options: Partial<typeof actual.pool.options>) => typeof actual.pool;
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    options: `-c search_path=${fixture.schema}`,
    application_name: fixture.schema,
    max: 16,
    connectionTimeoutMillis: 5000,
    statement_timeout: 10000,
  });
  return { ...actual, pool, db: drizzle(pool) };
});
vi.mock("node:crypto", async (importOriginal) => ({
  ...await importOriginal<typeof import("node:crypto")>(),
  // Distinct, reproducible codes avoid a 1-in-a-million resend collision.
  randomInt: () => fixture.nextCode++,
}));

import { pool } from "@workspace/db";
import { ensureSchema } from "./migrate";
import { replyVerificationRouter, verifiedReplyEmail } from "./applicantReply";
import { issueUserToken } from "./userToken";

const username = "reply-owner";
const email = "reply-owner@example.test";
const sent: { email: string; code: string }[] = [];
const sender = vi.fn(async (address: string, code: string) => {
  sent.push({ email: address, code });
  return true;
});
const app = express();
app.use(express.json());
app.use(replyVerificationRouter(async () => true, sender));
const post = (body: object) => request(app).post("/auth/school-reply-verification")
  .set("x-auth-token", issueUserToken(username)!).send({ username, ...body });
const status = () => request(app).get("/auth/school-reply-verification")
  .query({ username }).set("x-auth-token", issueUserToken(username)!);
const confirm = (code: string) => post({ action: "confirm", code });
const proof = async () => (await pool.query(
  "SELECT * FROM applicant_reply_verification WHERE username=$1", [username],
)).rows[0];
const hash = (id: number, address: string, code: string) =>
  createHmac("sha256", process.env.SESSION_SECRET!)
    .update(JSON.stringify(["applicant-reply", id, address, code])).digest("hex");
async function insertUser() {
  return (await pool.query(
    "INSERT INTO users(username,email,password_hash) VALUES($1,$2,'test-only') RETURNING id",
    [username, email],
  )).rows[0].id as number;
}
async function requestCode() {
  const response = await post({ action: "request", email: "ignored@example.test" });
  expect(response.status).toBe(200);
  expect(response.body).toEqual({ email, verified: false, codeSent: true });
  expect(sent.at(-1)?.email).toBe(email);
  return sent.at(-1)!.code;
}

// Hold the row so all HTTP confirmations reach PostgreSQL before releasing them.
// Checking real lock waiters prevents Promise.all from accidentally testing only
// sequential updates. A spare pool connection observes the blocked sessions.
async function simultaneousConfirmations(codes: string[]) {
  const blocker = await pool.connect();
  const pending: Promise<request.Response>[] = [];
  try {
    await blocker.query("BEGIN");
    await blocker.query("SELECT 1 FROM applicant_reply_verification WHERE username=$1 FOR UPDATE", [username]);
    pending.push(...codes.map(code => confirm(code).then(response => response)));
    await vi.waitFor(async () => {
      const result = await pool.query(
        `SELECT count(*)::int AS count FROM pg_stat_activity
         WHERE application_name=$1 AND wait_event_type='Lock'
         AND query LIKE 'UPDATE applicant_reply_verification%'`,
        [fixture.schema],
      );
      expect(result.rows[0].count).toBe(codes.length);
    }, { timeout: 5000, interval: 20 });
  } finally {
    await blocker.query("ROLLBACK");
    blocker.release();
    // Drain requests even when the lock assertion fails, before fixture cleanup.
    await Promise.allSettled(pending);
  }
  return Promise.all(pending);
}

beforeAll(() => {
  vi.stubEnv("SESSION_SECRET", "isolated-reply-database-test-secret");
});
beforeEach(async () => {
  await pool.query(`DROP SCHEMA IF EXISTS "${fixture.schema}" CASCADE`);
  await pool.query(`CREATE SCHEMA "${fixture.schema}"`);
  // Pre-migration users shape, sufficient for the real Drizzle account SELECT.
  await pool.query(`CREATE TABLE users (
    id serial PRIMARY KEY, username text NOT NULL UNIQUE,
    email text NOT NULL DEFAULT '', password_hash text NOT NULL,
    salt text NOT NULL DEFAULT '', country text, institution text, degree text,
    field text, purpose text, created_at timestamptz NOT NULL DEFAULT now()
  )`);
  sent.length = 0;
  sender.mockReset().mockImplementation(async (address, code) => {
    sent.push({ email: address, code }); return true;
  });
});
afterAll(async () => {
  try {
    await pool.query(`DROP SCHEMA IF EXISTS "${fixture.schema}" CASCADE`);
  } finally {
    await pool.end();
    vi.unstubAllEnvs();
  }
});

describe("mailbox verification against PostgreSQL", { timeout: 15000 }, () => {
  let userId: number;
  beforeEach(async () => {
    await ensureSchema();
    userId = await insertUser();
  });

  it("consumes a correct code exactly once under simultaneous confirmations", async () => {
    const code = await requestCode();
    expect(await proof()).toMatchObject({ code_hash: hash(userId, email, code), attempts: 0, verified_at: null });
    const responses = await simultaneousConfirmations([code, code]);
    expect(responses.map(r => r.status).sort()).toEqual([200, 400]);
    expect(responses.find(r => r.status === 400)!.body).toEqual({ error: "invalid_or_expired_reply_code" });
    const stored = await proof();
    expect(stored).toMatchObject({ attempts: 1, code_hash: null });
    expect(stored.verified_at).toBeInstanceOf(Date);
    expect((await status()).body).toEqual({ email, verified: true });
    expect(await verifiedReplyEmail(userId, email)).toBe(email);
    expect((await confirm(code)).status).toBe(400);
    expect((await proof()).attempts).toBe(1);
  });

  it("counts exactly five guesses across concurrent requests and rejects the correct code afterward", async () => {
    const code = await requestCode();
    const responses = await simultaneousConfirmations(Array(8).fill("000000"));
    expect(responses.every(r => r.status === 400)).toBe(true);
    expect(await proof()).toMatchObject({ attempts: 5, verified_at: null, code_hash: hash(userId, email, code) });
    expect((await confirm(code)).status).toBe(400);
    expect((await proof()).attempts).toBe(5);
    expect((await status()).body.verified).toBe(false);
  });

  it("resend replaces old codes, resets exhausted attempts, and clears prior verification", async () => {
    const old = await requestCode();
    await simultaneousConfirmations(Array(5).fill("000000"));
    const fresh = await requestCode();
    expect(fresh).not.toBe(old);
    expect(await proof()).toMatchObject({ attempts: 0, code_hash: hash(userId, email, fresh), verified_at: null });
    expect((await confirm(old)).status).toBe(400);
    expect((await confirm(fresh)).status).toBe(200);
    const replacement = await requestCode();
    expect((await status()).body.verified).toBe(false);
    expect((await confirm(fresh)).status).toBe(400);
    expect((await confirm(replacement)).status).toBe(200);
  });

  it("rejects expired codes without counting a guess", async () => {
    const code = await requestCode();
    await pool.query("UPDATE applicant_reply_verification SET expires_at=now()-interval '1 second'");
    expect((await confirm(code)).status).toBe(400);
    expect(await proof()).toMatchObject({ attempts: 0, verified_at: null });
  });

  it.each([false, true])("does not reuse a changed account email's proof (verified=%s)", async verified => {
    const old = await requestCode();
    if (verified) expect((await confirm(old)).status).toBe(200);
    const changed = "changed@example.test";
    await pool.query("UPDATE users SET email=$1 WHERE id=$2", [changed, userId]);
    expect((await status()).body).toEqual({ email: changed, verified: false });
    expect(await verifiedReplyEmail(userId, changed)).toBeNull();
    expect((await confirm(old)).status).toBe(400);
    expect((await post({ action: "request" })).status).toBe(200);
    expect(sent.at(-1)!.email).toBe(changed);
    expect((await confirm(old)).status).toBe(400);
    expect((await confirm(sent.at(-1)!.code)).status).toBe(200);
    expect(await verifiedReplyEmail(userId, changed)).toBe(changed);
    expect(await verifiedReplyEmail(userId, email)).toBeNull();
  });

  it.each([false, true])("cascades account deletion and protects a recreated username (verified=%s)", async verified => {
    const code = await requestCode();
    if (verified) await confirm(code);
    await pool.query("DELETE FROM users WHERE id=$1", [userId]);
    expect(await proof()).toBeUndefined();
    expect(await insertUser()).not.toBe(userId);
    expect((await status()).body.verified).toBe(false);
    expect((await confirm(code)).status).toBe(400);
    expect((await confirm(await requestCode())).status).toBe(200);
  });

  it.each(["false", "throw"])("removes an undelivered code when the sender returns %s", async failure => {
    sender.mockImplementationOnce(async () => {
      if (failure === "throw") throw new Error("mock sender failure");
      return false;
    });
    const response = await post({ action: "request" });
    expect(response.status).toBe(503);
    expect(response.body).toEqual({ error: "reply_verification_sender_unavailable" });
    expect(await proof()).toBeUndefined();
    expect((await status()).body.verified).toBe(false);
  });

  it("does not let delayed sender-failure cleanup delete a newer resend", async () => {
    let fail!: (sent: boolean) => void;
    let entered!: () => void;
    const started = new Promise<void>(resolve => { entered = resolve; });
    const result = new Promise<boolean>(resolve => { fail = resolve; });
    let oldCode = "";
    sender.mockImplementationOnce(async (_address, code) => {
      oldCode = code;
      entered();
      return result;
    });
    const first = post({ action: "request" }).then(response => response);
    try {
      await started;
      const fresh = await requestCode();
      fail(false);
      expect((await first).status).toBe(503);
      expect(await proof()).toMatchObject({ code_hash: hash(userId, email, fresh) });
      expect((await confirm(oldCode)).status).toBe(400);
      expect((await confirm(fresh)).status).toBe(200);
    } finally {
      fail(false);
      await first;
    }
  });
});

describe("real startup migration for applicant reply verification", () => {
  it("creates the table idempotently with uniqueness, defaults, foreign key and cascade", async () => {
    await ensureSchema();
    await ensureSchema();
    const id = await insertUser();
    const insert = (name: string, userId: number) => pool.query(
      `INSERT INTO applicant_reply_verification(username,user_id,email,expires_at)
       VALUES($1,$2,$3,now()+interval '10 minutes')`, [name, userId, email],
    );
    await insert(username, id);
    expect(await proof()).toMatchObject({ attempts: 0, code_hash: null, verified_at: null });
    await expect(insert("duplicate-owner", id)).rejects.toMatchObject({ code: "23505" });
    await expect(insert("missing-owner", id + 999)).rejects.toMatchObject({ code: "23503" });
    await expect(pool.query("UPDATE applicant_reply_verification SET user_id=NULL")).rejects.toMatchObject({ code: "23502" });
    await pool.query("DELETE FROM users WHERE id=$1", [id]);
    expect(await proof()).toBeUndefined();
  });

  it("discards unsafe username-only legacy proofs instead of assigning them to today's account", async () => {
    await insertUser();
    await pool.query(`CREATE TABLE applicant_reply_verification (
      username text PRIMARY KEY, email text NOT NULL, code_hash text,
      expires_at timestamptz NOT NULL, attempts integer NOT NULL DEFAULT 0,
      verified_at timestamptz
    )`);
    await pool.query(`INSERT INTO applicant_reply_verification VALUES
      ($1,$2,NULL,now()+interval '10 minutes',1,now()),
      ('deleted-owner',$2,'old-hash',now()+interval '10 minutes',0,NULL)`, [username, email]);
    await ensureSchema();
    await ensureSchema();
    expect((await pool.query("SELECT * FROM applicant_reply_verification")).rows).toEqual([]);
    expect((await status()).body.verified).toBe(false);
    expect((await confirm(await requestCode())).status).toBe(200);
  });

  it("resumes a partial migration, removing unbound rows while preserving ID-bound proof", async () => {
    await ensureSchema();
    const id = await insertUser();
    const code = await requestCode();
    await confirm(code);
    const existing = await proof();
    await pool.query("ALTER TABLE applicant_reply_verification ALTER COLUMN user_id DROP NOT NULL");
    await pool.query("DROP INDEX applicant_reply_verification_user_idx");
    await pool.query(`INSERT INTO applicant_reply_verification(username,email,expires_at)
      VALUES('unbound-owner',$1,now())`, [email]);
    await ensureSchema();
    await ensureSchema();
    expect((await pool.query("SELECT * FROM applicant_reply_verification")).rows).toEqual([existing]);
    expect(await verifiedReplyEmail(id, email)).toBe(email);
    await expect(pool.query("UPDATE applicant_reply_verification SET user_id=NULL")).rejects.toMatchObject({ code: "23502" });
    await expect(pool.query(`INSERT INTO applicant_reply_verification(username,user_id,email,expires_at)
      VALUES('duplicate',$1,$2,now())`, [id, email])).rejects.toMatchObject({ code: "23505" });
  });
});
