import { createHmac, randomInt } from "node:crypto";
import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, pool, usersTable } from "@workspace/db";
import { verifyUserToken } from "./userToken";

// Restrict headers to a single plain mailbox, never a display name or list.
export function accountReplyEmail(email: unknown): string | null {
  return typeof email === "string" && email.length <= 254 &&
    /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,}$/i.test(email)
    ? email : null;
}

export async function verifiedReplyEmail(userId: number, email: unknown): Promise<string | null> {
  const address = accountReplyEmail(email);
  if (!address) return null;
  const result = await pool.query(
    "SELECT 1 FROM applicant_reply_verification WHERE user_id=$1 AND email=$2 AND verified_at IS NOT NULL",
    [userId, address],
  );
  return result.rows.length ? address : null;
}

function codeHash(userId: number, email: string, code: string): string {
  return createHmac("sha256", process.env.SESSION_SECRET!)
    .update(JSON.stringify(["applicant-reply", userId, email, code])).digest("hex");
}

export function replyVerificationRouter(
  rateLimit: (username: string, ip: string, action: "reply_request" | "reply_confirm", limit: number) => Promise<boolean>,
  sendCode: (email: string, code: string) => Promise<boolean>,
): IRouter {
  const router = Router();
  router.all("/auth/school-reply-verification", async (req, res): Promise<void> => {
    const raw = req.method === "GET" ? req.query.username : req.body?.username;
    const username = typeof raw === "string" ? raw.trim() : "";
    if (!username || !verifyUserToken(username, req.header("x-auth-token"))) {
      res.status(401).json({ error: "unauthorized" }); return;
    }
    const [user] = await db.select().from(usersTable).where(eq(usersTable.username, username));
    if (!user) { res.status(404).json({ error: "not_found" }); return; }
    const email = accountReplyEmail(user.email);
    if (req.method === "GET") {
      res.json({ email, verified: !!await verifiedReplyEmail(user.id, email) }); return;
    }
    if (req.method !== "POST" || !["request", "confirm"].includes(req.body?.action)) {
      res.status(400).json({ error: "invalid_reply_verification_request" }); return;
    }
    if (!email) { res.status(400).json({ error: "account_reply_email_required" }); return; }
    const confirm = req.body.action === "confirm";
    if (confirm && (typeof req.body.code !== "string" || !/^\d{6}$/.test(req.body.code))) {
      res.status(400).json({ error: "invalid_reply_code" }); return;
    }
    if (!await rateLimit(username, req.ip ?? "", confirm ? "reply_confirm" : "reply_request", confirm ? 20 : 3)) {
      res.status(429).json({ error: "reply_verification_rate_limited" }); return;
    }
    if (confirm) {
      // One atomic update counts every guess and consumes a successful code.
      const result = await pool.query(
        `UPDATE applicant_reply_verification SET attempts=attempts+1,
          verified_at=CASE WHEN code_hash=$3 THEN now() ELSE NULL END,
          code_hash=CASE WHEN code_hash=$3 THEN NULL ELSE code_hash END
         WHERE user_id=$1 AND email=$2 AND expires_at>now() AND attempts<5 AND verified_at IS NULL
         RETURNING verified_at`,
        [user.id, email, codeHash(user.id, email, req.body.code)],
      );
      if (!result.rows[0]?.verified_at) {
        res.status(400).json({ error: "invalid_or_expired_reply_code" }); return;
      }
      res.json({ email, verified: true }); return;
    }
    const code = randomInt(0, 1_000_000).toString().padStart(6, "0");
    const hash = codeHash(user.id, email, code);
    await pool.query(
      `INSERT INTO applicant_reply_verification(username,user_id,email,code_hash,expires_at,attempts)
       VALUES($1,$2,$3,$4,now()+interval '10 minutes',0)
       ON CONFLICT(username) DO UPDATE SET user_id=$2,email=$3,code_hash=$4,expires_at=now()+interval '10 minutes',attempts=0,verified_at=NULL`,
      [username, user.id, email, hash],
    );
    let sent = false;
    try { sent = await sendCode(email, code); } catch { /* Explicit failure below; no code is exposed. */ }
    if (!sent) {
      await pool.query("DELETE FROM applicant_reply_verification WHERE user_id=$1 AND code_hash=$2", [user.id, hash]);
      res.status(503).json({ error: "reply_verification_sender_unavailable" }); return;
    }
    res.json({ email, verified: false, codeSent: true });
  });
  return router;
}
