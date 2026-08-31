import { Router, type IRouter } from "express";

const router: IRouter = Router();
const SCORECARD_URL = "https://api.data.gov/ed/collegescorecard/v1/schools.json";
const DEGREE_VALUES = new Set(["certificate", "associate", "bachelor", "graduate", "any"]);
const ONLINE_VALUES = new Set(["any", "online", "campus"]);

function first(value: unknown): unknown {
  return Array.isArray(value) ? value[0] : value;
}
function value(row: Record<string, unknown>, key: string): unknown {
  return row[key] ?? key.split(".").reduce<unknown>((acc, part) => acc && typeof acc === "object" ? (acc as Record<string, unknown>)[part] : undefined, row);
}
export function normalizeWebsite(input: unknown): string | null {
  if (typeof input !== "string" || !input.trim()) return null;
  try {
    const text = input.trim();
    const url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`);
    return url.protocol === "http:" || url.protocol === "https:" ? `https://${url.host}${url.pathname}${url.search}` : null;
  } catch { return null; }
}
export function schoolFromScorecard(row: Record<string, unknown>) {
  const programsRaw = first(value(row, "latest.academics.program_available.cip_4_digit"));
  const codes = Array.isArray(programsRaw) ? programsRaw : [];
  return {
    id: String(value(row, "id") ?? ""), name: String(value(row, "school.name") ?? ""),
    city: value(row, "school.city") ? String(value(row, "school.city")) : null,
    state: value(row, "school.state") ? String(value(row, "school.state")) : null,
    website: normalizeWebsite(value(row, "school.school_url")),
    priceCalculator: normalizeWebsite(value(row, "school.price_calculator_url")),
    studentSize: typeof value(row, "latest.student.size") === "number" ? value(row, "latest.student.size") : null,
    ownership: value(row, "school.ownership") ?? null,
    predominantDegree: value(row, "school.degrees_awarded.predominant") ?? null,
    highestDegree: value(row, "school.degrees_awarded.highest") ?? null,
    onlineOnly: value(row, "school.online_only") === 1,
    programs: codes.slice(0, 30).map((code) => ({ code: String(code), title: String(code) })),
  };
}

router.get("/schools/search", async (req, res): Promise<void> => {
  const cip = typeof req.query.cip === "string" ? req.query.cip : undefined;
  const state = typeof req.query.state === "string" ? req.query.state : undefined;
  const degree = typeof req.query.degree === "string" ? req.query.degree : "any";
  const online = typeof req.query.online === "string" ? req.query.online : "any";
  const pageRaw = typeof req.query.page === "string" ? req.query.page : "0";
  if ((cip && !/^\d{4}$/.test(cip)) || (state && !/^[A-Z]{2}$/.test(state)) || !DEGREE_VALUES.has(degree) || !ONLINE_VALUES.has(online) || !/^\d+$/.test(pageRaw) || Number(pageRaw) > 10_000) {
    res.status(400).json({ error: "invalid_school_search_query" });
    return;
  }
  const params = new URLSearchParams({ api_key: process.env.COLLEGE_SCORECARD_API_KEY || "DEMO_KEY", per_page: "12", page: pageRaw });
  if (cip) params.set("latest.academics.program_available.cip_4_digit", cip);
  if (state) params.set("school.state", state);
  if (degree !== "any") params.set("school.degrees_awarded.predominant", String(["certificate", "associate", "bachelor", "graduate"].indexOf(degree) + 1));
  if (online !== "any") params.set("school.online_only", online === "online" ? "1" : "0");
  try {
    const response = await fetch(`${SCORECARD_URL}?${params}`, { signal: AbortSignal.timeout(8_000) });
    if (!response.ok) throw new Error(`Scorecard returned ${response.status}`);
    const payload = await response.json() as { results?: unknown[] };
    if (!Array.isArray(payload.results)) throw new Error("Scorecard response missing results");
    res.json({ schools: payload.results.slice(0, 12).filter((v): v is Record<string, unknown> => !!v && typeof v === "object").map(schoolFromScorecard), source: { name: "U.S. Department of Education College Scorecard", url: SCORECARD_URL, retrievedAt: new Date().toISOString() } });
  } catch (error) {
    req.log.error({ err: error, source: "college_scorecard" }, "College Scorecard request failed");
    res.status(503).json({ error: "college_scorecard_unavailable", message: "U.S. Department of Education College Scorecard is temporarily unavailable" });
  }
});

export default router;