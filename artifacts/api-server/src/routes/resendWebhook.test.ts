import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { Webhook } from "svix";

const state = vi.hoisted(() => ({
  events: new Map<string, { provider_message_id: string; status: string; occurred_at: Date }>(),
  unavailable: false,
  queries: [] as unknown[][],
}));
vi.mock("@workspace/db", () => ({
  usersTable: {},
  db: { select: () => ({ from: () => ({ where: async () => [{
    username: "owner", schoolOutreachHistory: [
      { schoolId: "old", schoolName: "Legacy", recipient: "school@example.edu", result: "sent", providerMessageId: "legacy", sentAt: "2026-01-01T00:00:00Z" },
    ],
  }] }) }) },
  pool: { query: async (sql: string, args: unknown[]) => {
    state.queries.push(args);
    if (state.unavailable) throw new Error("database offline");
    if (sql.includes("INSERT INTO school_outreach_delivery_events")) {
      if (!state.events.has(args[0] as string)) state.events.set(args[0] as string, {
        provider_message_id: args[1] as string, status: args[2] as string, occurred_at: args[3] as Date,
      });
      return { rows: [] };
    }
    if (sql.includes("SELECT outcomes")) return { rows: [{
      outcomes: [
        { schoolId: "one", schoolName: "School", recipient: "school@example.edu", result: "sent", providerMessageId: "message", sentAt: "2026-01-01T00:00:00Z" },
        { schoolId: "two", schoolName: "School", recipient: "school@example.edu", result: "sent", providerMessageId: "message", sentAt: "2026-01-01T00:00:00Z" },
      ],
    }] };
    const rank: Record<string, number> = { complained: 3, bounced: 2, failed: 2, delivered: 1, delayed: 0 };
    const rows = [...state.events.values()]
      .filter(e => (args[0] as string[]).includes(e.provider_message_id))
      .sort((a, b) => rank[b.status] - rank[a.status] || +b.occurred_at - +a.occurred_at);
    return { rows: [...new Map(rows.reverse().map(e => [e.provider_message_id, e])).values()] };
  } },
}));

import app from "../app";
import { withDelivery } from "./resendWebhook";
import { issueUserToken } from "../lib/userToken";

const secret = `whsec_${Buffer.from("webhook-tests-not-a-real-secret").toString("base64")}`;
let sequence = 0;
function event(type = "email.delivered", emailId = "message", date = "2026-01-02T00:00:00Z") {
  return JSON.stringify({ type, created_at: date, data: { email_id: emailId } });
}
function post(body = event(), id = `evt-${sequence++}`, timestamp = new Date()) {
  return request(app).post("/api/webhooks/resend")
    .set("content-type", "application/json")
    .set("svix-id", id)
    .set("svix-timestamp", String(Math.floor(+timestamp / 1000)))
    .set("svix-signature", new Webhook(secret).sign(id, timestamp, body))
    .send(body);
}
const outcome = { result: "sent" as const, providerMessageId: "message" };
describe("verified Resend delivery events", () => {
  beforeEach(() => {
    process.env.RESEND_WEBHOOK_SECRET = secret;
    process.env.SESSION_SECRET = "test-user-auth";
    state.events.clear(); state.queries = []; state.unavailable = false;
  });
  it("verifies exact raw bytes, records no email content, and deduplicates retries", async () => {
    const body = event();
    expect((await post(body, "same-event")).status).toBe(200);
    expect((await post(body, "same-event")).status).toBe(200);
    expect(state.events.size).toBe(1);
    expect((await withDelivery([outcome]))[0]).toMatchObject({ result: "sent", deliveryStatus: "delivered" });
    expect(state.queries[0]).toHaveLength(4);
  });
  it("rejects unsigned, tampered, expired and future-signed requests", async () => {
    expect((await request(app).post("/api/webhooks/resend").send(JSON.parse(event()))).status).toBe(400);
    expect((await post().set("svix-signature", "v1,invalid")).status).toBe(400);
    expect((await post(event(), "expired", new Date(Date.now() - 600_000))).status).toBe(400);
    expect((await post(event(), "future", new Date(Date.now() + 600_000))).status).toBe(400);
    const body = event();
    const timestamp = new Date();
    expect((await post(body + " ", "tampered", timestamp)
      .set("svix-signature", new Webhook(secret).sign("tampered", timestamp, body))).status).toBe(400);
    expect(state.events.size).toBe(0);
  });
  it("fails closed without a secret and returns retryable storage errors", async () => {
    delete process.env.RESEND_WEBHOOK_SECRET;
    expect((await post()).status).toBe(503);
    process.env.RESEND_WEBHOOK_SECRET = secret; state.unavailable = true;
    expect((await post()).status).toBe(503);
  });
  it("ignores opens and school replies and rejects malformed delivery payloads", async () => {
    expect((await post(event("email.opened"))).status).toBe(200);
    expect((await post(event("email.received"))).status).toBe(200);
    expect((await post(event("email.delivered", "", "bad date"))).status).toBe(400);
    expect(state.events.size).toBe(0);
  });
  it("keeps a bounce even when an earlier or later delivery arrives afterwards", async () => {
    await post(event("email.bounced"));
    await post(event("email.delivered", "message", "2026-01-01T00:00:00Z"));
    await post(event("email.delivered", "message", "2026-01-03T00:00:00Z"));
    expect((await withDelivery([outcome]))[0]).toMatchObject({ result: "sent", deliveryStatus: "bounced" });
  });
  it("preserves early events until the matching provider ID is stored; unrelated IDs never join", async () => {
    await post();
    expect(await withDelivery([{ result: "unknown", providerMessageId: null }])).toEqual([{ result: "unknown", providerMessageId: null }]);
    expect(await withDelivery([{ ...outcome, providerMessageId: "other" }])).toEqual([{ ...outcome, providerMessageId: "other" }]);
    expect((await withDelivery([outcome]))[0]).toHaveProperty("deliveryStatus", "delivered");
    expect(await withDelivery([{ ...outcome, result: "not_attempted" }])).toEqual([{ ...outcome, result: "not_attempted" }]);
  });
  it("requires the owner token for history, updates shared recipients and legacy history without rewriting acceptance", async () => {
    await post(); await post(event("email.bounced", "legacy"));
    expect((await request(app).get("/api/auth/school-outreach-history?username=owner")).status).toBe(401);
    expect((await request(app).get("/api/auth/school-outreach-history?username=owner")
      .set("x-auth-token", issueUserToken("other")!)).status).toBe(401);
    const history = await request(app).get("/api/auth/school-outreach-history?username=owner")
      .set("x-auth-token", issueUserToken("owner")!);
    expect(history.status).toBe(200);
    expect(history.body.history.map((h: { deliveryStatus: string }) => h.deliveryStatus)).toEqual(["delivered", "delivered", "bounced"]);
    expect(history.body.history.every((h: { result: string }) => h.result === "sent")).toBe(true);
  });
  it.each([
    ["email.delivery_delayed", "delayed"], ["email.failed", "failed"], ["email.complained", "complained"],
  ])("supports %s without changing the send result", async (type, status) => {
    await post(event(type));
    expect((await withDelivery([outcome]))[0]).toMatchObject({ result: "sent", deliveryStatus: status });
  });
});
