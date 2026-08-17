/**
 * HTTP-level tests for the /api/auth/signup endpoint.
 *
 * The database is fully mocked so no real PostgreSQL connection is needed.
 * supertest drives the Express app end-to-end, exercising the full request
 * lifecycle (JSON parsing, validation, route handler).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";

// ── Database mock ─────────────────────────────────────────────────────────────
// Declared before importing the app so Vitest hoists it above the module graph.
// The mock simulates drizzle's fluent builder: insert().values().onConflictDoNothing().returning()
vi.mock("@workspace/db", () => {
  // Mutable state shared across the builder chain.
  const _state = { rows: [] as Record<string, unknown>[] };

  const returning = vi.fn(() => Promise.resolve(_state.rows));
  const onConflictDoNothing = vi.fn(() => ({ returning }));
  const values = vi.fn(() => ({ onConflictDoNothing }));
  const insert = vi.fn(() => ({ values }));

  return {
    db: { insert },
    usersTable: {},
    // Internal test helper — lets individual tests prime what the DB returns.
    __setState: (rows: Record<string, unknown>[]) => { _state.rows = rows; },
  };
});

// Resolve imports AFTER the mock is in place.
import app from "../app";

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Mimics the shape of a freshly-inserted user row from the DB. */
function makeUserRow(overrides: Record<string, unknown> = {}) {
  return {
    username:    "alice",
    email:       "alice@example.com",
    salt:        "deadbeef",
    createdAt:   new Date(),
    country:     null,
    institution: null,
    degree:      null,
    field:       null,
    purpose:     null,
    ...overrides,
  };
}

/** Access the db mock's internal state setter (cast away unknown export). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const setState: (rows: Record<string, unknown>[]) => void =
  (await import("@workspace/db") as any).__setState;

// ── Test suite ────────────────────────────────────────────────────────────────

beforeEach(() => {
  process.env.SESSION_SECRET = "test-session-secret";
  // Default: DB insert returns no rows (conflict / overrideable per test).
  setState([]);
});

describe("POST /api/auth/signup — email validation", () => {
  it("returns 400 valid_email_required when email is absent", async () => {
    const res = await request(app)
      .post("/api/auth/signup")
      .send({ username: "alice", password: "hunter2" });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("valid_email_required");
  });

  it("returns 400 valid_email_required when email is an empty string", async () => {
    const res = await request(app)
      .post("/api/auth/signup")
      .send({ username: "alice", password: "hunter2", email: "" });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("valid_email_required");
  });

  it("returns 400 valid_email_required when email has no @ sign", async () => {
    const res = await request(app)
      .post("/api/auth/signup")
      .send({ username: "alice", password: "hunter2", email: "notanemail" });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("valid_email_required");
  });

  it("returns 400 valid_email_required when email has no TLD", async () => {
    const res = await request(app)
      .post("/api/auth/signup")
      .send({ username: "alice", password: "hunter2", email: "alice@nodomain" });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("valid_email_required");
  });

  it("returns 400 valid_email_required when email contains whitespace", async () => {
    const res = await request(app)
      .post("/api/auth/signup")
      .send({ username: "alice", password: "hunter2", email: "ali ce@example.com" });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("valid_email_required");
  });

  it("returns 201 and a user object when all fields are valid", async () => {
    // Prime the DB mock to simulate a successful insert.
    setState([makeUserRow()]);

    const res = await request(app)
      .post("/api/auth/signup")
      .send({ username: "alice", password: "hunter2", email: "alice@example.com" });

    expect(res.status).toBe(201);
    expect(res.body.user).toBeDefined();
    expect(res.body.user.username).toBe("alice");
    expect(res.body.user.email).toBe("alice@example.com");
    // Password material must never appear in the response.
    expect(res.body.user.passwordHash).toBeUndefined();
    expect(res.body.user.salt).toBeUndefined();
  });

  it("returns a token alongside the user on successful sign-up", async () => {
    setState([makeUserRow()]);

    const res = await request(app)
      .post("/api/auth/signup")
      .send({ username: "alice", password: "hunter2", email: "alice@example.com" });

    expect(res.status).toBe(201);
    expect(typeof res.body.token).toBe("string");
    expect(res.body.token.length).toBeGreaterThan(0);
  });

  it("returns 409 username_taken when the username is already registered", async () => {
    // DB returns no rows from .returning() — simulates the ON CONFLICT DO NOTHING path.
    setState([]);

    const res = await request(app)
      .post("/api/auth/signup")
      .send({ username: "alice", password: "hunter2", email: "alice@example.com" });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe("username_taken");
  });
});

describe("POST /api/auth/signup — profile fields (country + goal)", () => {
  it("includes country and purpose from the profile in the 201 response", async () => {
    setState([makeUserRow({ country: "Nigeria", purpose: "Employment & HR" })]);

    const res = await request(app)
      .post("/api/auth/signup")
      .send({
        username: "alice",
        password: "hunter2",
        email: "alice@example.com",
        profile: { country: "Nigeria", purpose: "Employment & HR" },
      });

    expect(res.status).toBe(201);
    expect(res.body.user.country).toBe("Nigeria");
    expect(res.body.user.purpose).toBe("Employment & HR");
  });

  it("returns null for profile fields when no profile is sent", async () => {
    setState([makeUserRow()]);

    const res = await request(app)
      .post("/api/auth/signup")
      .send({ username: "alice", password: "hunter2", email: "alice@example.com" });

    expect(res.status).toBe(201);
    expect(res.body.user.country).toBeNull();
    expect(res.body.user.purpose).toBeNull();
  });

  it("strips blank/whitespace-only profile strings so they never reach the DB", async () => {
    // cleanProfile on the server rejects empty/whitespace values; the row
    // comes back with the nulls we primed — not the blank strings.
    setState([makeUserRow()]);

    const res = await request(app)
      .post("/api/auth/signup")
      .send({
        username: "alice",
        password: "hunter2",
        email: "alice@example.com",
        profile: { country: "   ", purpose: "" },
      });

    expect(res.status).toBe(201);
    expect(res.body.user.country).toBeNull();
    expect(res.body.user.purpose).toBeNull();
  });

  it("accepts a partial profile (country only) and surfaces it in the response", async () => {
    setState([makeUserRow({ country: "Brazil" })]);

    const res = await request(app)
      .post("/api/auth/signup")
      .send({
        username: "alice",
        password: "hunter2",
        email: "alice@example.com",
        profile: { country: "Brazil" },
      });

    expect(res.status).toBe(201);
    expect(res.body.user.country).toBe("Brazil");
    expect(res.body.user.purpose).toBeNull();
  });

  it("does not expose password material alongside profile fields", async () => {
    setState([makeUserRow({ country: "India", purpose: "University Admission" })]);

    const res = await request(app)
      .post("/api/auth/signup")
      .send({
        username: "alice",
        password: "hunter2",
        email: "alice@example.com",
        profile: { country: "India", purpose: "University Admission" },
      });

    expect(res.status).toBe(201);
    expect(res.body.user.passwordHash).toBeUndefined();
    expect(res.body.user.salt).toBeUndefined();
    // Profile fields must be present
    expect(res.body.user.country).toBe("India");
    expect(res.body.user.purpose).toBe("University Admission");
  });
});
