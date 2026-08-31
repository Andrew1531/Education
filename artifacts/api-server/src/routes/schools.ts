import { Router, type IRouter } from "express";

const router: IRouter = Router();
export const SCORECARD_URL = "https://api.data.gov/ed/collegescorecard/v1/schools.json";
const SCORECARD_FIELDS = [
  "id", "school.name", "school.city", "school.state", "school.school_url",
  "school.price_calculator_url", "school.ownership", "school.degrees_awarded.predominant",
  "school.degrees_awarded.highest", "school.online_only", "latest.student.size",
  "latest.programs",
].join(",");
const DEGREE_VALUES = new Set(["certificate", "associate", "bachelor", "graduate", "any"]);
const ONLINE_VALUES = new Set(["any", "online", "campus"]);

export class ScorecardKeyNotConfiguredError extends Error {
  constructor() {
    super("college_scorecard_api_key_not_configured");
  }
}

export function scorecardApiKey(): string | null {
  const configured = process.env.COLLEGE_SCORECARD_API_KEY?.trim();
  if (configured) return configured;
  return process.env.NODE_ENV === "production" ? null : "DEMO_KEY";
}

function value(row: Record<string, unknown>, key: string): unknown {
  return row[key] ?? key.split(".").reduce<unknown>((acc, part) => acc && typeof acc === "object" ? (acc as Record<string, unknown>)[part] : undefined, row);
}
export function normalizeWebsite(input: unknown): string | null {
  if (typeof input !== "string" || !input.trim()) return null;
  try {
    const raw = input.trim();
    const url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    return (url.protocol === "http:" || url.protocol === "https:") && url.hostname
      ? `https://${url.host}${url.pathname}${url.search}` : null;
  } catch { return null; }
}
export function normalizeCip4(input: unknown): string | null {
  if (typeof input !== "string" && typeof input !== "number") return null;
  const raw = String(input).trim();
  if (/^\d{1,4}$/.test(raw)) return raw.padStart(4, "0");
  const decimal = raw.match(/^(\d{1,2})\.(\d{1,2})$/);
  return decimal ? `${decimal[1]!.padStart(2, "0")}${decimal[2]!.padEnd(2, "0")}` : null;
}
export function schoolFromScorecard(row: Record<string, unknown>, matchedCip?: string) {
  const programsRaw = value(row, "latest.programs");
  const allPrograms = Array.isArray(programsRaw) ? programsRaw : [];
  const programs = allPrograms
    .filter((program): program is Record<string, unknown> => Boolean(program) && typeof program === "object")
    .map((program) => ({
      cip4: normalizeCip4(program.cip4),
      cip6: typeof program.cip6 === "string" ? program.cip6 : null,
      title: typeof program.title === "string" ? program.title : null,
      credentialLevel: typeof (program.credential_level ?? program.credentialLevel) === "string" || typeof (program.credential_level ?? program.credentialLevel) === "number"
        ? program.credential_level ?? program.credentialLevel : null,
    }))
    .filter((program): program is { cip4: string; cip6: string | null; title: string | null; credentialLevel: string | number | null } => Boolean(program.cip4))
    .slice(0, 30);
  const codes = programs.map((program) => program.cip4);
  return {
    id: String(value(row, "id") ?? ""), name: String(value(row, "school.name") ?? ""),
    city: value(row, "school.city") ? String(value(row, "school.city")) : null,
    state: value(row, "school.state") ? String(value(row, "school.state")) : null,
    website: normalizeWebsite(value(row, "school.school_url")),
    priceCalculator: normalizeWebsite(value(row, "school.price_calculator_url")),
    studentSize: typeof value(row, "latest.student.size") === "number" ? value(row, "latest.student.size") : null,
    ownership: value(row, "school.ownership") === 1 ? 1 : null,
    predominantDegree: value(row, "school.degrees_awarded.predominant") ?? null,
    highestDegree: value(row, "school.degrees_awarded.highest") ?? null,
    onlineOnly: value(row, "school.online_only") === 1,
    degreeFields: codes,
    programs,
    matchedCip: matchedCip && codes.includes(matchedCip) ? matchedCip : null,
  };
}

async function scorecard(params: URLSearchParams): Promise<Record<string, unknown>[]> {
  const key = scorecardApiKey();
  if (!key) throw new ScorecardKeyNotConfiguredError();
  params.set("api_key", key);
  params.set("fields", SCORECARD_FIELDS);
  params.set("keys_nested", "true");
  const response = await fetch(`${SCORECARD_URL}?${params}`, { signal: AbortSignal.timeout(8_000) });
  if (!response.ok) throw new Error(`Scorecard returned ${response.status}`);
  const payload = await response.json() as { results?: unknown[] };
  if (!Array.isArray(payload.results)) throw new Error("Scorecard response missing results");
  return payload.results.filter((v): v is Record<string, unknown> => !!v && typeof v === "object");
}

router.get("/schools/health", (_req, res): void => {
  const configured = Boolean(process.env.COLLEGE_SCORECARD_API_KEY?.trim());
  res.status(process.env.NODE_ENV === "production" && !configured ? 503 : 200).json({ configured });
});

/** Re-resolves an ID from DOE and never accepts a client URL or ownership claim. */
export async function resolvePublicSchool(schoolId: string) {
  if (!/^\d{1,12}$/.test(schoolId)) return null;
  const rows = await scorecard(new URLSearchParams({ id: schoolId, "school.ownership": "1", per_page: "1" }));
  const row = rows[0];
  if (!row || value(row, "school.ownership") !== 1 || String(value(row, "id")) !== schoolId) return null;
  const school = schoolFromScorecard(row);
  return school.website ? school : null;
}

router.get("/schools/search", async (req, res): Promise<void> => {
  const cip = typeof req.query.cip === "string" ? req.query.cip : undefined;
  const state = typeof req.query.state === "string" ? req.query.state : undefined;
  const degree = typeof req.query.degree === "string" ? req.query.degree : "any";
  const online = typeof req.query.online === "string" ? req.query.online : "any";
  const pageRaw = typeof req.query.page === "string" ? req.query.page : "0";
  if ((cip && !/^\d{4}$/.test(cip)) || (state && !/^[A-Z]{2}$/.test(state)) || !DEGREE_VALUES.has(degree) || !ONLINE_VALUES.has(online) || !/^\d+$/.test(pageRaw) || Number(pageRaw) > 100) {
    res.status(400).json({ error: "invalid_school_search_query" }); return;
  }
  const params = new URLSearchParams({ per_page: "12", page: pageRaw, "school.ownership": "1" });
  if (cip) params.set("latest.programs.cip4", cip);
  if (state) params.set("school.state", state);
  if (degree !== "any") params.set("school.degrees_awarded.predominant", String(["certificate", "associate", "bachelor", "graduate"].indexOf(degree) + 1));
  if (online !== "any") params.set("school.online_only", online === "online" ? "1" : "0");
  try {
    const results = await scorecard(params);
    res.json({ schools: results.slice(0, 12).filter((r) => value(r, "school.ownership") === 1).map((r) => schoolFromScorecard(r, cip)), source: { name: "U.S. Department of Education College Scorecard", url: SCORECARD_URL, retrievedAt: new Date().toISOString() } });
  } catch (error) {
    if (error instanceof ScorecardKeyNotConfiguredError) {
      res.status(503).json({ error: "college_scorecard_api_key_not_configured" });
      return;
    }
    req.log.error({ err: error, source: "college_scorecard" }, "College Scorecard request failed");
    res.status(503).json({ error: "college_scorecard_unavailable", message: "U.S. Department of Education College Scorecard is temporarily unavailable" });
  }
});

export default router;