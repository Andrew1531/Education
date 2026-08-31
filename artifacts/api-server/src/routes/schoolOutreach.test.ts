import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";

vi.mock("@workspace/db", () => {
  const state = { rows: [] as Record<string, unknown>[] };
  return {
    db: {
      select: vi.fn(() => ({ from: () => ({ where: async () => state.rows }) })),
      update: vi.fn(),
      insert: vi.fn(),
      delete: vi.fn(),
    },
    pool: { connect: vi.fn(), query: vi.fn() },
    usersTable: {},
    __setOutreachUsers: (rows: Record<string, unknown>[]) => { state.rows = rows; },
  };
});

import app from "../app";
import { issueUserToken } from "../lib/userToken";
import { isPublicIp, isSameOrigin } from "./schoolOutreach";

const dbMock = await import("@workspace/db") as unknown as {
  __setOutreachUsers(rows: Record<string, unknown>[]): void;
};

describe("school outreach security and request guards", () => {
  beforeEach(() => {
    process.env.SESSION_SECRET = "school-outreach-tests";
    process.env.NODE_ENV = "test";
    dbMock.__setOutreachUsers([]);
  });

  it("rejects contact discovery for a different authenticated owner", async () => {
    const response = await request(app).post("/api/auth/schools/contacts")
      .set("x-auth-token", issueUserToken("other")!)
      .send({ username: "owner", schoolIds: ["123"] });
    expect(response.status).toBe(401);
  });

  it("rejects malformed and oversized contact ID batches", async () => {
    expect((await request(app).post("/api/auth/schools/contacts")
      .send({ username: "owner", schoolIds: Array(11).fill("123") })).status).toBe(400);
    expect((await request(app).post("/api/auth/schools/contacts")
      .send({ username: "owner", schoolIds: ["not-an-id"] })).status).toBe(400);
  });

  it("rejects duplicate school IDs during discovery", async () => {
    const response = await request(app).post("/api/auth/schools/contacts")
      .send({ username: "owner", schoolIds: ["123", "123"] });
    expect(response.status).toBe(400);
  });

  it("requires University Admission purpose before discovery", async () => {
    dbMock.__setOutreachUsers([{ username: "owner", purpose: "Employment & HR", opportunities: [{ id: "123", kind: "school" }] }]);
    const response = await request(app).post("/api/auth/schools/contacts")
      .set("x-auth-token", issueUserToken("owner")!)
      .send({ username: "owner", schoolIds: ["123"] });
    expect(response.status).toBe(403);
    expect(response.body.error).toBe("school_outreach_purpose_not_allowed");
  });

  it("requires every requested ID to be a saved school", async () => {
    dbMock.__setOutreachUsers([{ username: "owner", purpose: "University Admission", opportunities: [{ id: "999", kind: "school" }] }]);
    const response = await request(app).post("/api/auth/schools/contacts")
      .set("x-auth-token", issueUserToken("owner")!)
      .send({ username: "owner", schoolIds: ["123"] });
    expect(response.status).toBe(403);
    expect(response.body.error).toBe("school_not_saved");
  });

  it("requires explicit consent and a safe requestId for sending", async () => {
    const base = { username: "owner", schools: [{ schoolId: "123", email: "admissions@example.edu" }] };
    expect((await request(app).post("/api/auth/school-outreach")
      .send({ ...base, requestId: "1234567890abcdef", consent: false })).status).toBe(400);
    expect((await request(app).post("/api/auth/school-outreach")
      .send({ ...base, requestId: "short", consent: true })).status).toBe(400);
  });

  it("rejects duplicate school IDs regardless of recipient email", async () => {
    const response = await request(app).post("/api/auth/school-outreach").send({
      username: "owner", consent: true, requestId: "1234567890abcdef",
      schools: [
        { schoolId: "123", email: "admissions@example.edu" },
        { schoolId: "123", email: "graduate@example.edu" },
      ],
    });
    expect(response.status).toBe(400);
  });

  it("requires owner authentication for history", async () => {
    expect((await request(app).get("/api/auth/school-outreach-history")
      .query({ username: "owner" })).status).toBe(401);
  });
});

describe("pinned-fetch pure SSRF helpers", () => {
  it("accepts ordinary public IPv4 addresses", () => {
    expect(isPublicIp("8.8.8.8")).toBe(true);
  });

  it.each(["127.0.0.1", "10.1.2.3", "169.254.1.1", "192.168.1.1", "100.64.0.1", "203.0.113.8"])(
    "rejects non-public IPv4 address %s", (address) => {
      expect(isPublicIp(address)).toBe(false);
    },
  );

  it.each(["::1", "fe80::1", "fd00::1", "::ffff:127.0.0.1", "2001:db8::1"])(
    "rejects non-public IPv6 address %s", (address) => {
      expect(isPublicIp(address)).toBe(false);
    },
  );

  it("requires exact HTTPS origin for linked pages", () => {
    const official = new URL("https://college.example.edu/");
    expect(isSameOrigin(new URL("https://college.example.edu/admissions"), official)).toBe(true);
    expect(isSameOrigin(new URL("https://evil.example/admissions"), official)).toBe(false);
    expect(isSameOrigin(new URL("http://college.example.edu/admissions"), official)).toBe(false);
  });
});