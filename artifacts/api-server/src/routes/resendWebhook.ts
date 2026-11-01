import { Router, type IRouter, type RequestHandler } from "express";
import { Webhook } from "svix";
import { pool, type SchoolOutreachOutcome } from "@workspace/db";

export const resendWebhookRouter: IRouter = Router();
const statuses = {
  "email.delivered": "delivered",
  "email.bounced": "bounced",
  "email.complained": "complained",
  "email.failed": "failed",
  "email.delivery_delayed": "delayed",
} as const;

const receive: RequestHandler = async (req, res) => {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) {
    res.status(503).json({ error: "resend_webhook_not_configured" }); return;
  }
  let event: unknown;
  const eventId = req.header("svix-id");
  try {
    if (!Buffer.isBuffer(req.body) || !eventId) throw new Error("invalid_body");
    const raw = req.body.toString("utf8");
    // Svix 2.9 verifies only; it no longer returns parsed JSON.
    new Webhook(secret).verify(raw, {
      "svix-id": eventId,
      "svix-timestamp": req.header("svix-timestamp") ?? "",
      "svix-signature": req.header("svix-signature") ?? "",
    });
    event = JSON.parse(raw);
  } catch {
    res.status(400).json({ error: "invalid_webhook_signature" }); return;
  }
  if (!event || typeof event !== "object" || !("type" in event) || typeof event.type !== "string") {
    res.status(400).json({ error: "invalid_webhook_event" }); return;
  }
  if (!Object.hasOwn(statuses, event.type)) { res.json({ received: true }); return; }
  const payload = event as { type: keyof typeof statuses; created_at?: unknown; data?: { email_id?: unknown } };
  if (typeof payload.created_at !== "string" || !Number.isFinite(Date.parse(payload.created_at)) ||
      typeof payload.data?.email_id !== "string" || !payload.data.email_id || payload.data.email_id.length > 200) {
    res.status(400).json({ error: "invalid_webhook_event" }); return;
  }
  try {
    // Store only delivery metadata, never the email body or recipient. Keeping
    // verified early events also handles webhooks arriving before send storage.
    await pool.query(
      `INSERT INTO school_outreach_delivery_events(event_id,provider_message_id,status,occurred_at)
       VALUES($1,$2,$3,$4) ON CONFLICT (event_id) DO NOTHING`,
      [eventId, payload.data.email_id, statuses[payload.type], new Date(payload.created_at)],
    );
    res.json({ received: true });
  } catch {
    // Non-2xx asks Resend to retry the event, never the outreach email.
    res.status(503).json({ error: "school_outreach_storage_unavailable" });
  }
};
resendWebhookRouter.post("/webhooks/resend", receive);

/** Join only to provider IDs already stored in this owner's send history.
 * Send outcomes remain immutable. Adverse terminal events cannot be undone by
 * a delayed delivery event, regardless of webhook arrival order.
 */
export async function withDelivery<T extends Pick<SchoolOutreachOutcome, "providerMessageId" | "result">>(outcomes: T[]): Promise<T[]> {
  const ids = [...new Set(outcomes.flatMap(o => o.providerMessageId ? [o.providerMessageId] : []))];
  if (!ids.length) return outcomes;
  const { rows } = await pool.query<{
    provider_message_id: string; status: SchoolOutreachOutcome["deliveryStatus"]; occurred_at: Date;
  }>(
    `SELECT DISTINCT ON (provider_message_id) provider_message_id,status,occurred_at
     FROM school_outreach_delivery_events WHERE provider_message_id = ANY($1::text[])
     ORDER BY provider_message_id,
       CASE status WHEN 'complained' THEN 3 WHEN 'bounced' THEN 2 WHEN 'failed' THEN 2
         WHEN 'delivered' THEN 1 ELSE 0 END DESC,
       occurred_at DESC, event_id DESC`,
    [ids],
  );
  const byId = new Map(rows.map(row => [row.provider_message_id, row]));
  return outcomes.map(outcome => {
    const delivery = outcome.providerMessageId && byId.get(outcome.providerMessageId);
    return delivery && (outcome.result === "sent" || outcome.result === "unknown")
      ? { ...outcome, deliveryStatus: delivery.status, deliveryUpdatedAt: new Date(delivery.occurred_at).toISOString() }
      : outcome;
  });
}
