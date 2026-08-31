import { Router, type IRouter } from "express";
import { createHash } from "node:crypto";
import { lookup } from "node:dns/promises";
import { request as httpsRequest } from "node:https";
import { isIP, type LookupFunction } from "node:net";
import { eq } from "drizzle-orm";
import { ReplitConnectors } from "@replit/connectors-sdk";
import { db, pool, usersTable, type Opportunity, type SchoolOutreachOutcome } from "@workspace/db";
import { verifyUserToken } from "../lib/userToken";
import { resolvePublicSchool, ScorecardKeyNotConfiguredError } from "./schools";

const router: IRouter = Router();
const connector = new ReplitConnectors();
const MAX_BYTES = 512_000;
const EMAIL = /^[^\s@]+@([a-z0-9.-]+\.[a-z]{2,})$/i;
const CONTEXT = /\b(admissions?|enroll(?:ment)?|undergraduate|graduate|registrar|program)\b/i;
const REQUEST_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{15,99}$/;

export function isPublicIp(address: string): boolean {
  address = address.replace(/^\[|\]$/g, "");
  const mapped = address.toLowerCase().match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)?.[1];
  if (mapped) return isPublicIp(mapped);
  if (isIP(address) === 4) {
    const [a, b, c] = address.split(".").map(Number);
    return !(a === 0 || a === 10 || a === 127 || a >= 224 || (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) ||
      (a === 192 && b === 0) || (a === 192 && b === 2) || (a === 198 && (b === 18 || b === 19)) ||
      (a === 198 && b === 51 && c === 100) || (a === 203 && b === 0 && c === 113) || a >= 240);
  }
  const lower = address.toLowerCase();
  return isIP(address) === 6 && lower !== "::" && lower !== "::1" && !lower.startsWith("fe80:") &&
    !/^(fc|fd)[0-9a-f]{2}:/i.test(lower) && !lower.startsWith("::ffff:") &&
    !lower.startsWith("ff") && !lower.startsWith("2001:db8:") && !lower.startsWith("100:");
}

export function isSameOrigin(candidate: URL, official: URL): boolean {
  return candidate.protocol === "https:" && candidate.origin === official.origin;
}

function hostAllowed(host: string, official: string): boolean {
  const h = host.toLowerCase(), o = official.toLowerCase();
  return h === o || h.endsWith(`.${o}`) || o.endsWith(`.${h}`);
}

async function validatedTarget(url: URL): Promise<{ address: string; family: 4 | 6 }> {
  if (url.protocol !== "https:" || url.username || url.password) throw new Error("school_site_invalid");
  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  const literal = isIP(hostname);
  const answers = literal
    ? [{ address: hostname, family: literal as 4 | 6 }]
    : await lookup(hostname, { all: true, verbatim: true });
  if (!answers.length || answers.some(({ address }) => !isPublicIp(address))) throw new Error("school_site_non_public");
  return answers[0] as { address: string; family: 4 | 6 };
}

/** Resolve, validate and pin every request. The socket cannot perform a second DNS lookup. */
async function pinnedPage(url: URL): Promise<string> {
  const selected = await validatedTarget(url);
  return await new Promise<string>((resolve, reject) => {
    const pinnedLookup = ((_hostname: string, _options: unknown, callback: (error: NodeJS.ErrnoException | null, address: string, family: number) => void) => {
      callback(null, selected.address, selected.family);
    }) as LookupFunction;
    const req = httpsRequest(url, {
      method: "GET",
      headers: { accept: "text/html,application/xhtml+xml", host: url.host },
      servername: url.hostname,
      lookup: pinnedLookup,
    }, (response) => {
      if ((response.statusCode ?? 500) < 200 || (response.statusCode ?? 500) >= 300 ||
          !String(response.headers["content-type"] ?? "").toLowerCase().includes("text/html")) {
        response.resume(); reject(new Error("school_site_unavailable")); return;
      }
      const declared = Number(response.headers["content-length"] ?? 0);
      if (declared > MAX_BYTES) {
        response.destroy(); reject(new Error("school_site_too_large")); return;
      }
      const chunks: Buffer[] = []; let size = 0;
      response.on("data", (chunk: Buffer) => {
        size += chunk.length;
        if (size > MAX_BYTES) response.destroy(new Error("school_site_too_large"));
        else chunks.push(chunk);
      });
      response.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
      response.on("error", reject);
    });
    req.setTimeout(5_000, () => req.destroy(new Error("school_site_timeout")));
    req.on("error", reject);
    req.end();
  });
}

export interface Contact { email: string; sourceUrl: string }
export async function contactsForSchool(schoolId: string): Promise<{
  school: Awaited<ReturnType<typeof resolvePublicSchool>>;
  contacts: Contact[];
  fallbackUrl: string | null;
}> {
  const school = await resolvePublicSchool(schoolId);
  if (!school?.website) return { school, contacts: [], fallbackUrl: null };
  let official: URL;
  try { official = new URL(school.website); }
  catch { return { school, contacts: [], fallbackUrl: null }; }
  let html: string;
  try { html = await pinnedPage(official); }
  catch (error) {
    const code = error instanceof Error ? error.message : "";
    return { school, contacts: [], fallbackUrl: code === "school_site_invalid" || code === "school_site_non_public" ? null : official.toString() };
  }

  const contacts: Contact[] = [], found = new Set<string>();
  const scan = (source: string, text: string) => {
    for (const match of text.matchAll(/href\s*=\s*["']mailto:([^"'?#\s]+)[^"']*["']/gi)) {
      const email = decodeURIComponent(match[1]!).trim().toLowerCase(), domain = email.match(EMAIL)?.[1];
      const nearby = text.slice(Math.max(0, match.index! - 240), match.index! + match[0].length + 240).replace(/<[^>]+>/g, " ");
      if (domain && hostAllowed(domain, official.hostname) &&
          (CONTEXT.test(email.split("@")[0]!) || CONTEXT.test(nearby)) && !found.has(email)) {
        found.add(email); contacts.push({ email, sourceUrl: source });
      }
    }
  };
  scan(official.toString(), html);
  const links: URL[] = [];
  for (const match of html.matchAll(/href\s*=\s*["']([^"'#]+)["'][^>]*>([^<]{0,100})/gi)) {
    if (!CONTEXT.test(`${match[1]} ${match[2]}`)) continue;
    try {
      const candidate = new URL(match[1]!, official);
      if (isSameOrigin(candidate, official) && !links.some((link) => link.href === candidate.href)) links.push(candidate);
    } catch { /* ignore malformed links */ }
  }
  for (const link of links.slice(0, 3)) {
    try { scan(link.toString(), await pinnedPage(link)); } catch { /* isolate each linked page */ }
  }
  return { school, contacts, fallbackUrl: links[0]?.toString() ?? official.toString() };
}

async function consumeRateLimit(username: string, ip: string, action: "contacts" | "send", limit: number): Promise<boolean> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("DELETE FROM school_request_attempts WHERE attempted_at < now() - interval '24 hours'");
    for (const [scope, actor] of [["account", username], ["ip", ip || "unknown"]]) {
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))", [`school:${action}:${scope}`, actor]);
      const result = await client.query<{ count: string }>(
        "SELECT count(*)::text AS count FROM school_request_attempts WHERE scope=$1 AND actor=$2 AND action=$3 AND attempted_at >= now() - interval '1 hour'",
        [scope, actor, action],
      );
      if (Number(result.rows[0]?.count ?? 0) >= limit) {
        await client.query("ROLLBACK"); return false;
      }
    }
    const now = new Date();
    await client.query(
      "INSERT INTO school_request_attempts(scope, actor, action, attempted_at) VALUES ('account',$1,$3,$4),('ip',$2,$3,$4)",
      [username, ip || "unknown", action, now],
    );
    await client.query("COMMIT");
    return true;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally { client.release(); }
}

function savedSchoolIds(opportunities: Opportunity[] | null | undefined): Set<string> {
  return new Set((opportunities ?? []).filter((o) => o.kind === "school").map((o) => o.id));
}

async function authorizedUser(username: string, ids: string[]) {
  const [user] = await db.select().from(usersTable).where(eq(usersTable.username, username));
  if (!user) return { error: "not_found" as const, user: null };
  if (user.purpose !== "University Admission") return { error: "school_outreach_purpose_not_allowed" as const, user: null };
  const saved = savedSchoolIds(user.opportunities);
  if (ids.some((id) => !saved.has(id))) return { error: "school_not_saved" as const, user: null };
  return { error: null, user };
}

router.post("/auth/schools/contacts", async (req, res): Promise<void> => {
  const username = typeof req.body?.username === "string" ? req.body.username.trim() : "";
  const ids = req.body?.schoolIds;
  if (!username || !Array.isArray(ids) || !ids.length || ids.length > 10 ||
      ids.some((id) => typeof id !== "string" || !/^\d{1,12}$/.test(id)) || new Set(ids).size !== ids.length) {
    res.status(400).json({ error: "invalid_school_contacts_request" }); return;
  }
  if (!verifyUserToken(username, req.header("x-auth-token"))) { res.status(401).json({ error: "unauthorized" }); return; }
  const auth = await authorizedUser(username, ids);
  if (auth.error) { res.status(auth.error === "not_found" ? 404 : 403).json({ error: auth.error }); return; }
  try {
    if (!await consumeRateLimit(username, req.ip ?? "", "contacts", 30)) {
      res.status(429).json({ error: "school_contacts_rate_limited" }); return;
    }
  } catch {
    res.status(503).json({ error: "school_rate_limiter_unavailable" }); return;
  }
  const contacts = await Promise.all(ids.map(async (schoolId) => {
    try {
      const result = await contactsForSchool(schoolId);
      const status = result.contacts.length ? "verified" : result.fallbackUrl ? "fallback" : "unavailable";
      return { schoolId, schoolName: result.school?.name ?? null, status, recipients: result.contacts,
        fallbackUrl: result.fallbackUrl, ...(status === "unavailable" ? { error: "school_contact_unavailable" } : {}) };
    } catch (error) {
      return { schoolId, schoolName: null, status: "unavailable" as const, recipients: [], fallbackUrl: null,
        error: error instanceof ScorecardKeyNotConfiguredError ? "college_scorecard_api_key_not_configured" : "school_contact_unavailable" };
    }
  }));
  if (contacts.some((item) => item.error === "college_scorecard_api_key_not_configured")) {
    res.status(503).json({ error: "college_scorecard_api_key_not_configured" }); return;
  }
  res.json({ contacts });
});

function esc(s: string | null | undefined): string {
  return String(s || "Not provided").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}
function packageFor(user: { institution: string | null; country: string | null; degree: string | null; field: string | null; purpose: string | null }) {
  const fields = [["Institution / Institución", user.institution], ["Country / País", user.country], ["Entered credential / Credencial ingresada", user.degree], ["Field / Campo", user.field], ["Purpose / Propósito", user.purpose]];
  const disclaimer = "VerifED is forwarding self-reported information and is not an official equivalency or admission determination. / VerifED transmite información autodeclarada y no es una determinación oficial de equivalencia o admisión.";
  return {
    text: `${disclaimer}\n\n${fields.map(([k, v]) => `${k}: ${v || "Not provided"}`).join("\n")}`,
    html: `<p><strong>${esc(disclaimer)}</strong></p><table>${fields.map(([k, v]) => `<tr><th align="left">${esc(k)}</th><td>${esc(v)}</td></tr>`).join("")}</table>`,
  };
}

async function sender(): Promise<string | null> {
  if (process.env.SCHOOL_OUTREACH_FROM) return process.env.SCHOOL_OUTREACH_FROM;
  const response = await connector.proxy("resend", "/domains", { method: "GET" });
  if (!response.ok) return null;
  const data = await response.json() as { data?: Array<{ name?: string; status?: string }> };
  const domain = data.data?.find((d) => d.status === "verified" && d.name)?.name;
  return domain ? `VerifED <outreach@${domain}>` : null;
}

router.post("/auth/school-outreach", async (req, res): Promise<void> => {
  const username = typeof req.body?.username === "string" ? req.body.username.trim() : "";
  const schools = req.body?.schools, requestId = req.body?.requestId;
  if (!username || req.body?.consent !== true || typeof requestId !== "string" || !REQUEST_ID.test(requestId) ||
      !Array.isArray(schools) || !schools.length || schools.length > 10 ||
      schools.some((s) => !s || typeof s.schoolId !== "string" || !/^\d{1,12}$/.test(s.schoolId) || typeof s.email !== "string" || !EMAIL.test(s.email)) ||
      new Set(schools.map((s) => s.schoolId)).size !== schools.length) {
    res.status(400).json({ error: "invalid_school_outreach_request" }); return;
  }
  if (!verifyUserToken(username, req.header("x-auth-token"))) { res.status(401).json({ error: "unauthorized" }); return; }
  const normalized = schools.map((s) => ({ schoolId: s.schoolId, email: s.email.toLowerCase() }));
  const auth = await authorizedUser(username, normalized.map((s) => s.schoolId));
  if (auth.error) { res.status(auth.error === "not_found" ? 404 : 403).json({ error: auth.error }); return; }
  const requestHash = createHash("sha256").update(JSON.stringify(normalized)).digest("hex");

  let intent;
  try {
    const inserted = await pool.query(
      `INSERT INTO school_outreach_requests(idempotency_key,username,request_hash,schools,status)
       VALUES($1,$2,$3,$4::jsonb,'processing') ON CONFLICT DO NOTHING RETURNING *`,
      [requestId, username, requestHash, JSON.stringify(normalized)],
    );
    intent = inserted.rows[0] ?? (await pool.query("SELECT * FROM school_outreach_requests WHERE idempotency_key=$1", [requestId])).rows[0];
  } catch {
    res.status(503).json({ error: "school_outreach_storage_unavailable" }); return;
  }
  if (!intent || intent.username !== username || intent.request_hash !== requestHash) {
    res.status(409).json({ error: "school_outreach_request_id_conflict" }); return;
  }
  if (intent.status === "completed" && Array.isArray(intent.outcomes)) {
    res.json({ results: intent.outcomes, meaning: "sent means the email provider accepted the send request" }); return;
  }
  try {
    if (!await consumeRateLimit(username, req.ip ?? "", "send", 3)) {
      res.status(429).json({ error: "school_outreach_rate_limited" }); return;
    }
  } catch {
    res.status(503).json({ error: "school_rate_limiter_unavailable" }); return;
  }

  const resolved = await Promise.all(normalized.map(async (request) => {
    try { return { request, found: await contactsForSchool(request.schoolId) }; }
    catch (error) { return { request, found: null, error }; }
  }));
  if (resolved.some((item) => item.error instanceof ScorecardKeyNotConfiguredError)) {
    res.status(503).json({ error: "college_scorecard_api_key_not_configured" }); return;
  }
  if (resolved.some(({ request, found }) => !found?.school || !found.contacts.some((c) => c.email === request.email))) {
    res.status(400).json({ error: "unverified_school_recipient" }); return;
  }
  let from: string | null;
  try { from = await sender(); } catch { from = null; }
  if (!from) { res.status(503).json({ error: "school_outreach_sender_unavailable" }); return; }

  const content = packageFor(auth.user!), outcomes: SchoolOutreachOutcome[] = [];
  for (const { request, found } of resolved) {
    const contact = found!.contacts.find((c) => c.email === request.email)!;
    const sentAt = new Date().toISOString();
    try {
      const providerKey = createHash("sha256").update(`${requestId}:${request.schoolId}`).digest("hex");
      const response = await connector.proxy("resend", "/emails", {
        method: "POST",
        headers: { "content-type": "application/json", "Idempotency-Key": providerKey },
        body: { from, to: [contact.email], subject: "VerifED credential information / información de credenciales", html: content.html, text: content.text },
      });
      const payload = response.ok ? await response.json().catch(() => ({})) as { id?: string } : {};
      outcomes.push({ packageVersion: "1", schoolId: request.schoolId, schoolName: found!.school!.name,
        recipient: contact.email, recipientSourceUrl: contact.sourceUrl, result: response.ok ? "sent" : "failed",
        providerMessageId: response.ok ? payload.id ?? null : null, sentAt });
    } catch {
      outcomes.push({ packageVersion: "1", schoolId: request.schoolId, schoolName: found!.school!.name,
        recipient: contact.email, recipientSourceUrl: contact.sourceUrl, result: "failed", providerMessageId: null, sentAt });
    }
  }
  try {
    await pool.query(
      "UPDATE school_outreach_requests SET outcomes=$2::jsonb,status='completed',updated_at=now() WHERE idempotency_key=$1",
      [requestId, JSON.stringify(outcomes)],
    );
  } catch {
    res.status(503).json({ error: "school_outreach_storage_unavailable" }); return;
  }
  res.json({ results: outcomes, meaning: "sent means the email provider accepted the send request" });
});

router.get("/auth/school-outreach-history", async (req, res): Promise<void> => {
  const username = typeof req.query.username === "string" ? req.query.username.trim() : "";
  if (!username) { res.status(400).json({ error: "username is required" }); return; }
  if (!verifyUserToken(username, req.header("x-auth-token"))) { res.status(401).json({ error: "unauthorized" }); return; }
  const [user] = await db.select().from(usersTable).where(eq(usersTable.username, username));
  if (!user) { res.status(404).json({ error: "not_found" }); return; }
  try {
    const rows = await pool.query<{ outcomes: SchoolOutreachOutcome[] }>(
      "SELECT outcomes FROM school_outreach_requests WHERE username=$1 AND status='completed' ORDER BY created_at DESC LIMIT 50",
      [username],
    );
    res.json({ history: rows.rows.flatMap((row) => Array.isArray(row.outcomes) ? row.outcomes : []).slice(0, 50) });
  } catch {
    res.status(503).json({ error: "school_outreach_storage_unavailable" });
  }
});

export default router;