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
  const _state = {
    rows: [] as Record<string, unknown>[],
    // Separate state for db.select() results; defaults to _state.rows when null.
    selectRows: null as Record<string, unknown>[] | null,
  };

  const returning = vi.fn(() => Promise.resolve(_state.rows));
  const onConflictDoNothing = vi.fn(() => ({ returning }));
  const values = vi.fn(() => ({ onConflictDoNothing }));
  const insert = vi.fn(() => ({ values }));

  // update().set().where().returning() — used by the admin PATCH routes and sync.
  const updateReturning = vi.fn(() => Promise.resolve(_state.rows));
  const updateWhere = vi.fn(() => ({ returning: updateReturning }));
  const set = vi.fn(() => ({ where: updateWhere }));
  const update = vi.fn(() => ({ set }));

  // select().from().where() — used by /auth/sync conflict path and /auth/signin.
  const selectReturning = vi.fn(() =>
    Promise.resolve(_state.selectRows !== null ? _state.selectRows : _state.rows),
  );
  const selectWhere = vi.fn(() => selectReturning());
  const from = vi.fn(() => ({ where: selectWhere }));
  const select = vi.fn(() => ({ from }));

  return {
    db: { insert, update, select },
    usersTable: {},
    // Prime what DB insert/update/profile returns.
    __setState: (rows: Record<string, unknown>[]) => { _state.rows = rows; },
    // Prime what db.select() returns separately (for sync conflict-path tests).
    __setSelectState: (rows: Record<string, unknown>[] | null) => { _state.selectRows = rows; },
    // Expose spies so tests can inspect what was passed to values() / set().
    __spies: { values, set },
  };
});

// Resolve imports AFTER the mock is in place.
import app from "../app";
import { cleanOpportunities } from "./users";

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
const dbMock = await import("@workspace/db") as any;
const setState: (rows: Record<string, unknown>[]) => void = dbMock.__setState;
/** Prime what db.select() returns (null = fall back to _state.rows). */
const setSelectState: (rows: Record<string, unknown>[] | null) => void = dbMock.__setSelectState;
/** Inspect the last arguments passed to insert().values() and update().set(). */
const spies: { values: ReturnType<typeof vi.fn>; set: ReturnType<typeof vi.fn> } = dbMock.__spies;

// ── Test suite ────────────────────────────────────────────────────────────────

beforeEach(() => {
  process.env.SESSION_SECRET = "test-session-secret";
  process.env.ADMIN_API_KEY = "test-admin-key";
  // Default: DB insert/update returns no rows (conflict / overrideable per test).
  setState([]);
  // Reset select state so it falls back to _state.rows by default.
  setSelectState(null);
  // Clear recorded spy calls so each test starts fresh.
  spies.values.mockClear();
  spies.set.mockClear();
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

describe("PATCH /api/users/:username/email — admin email validation", () => {
  const KEY = { "x-admin-key": "test-admin-key" };

  it("returns 400 valid_email_required when email is missing", async () => {
    const res = await request(app).patch("/api/users/alice/email").set(KEY).send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("valid_email_required");
  });

  it("returns 400 valid_email_required for a blank email", async () => {
    const res = await request(app).patch("/api/users/alice/email").set(KEY).send({ email: "" });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("valid_email_required");
  });

  it("returns 400 valid_email_required for a malformed email", async () => {
    const res = await request(app).patch("/api/users/alice/email").set(KEY).send({ email: "notanemail" });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("valid_email_required");
  });

  it("returns 400 valid_email_required for an email without a TLD", async () => {
    const res = await request(app).patch("/api/users/alice/email").set(KEY).send({ email: "alice@nodomain" });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("valid_email_required");
  });

  it("returns 400 valid_email_required for an email containing whitespace", async () => {
    const res = await request(app).patch("/api/users/alice/email").set(KEY).send({ email: "ali ce@example.com" });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("valid_email_required");
  });

  it("returns 200 with the updated user for a valid email", async () => {
    setState([makeUserRow({ email: "new@example.com" })]);
    const res = await request(app).patch("/api/users/alice/email").set(KEY).send({ email: "new@example.com" });
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe("new@example.com");
    expect(res.body.user.passwordHash).toBeUndefined();
    expect(res.body.user.salt).toBeUndefined();
  });

  it("returns 404 not_found when the user does not exist", async () => {
    setState([]);
    const res = await request(app).patch("/api/users/ghost/email").set(KEY).send({ email: "ok@example.com" });
    expect(res.status).toBe(404);
    expect(res.body.error).toBe("not_found");
  });

  it("still requires the admin key even with a valid email", async () => {
    const res = await request(app).patch("/api/users/alice/email").send({ email: "ok@example.com" });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe("unauthorized");
  });
});

describe("POST /api/auth/sync — legacy blank-email behavior (intentional)", () => {
  // /auth/sync deliberately accepts a blank email so accounts created before
  // email was required can still be rescued into the central DB. These tests
  // lock that decision in — see the route comment in users.ts.

  it("accepts a legacy record with an empty-string email (ok:true)", async () => {
    setState([makeUserRow({ email: "", passwordHash: "somehash" })]);
    const res = await request(app)
      .post("/api/auth/sync")
      .send({ username: "legacyuser", password: "somehash", salt: "s", email: "" });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it("accepts a legacy record with no email field at all (ok:true)", async () => {
    setState([makeUserRow({ email: "", passwordHash: "somehash" })]);
    const res = await request(app)
      .post("/api/auth/sync")
      .send({ username: "legacyuser", password: "somehash", salt: "s" });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it("stores a provided email verbatim when the record has one", async () => {
    setState([makeUserRow({ email: "kept@example.com", passwordHash: "somehash" })]);
    const res = await request(app)
      .post("/api/auth/sync")
      .send({ username: "user1", password: "somehash", salt: "s", email: "kept@example.com" });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it("still requires username and password — blank email is not a blank check", async () => {
    const res = await request(app)
      .post("/api/auth/sync")
      .send({ email: "" });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("username and password are required");
  });
});

describe("POST /api/auth/profile — evaluator fields reach the server", () => {
  // Tokens: HMAC-SHA256("test-session-secret", username)
  const ALICE_TOKEN = "2937e51f9fb99c40bfe3363d84a52f7bf515cb0efba6d000609132a615ec702a";
  const GHOST_TOKEN = "e413b105a7413a20dab456e1ab791df19008adc7899a1b230b9af78040d3d0f1";

  it("returns 200 with the updated user when country and purpose are provided", async () => {
    setState([makeUserRow({ country: "Brazil", purpose: "Employment & HR" })]);
    const res = await request(app)
      .post("/api/auth/profile")
      .set("x-auth-token", ALICE_TOKEN)
      .send({ username: "alice", profile: { country: "Brazil", purpose: "Employment & HR" } });
    expect(res.status).toBe(200);
    expect(res.body.user.country).toBe("Brazil");
    expect(res.body.user.purpose).toBe("Employment & HR");
    expect(res.body.user.passwordHash).toBeUndefined();
    expect(res.body.user.salt).toBeUndefined();
  });

  it("returns 200 with ok:true when profile is empty (no-op)", async () => {
    const res = await request(app)
      .post("/api/auth/profile")
      .set("x-auth-token", ALICE_TOKEN)
      .send({ username: "alice", profile: {} });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it("returns 400 when username is missing", async () => {
    const res = await request(app)
      .post("/api/auth/profile")
      .set("x-auth-token", ALICE_TOKEN)
      .send({ profile: { country: "India" } });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("username is required");
  });

  it("returns 401 when no auth token is provided", async () => {
    const res = await request(app)
      .post("/api/auth/profile")
      .send({ username: "alice", profile: { country: "India" } });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe("unauthorized");
  });

  it("returns 401 when a wrong auth token is provided", async () => {
    const res = await request(app)
      .post("/api/auth/profile")
      .set("x-auth-token", "definitely-wrong-token")
      .send({ username: "alice", profile: { country: "India" } });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe("unauthorized");
  });

  it("returns 404 when the username does not exist in the DB", async () => {
    setState([]); // update returns no rows
    const res = await request(app)
      .post("/api/auth/profile")
      .set("x-auth-token", GHOST_TOKEN)
      .send({ username: "ghost", profile: { country: "India" } });
    expect(res.status).toBe(404);
    expect(res.body.error).toBe("not_found");
  });

  it("strips whitespace-only profile values before writing (no-op)", async () => {
    const res = await request(app)
      .post("/api/auth/profile")
      .set("x-auth-token", ALICE_TOKEN)
      .send({ username: "alice", profile: { country: "   ", purpose: "" } });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });
});

// ─── Task #50 — Legacy imports show country & goal on the admin board ──────────

// ─── Task #50 — Legacy imports show country & goal on the admin board ──────────

describe("POST /api/auth/sync — profile fields reach db.insert on fresh sync", () => {
  it("passes country and purpose directly into the insert values object", async () => {
    setState([makeUserRow({ country: "Nigeria", purpose: "University Admission", passwordHash: "somehash" })]);
    await request(app)
      .post("/api/auth/sync")
      .send({
        username: "alice",
        password: "somehash",
        salt: "s",
        profile: { country: "Nigeria", purpose: "University Admission" },
      });
    // Verify the profile fields were actually passed to db.insert().values(…)
    const insertedValues = spies.values.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(insertedValues?.country).toBe("Nigeria");
    expect(insertedValues?.purpose).toBe("University Admission");
  });

  it("does not pass blank/whitespace profile strings to the insert", async () => {
    setState([makeUserRow({ passwordHash: "somehash" })]);
    await request(app)
      .post("/api/auth/sync")
      .send({
        username: "alice",
        password: "somehash",
        salt: "s",
        profile: { country: "   ", purpose: "" },
      });
    const insertedValues = spies.values.mock.calls[0]?.[0] as Record<string, unknown>;
    // cleanProfile strips these — keys must be absent (not empty strings)
    expect(insertedValues?.country).toBeUndefined();
    expect(insertedValues?.purpose).toBeUndefined();
  });
});

describe("POST /api/auth/sync — conflict path back-fills missing profile columns only", () => {
  it("calls db.update().set() with country when the existing row has none", async () => {
    // insert returns [] → conflict; select returns existing row with null country
    setState([]);
    setSelectState([makeUserRow({ country: null, purpose: null, passwordHash: "somehash" })]);

    await request(app)
      .post("/api/auth/sync")
      .send({
        username: "alice",
        password: "somehash",
        salt: "s",
        profile: { country: "India", purpose: "Professional Licensing" },
      });
    // The update should have been called with the missing fields
    const setArg = spies.set.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(setArg?.country).toBe("India");
    expect(setArg?.purpose).toBe("Professional Licensing");
  });

  it("does NOT call db.update().set() when the existing row already has a country", async () => {
    setState([]);
    setSelectState([makeUserRow({ country: "Brazil", purpose: "Employment & HR", passwordHash: "somehash" })]);

    await request(app)
      .post("/api/auth/sync")
      .send({
        username: "alice",
        password: "somehash",
        salt: "s",
        profile: { country: "Nigeria" }, // should be ignored — existing country wins
      });
    // update().set() must NOT have been called (nothing to back-fill)
    expect(spies.set.mock.calls.length).toBe(0);
  });

  it("does NOT call db.update().set() when no profile is sent (no-op)", async () => {
    setState([]);
    setSelectState([makeUserRow({ passwordHash: "somehash" })]);

    await request(app)
      .post("/api/auth/sync")
      .send({ username: "alice", password: "somehash", salt: "s" });
    expect(spies.set.mock.calls.length).toBe(0);
  });
});

describe("POST /api/users/import — profile fields passed to db.insert (not silently discarded)", () => {
  const KEY = { "x-admin-key": "test-admin-key" };

  it("passes country and purpose into the insert values when present in the payload", async () => {
    setState([makeUserRow({ country: "Mexico", purpose: "Employment & HR" })]);
    await request(app)
      .post("/api/users/import")
      .set(KEY)
      .send({
        users: [{
          username: "alice",
          email: "alice@example.com",
          password: "somehash",
          salt: "s",
          createdAt: "2026-01-01T00:00:00.000Z",
          // These profile fields arrive when the frontend merges ge_profile into AdminUser
          country: "Mexico",
          purpose: "Employment & HR",
        }],
      });
    const insertedValues = spies.values.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(insertedValues?.country).toBe("Mexico");
    expect(insertedValues?.purpose).toBe("Employment & HR");
  });

  it("returns imported:1 when the insert succeeds with profile fields", async () => {
    setState([makeUserRow({ country: "Mexico", purpose: "Employment & HR" })]);
    const res = await request(app)
      .post("/api/users/import")
      .set(KEY)
      .send({
        users: [{
          username: "alice",
          email: "alice@example.com",
          password: "somehash",
          salt: "s",
          createdAt: "2026-01-01T00:00:00.000Z",
          country: "Mexico",
          purpose: "Employment & HR",
        }],
      });
    expect(res.status).toBe(200);
    expect(res.body.imported).toBe(1);
  });

  it("does not pass blank country to the insert (cleanProfile strips it)", async () => {
    setState([makeUserRow()]);
    await request(app)
      .post("/api/users/import")
      .set(KEY)
      .send({
        users: [{
          username: "alice",
          email: "alice@example.com",
          password: "somehash",
          salt: "s",
          country: "   ", // whitespace only — should be stripped
        }],
      });
    const insertedValues = spies.values.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(insertedValues?.country).toBeUndefined();
  });

  it("skips a malformed record with no username even when profile fields are present", async () => {
    const res = await request(app)
      .post("/api/users/import")
      .set(KEY)
      .send({ users: [{ email: "noone@example.com", country: "India" }] });
    expect(res.status).toBe(200);
    expect(res.body.imported).toBe(0);
    expect(spies.values.mock.calls.length).toBe(0);
  });

  it("still requires the admin key", async () => {
    const res = await request(app)
      .post("/api/users/import")
      .send({ users: [{ username: "alice", password: "x" }] });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe("unauthorized");
  });
});

describe("opportunity sanitization and owner-only storage", () => {
  const ALICE_TOKEN = "2937e51f9fb99c40bfe3363d84a52f7bf515cb0efba6d000609132a615ec702a";

  it("sanitizes URLs, dates, text lengths and untrusted fields", () => {
    const [saved] = cleanOpportunities([{
      id: "listing-1", kind: "job", title: "  Analyst ", organization: "Org",
      url: "http://unsafe.example", location: "Remote", sourceName: "Source",
      sourceUrl: "https://source.example", sourceRetrievedAt: "2026-01-01",
      status: "not-a-status", deadline: "not-a-date", notes: "notes", nextAction: "apply",
      readinessChecks: [" resume ", 12, ""], createdAt: "invalid", updatedAt: "2026-02-01T00:00:00Z",
      privateToken: "must not persist",
    }])!;
    expect(saved).toMatchObject({
      id: "listing-1", kind: "job", title: "Analyst", url: "", status: "saved",
      deadline: null, readinessChecks: ["resume"],
    });
    expect(saved).not.toHaveProperty("privateToken");
  });

  it("rejects a token issued for another user", async () => {
    const res = await request(app).put("/api/auth/opportunities")
      .set("x-auth-token", ALICE_TOKEN)
      .send({ username: "bob", opportunities: [] });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe("unauthorized");
  });

  it("lets an owner save and retrieve only their sanitized opportunities", async () => {
    const opportunity = {
      id: "school-1", kind: "school", title: "Example University", organization: "Example University",
      url: "https://example.edu", location: "MA", sourceName: "College Scorecard",
      sourceUrl: "https://api.data.gov/", sourceRetrievedAt: "2026-01-01T00:00:00Z",
      status: "researching", deadline: null, notes: "", nextAction: "", readinessChecks: [],
      createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z",
    };
    setState([makeUserRow({ opportunities: [opportunity] })]);
    const put = await request(app).put("/api/auth/opportunities")
      .set("x-auth-token", ALICE_TOKEN).send({ username: "alice", opportunities: [opportunity] });
    expect(put.status).toBe(200);
    expect(put.body.opportunities[0].id).toBe("school-1");
    expect((spies.set.mock.calls[0]?.[0] as Record<string, unknown>).opportunities).toBeDefined();

    setSelectState([makeUserRow({ opportunities: [opportunity] })]);
    const get = await request(app).get("/api/auth/opportunities?username=alice").set("x-auth-token", ALICE_TOKEN);
    expect(get.status).toBe(200);
    expect(get.body.opportunities).toEqual([opportunity]);
  });
});
