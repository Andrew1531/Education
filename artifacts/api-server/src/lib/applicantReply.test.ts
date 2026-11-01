import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";
import { createHmac } from "node:crypto";

const state = vi.hoisted(() => ({
  users: [] as Record<string, unknown>[],
  proof: null as null | { userId: number; email: string; hash: string | null; expires: number; attempts: number; verified: Date | null },
  sent: [] as { email: string; code: string }[],
  sendOk: true,
  limitOk: true,
}));
vi.mock("@workspace/db", () => ({
  usersTable: {},
  db: { select: () => ({ from: () => ({ where: async () => state.users }) }) },
  pool: { query: vi.fn(async (sql: string, args: (string | number)[]) => {
    if (sql.includes("SELECT 1")) return { rows: state.proof?.userId === args[0] && state.proof.email === args[1] && state.proof.verified ? [{}] : [] };
    if (sql.includes("INSERT INTO applicant_reply")) {
      state.proof = { userId: args[1] as number, email: args[2] as string, hash: args[3] as string, expires: Date.now() + 600_000, attempts: 0, verified: null };
    }
    if (sql.includes("DELETE FROM")) state.proof = null;
    if (sql.includes("UPDATE applicant_reply")) {
      const proof = state.proof;
      if (!proof || proof.userId !== args[0] || proof.email !== args[1] || proof.expires <= Date.now() || proof.attempts >= 5 || proof.verified) return { rows: [] };
      proof.attempts++;
      if (proof.hash === args[2]) { proof.verified = new Date(); proof.hash = null; }
      return { rows: [{ verified_at: proof.verified }] };
    }
    return { rows: [] };
  }) },
}));

import { accountReplyEmail, replyVerificationRouter } from "./applicantReply";
import { issueUserToken } from "./userToken";

const app = express();
app.use(express.json());
app.use(replyVerificationRouter(async () => state.limitOk, async (email, code) => {
  state.sent.push({ email, code }); return state.sendOk;
}));
const post = (body: object) => request(app).post("/auth/school-reply-verification")
  .set("x-auth-token", issueUserToken("owner")!).send({ username: "owner", ...body });
const status = () => request(app).get("/auth/school-reply-verification?username=owner")
  .set("x-auth-token", issueUserToken("owner")!);

describe("applicant account email verification", () => {
  beforeEach(() => {
    process.env.SESSION_SECRET = "reply-verification-tests";
    state.users = [{ id: 1, username: "owner", email: "owner@example.org" }];
    state.proof = null; state.sent = []; state.limitOk = true; state.sendOk = true;
  });
  it("sends only to the server account email and stores a keyed hash, never returning the code", async () => {
    const response = await post({ action: "request", email: "attacker@example.org" });
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ email: "owner@example.org", verified: false, codeSent: true });
    expect(state.sent[0].email).toBe("owner@example.org");
    expect(state.sent[0].code).toMatch(/^\d{6}$/);
    expect(state.proof!.hash).toBe(createHmac("sha256", process.env.SESSION_SECRET!)
      .update(JSON.stringify(["applicant-reply", 1, "owner@example.org", state.sent[0].code])).digest("hex"));
    expect((await status()).body.verified).toBe(false);
    expect((await post({ action: "confirm", code: state.sent[0].code })).body.verified).toBe(true);
    expect((await status()).body.verified).toBe(true);
    expect(state.proof!.hash).toBeNull();
    expect((await post({ action: "confirm", code: state.sent[0].code })).status).toBe(400);
  });
  it("blocks expired codes and five incorrect guesses, and supersedes old codes on resend", async () => {
    await post({ action: "request" });
    const code = state.sent[0].code;
    state.proof!.expires = Date.now() - 1;
    expect((await post({ action: "confirm", code })).status).toBe(400);
    await post({ action: "request" });
    const wrong = state.sent[1].code === "000000" ? "111111" : "000000";
    for (let i = 0; i < 5; i++) expect((await post({ action: "confirm", code: wrong })).status).toBe(400);
    expect((await post({ action: "confirm", code: state.sent[1].code })).status).toBe(400);
    const oldHash = state.proof!.hash;
    await post({ action: "request" });
    expect(state.proof!.attempts).toBe(0);
    expect(state.proof!.hash).not.toBe(oldHash);
  });
  it("does not carry verification to a changed account email or another owner", async () => {
    await post({ action: "request" });
    await post({ action: "confirm", code: state.sent[0].code });
    state.users[0].email = "changed@example.org";
    expect((await status()).body).toEqual({ email: "changed@example.org", verified: false });
    expect((await post({ action: "confirm", code: state.sent[0].code })).status).toBe(400);
    expect((await request(app).get("/auth/school-reply-verification?username=other")
      .set("x-auth-token", issueUserToken("owner")!)).status).toBe(401);
  });
  it("does not inherit proof or pending codes after deleting and recreating the same username and email", async () => {
    await post({ action: "request" });
    const oldCode = state.sent[0].code;
    await post({ action: "confirm", code: oldCode });
    expect((await status()).body.verified).toBe(true);
    state.users = []; // Account deletion.
    expect((await status()).status).toBe(404);
    // Conservatively keep an old proof in the mock: ID binding alone rejects it.
    state.users = [{ id: 2, username: "owner", email: "owner@example.org" }];
    expect((await status()).body.verified).toBe(false);
    expect((await post({ action: "confirm", code: oldCode })).status).toBe(400);
    await post({ action: "request" });
    expect(state.proof!.userId).toBe(2);
    expect((await post({ action: "confirm", code: state.sent[1].code })).body.verified).toBe(true);
  });
  it("fails explicitly for unavailable sender, throttling and invalid account mailbox", async () => {
    state.sendOk = false;
    expect((await post({ action: "request" })).status).toBe(503);
    expect(state.proof).toBeNull();
    state.limitOk = false;
    expect((await post({ action: "request" })).status).toBe(429);
    expect((await post({ action: "confirm", code: "123456" })).status).toBe(429);
    state.users[0].email = "owner@example.org\r\nBcc: other@example.org";
    expect((await post({ action: "request" })).status).toBe(400);
    expect((await status()).body.email).toBeNull();
  });
  it.each(["a@example.org\r\nBcc: x@example.org", "Name <a@example.org>", "a@example.org,b@example.org", "", "a b@example.org"])(
    "rejects unsafe mailbox %s", email => expect(accountReplyEmail(email)).toBeNull(),
  );
});
