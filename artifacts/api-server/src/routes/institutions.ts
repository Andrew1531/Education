import { Router, type IRouter, type Request } from "express";
import { VerifyInstitutionBody } from "@workspace/api-zod";

const router: IRouter = Router();
const WIKIDATA_API = "https://www.wikidata.org/w/api.php";
const ARCHIVE_API = "https://archive.org/wayback/available";
const USER_AGENT = "VerifEDGlobal/1.0 (public institution evidence)";
const HIGHER_ED_ROOTS = new Set(["Q3918", "Q189004", "Q38723"]);
const requestsByIp = new Map<string, { start: number; count: number }>();

type Claim = { mainsnak?: { datavalue?: { value?: unknown } } };
type Entity = {
  id: string;
  labels?: Record<string, { value?: string }>;
  descriptions?: Record<string, { value?: string }>;
  aliases?: Record<string, Array<{ value?: string }>>;
  claims?: Record<string, Claim[]>;
  sitelinks?: Record<string, { title?: string }>;
};

function normalize(value: string): string {
  return value.normalize("NFKD").replace(/\p{Diacritic}/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function entityIds(entity: Entity, property: string): string[] {
  return (entity.claims?.[property] || []).flatMap((claim) => {
    const value = claim.mainsnak?.datavalue?.value;
    return value && typeof value === "object" && "id" in value && typeof value.id === "string" ? [value.id] : [];
  });
}

function stringClaim(entity: Entity, property: string): string | null {
  const value = entity.claims?.[property]?.[0]?.mainsnak?.datavalue?.value;
  return typeof value === "string" ? value : null;
}

function timeClaim(entity: Entity, property: string): string | null {
  const value = entity.claims?.[property]?.[0]?.mainsnak?.datavalue?.value;
  if (!value || typeof value !== "object" || !("time" in value) || typeof value.time !== "string") return null;
  const match = value.time.match(/^\+?(-?\d{4,})-(\d{2})-(\d{2})/);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : null;
}

function safePublicUrl(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
    const privateHost = host === "localhost" || host.endsWith(".localhost") || host === "::1" ||
      /^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host) ||
      /^169\.254\./.test(host) || /^172\.(1[6-9]|2\d|3[01])\./.test(host);
    if (!["http:", "https:"].includes(url.protocol) || !host || privateHost || url.username || url.password) return null;
    return url.toString();
  } catch {
    return null;
  }
}

async function providerJson(url: URL, timeoutMs = 6_000): Promise<unknown> {
  const response = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) throw new Error(`provider_${response.status}`);
  return response.json();
}

async function searchEntities(name: string): Promise<string[]> {
  const url = new URL(WIKIDATA_API);
  url.search = new URLSearchParams({
    action: "wbsearchentities", search: name, language: "en", uselang: "en",
    type: "item", format: "json", limit: "10", origin: "*",
  }).toString();
  const payload = await providerJson(url) as { search?: Array<{ id?: unknown }> };
  return (payload.search || []).flatMap((item) => typeof item.id === "string" && /^Q\d+$/.test(item.id) ? [item.id] : []);
}

async function getEntities(ids: string[]): Promise<Map<string, Entity>> {
  const result = new Map<string, Entity>();
  for (let offset = 0; offset < ids.length; offset += 40) {
    const batch = ids.slice(offset, offset + 40);
    if (!batch.length) continue;
    const url = new URL(WIKIDATA_API);
    url.search = new URLSearchParams({
      action: "wbgetentities", ids: batch.join("|"), props: "labels|descriptions|aliases|claims|sitelinks",
      languages: "en|es", languagefallback: "1", sitefilter: "enwiki|eswiki", format: "json", origin: "*",
    }).toString();
    const payload = await providerJson(url) as { entities?: Record<string, Entity> };
    for (const entity of Object.values(payload.entities || {})) if (entity.id && !("missing" in entity)) result.set(entity.id, entity);
  }
  return result;
}

async function resolveTypes(entities: Entity[]): Promise<{ labels: Map<string, string>; valid: Set<string> }> {
  const labels = new Map<string, string>();
  const valid = new Set<string>();
  let frontier = [...new Set(entities.flatMap((entity) => entityIds(entity, "P31")))];
  const children = new Map<string, string[]>();
  const seen = new Set<string>();
  for (let depth = 0; depth < 5 && frontier.length; depth += 1) {
    const current = frontier.filter((id) => !seen.has(id));
    current.forEach((id) => seen.add(id));
    const fetched = await getEntities(current);
    const next: string[] = [];
    for (const [id, entity] of fetched) {
      labels.set(id, entity.labels?.en?.value || entity.labels?.es?.value || id);
      const parents = entityIds(entity, "P279");
      children.set(id, parents);
      next.push(...parents);
    }
    frontier = next;
  }
  function isHigherEd(id: string, trail = new Set<string>()): boolean {
    if (HIGHER_ED_ROOTS.has(id)) return true;
    if (trail.has(id)) return false;
    trail.add(id);
    return (children.get(id) || []).some((parent) => isHigherEd(parent, trail));
  }
  for (const id of children.keys()) if (isHigherEd(id)) valid.add(id);
  HIGHER_ED_ROOTS.forEach((id) => valid.add(id));
  return { labels, valid };
}

async function archivedUrl(website: string | null): Promise<string | null> {
  if (!website) return null;
  const url = new URL(ARCHIVE_API);
  url.search = new URLSearchParams({ url: website }).toString();
  try {
    const payload = await providerJson(url) as { archived_snapshots?: { closest?: { available?: boolean; url?: unknown } } };
    const candidate = payload.archived_snapshots?.closest;
    if (!candidate?.available || typeof candidate.url !== "string") return null;
    const parsed = new URL(candidate.url);
    return parsed.hostname === "web.archive.org" && ["http:", "https:"].includes(parsed.protocol) ? parsed.toString() : null;
  } catch {
    return null;
  }
}

function rateLimited(req: Request): boolean {
  const now = Date.now();
  const key = req.ip || "unknown";
  const current = requestsByIp.get(key);
  if (!current || now - current.start > 60_000) {
    requestsByIp.set(key, { start: now, count: 1 });
    return false;
  }
  current.count += 1;
  return current.count > 20;
}

export async function verifyInstitutionEvidence(name: string, country: string, selectedEntityId?: string) {
  const retrievedAt = new Date().toISOString();
  const searchIds = await searchEntities(name);
  if (selectedEntityId && !searchIds.includes(selectedEntityId)) {
    return { status: "not_found" as const, message: "The selected result no longer matches this search.", accreditationChecked: false, selected: null, candidates: [], retrievedAt };
  }
  const entities = await getEntities(searchIds);
  const { labels: typeLabels, valid: validTypes } = await resolveTypes([...entities.values()]);
  const countryIds = [...new Set([...entities.values()].flatMap((entity) => entityIds(entity, "P17")))];
  const countries = await getEntities(countryIds);
  const wantedCountry = normalize(country);
  const candidates = await Promise.all([...entities.values()].flatMap((entity) => {
    const typeId = entityIds(entity, "P31").find((id) => validTypes.has(id));
    if (!typeId) return [];
    const countryEntity = countries.get(entityIds(entity, "P17")[0] || "");
    const countryNames = countryEntity
      ? [countryEntity.labels?.en?.value, countryEntity.labels?.es?.value, ...(countryEntity.aliases?.en || []).map((a) => a.value), ...(countryEntity.aliases?.es || []).map((a) => a.value)].filter((v): v is string => Boolean(v))
      : [];
    const countryMatch = countryNames.some((value) => normalize(value) === wantedCountry);
    const label = entity.labels?.en?.value || entity.labels?.es?.value || entity.id;
    const aliases = [...new Set([...(entity.aliases?.en || []), ...(entity.aliases?.es || [])].flatMap((a) => a.value ? [a.value] : []))].slice(0, 12);
    const officialWebsite = safePublicUrl(stringClaim(entity, "P856"));
    const closureDate = timeClaim(entity, "P576");
    const wikiSite = entity.sitelinks?.enwiki ? "en" : entity.sitelinks?.eswiki ? "es" : null;
    const wikiTitle = wikiSite ? entity.sitelinks?.[`${wikiSite}wiki`]?.title : null;
    const wikipediaUrl = wikiSite && wikiTitle ? `https://${wikiSite}.wikipedia.org/wiki/${encodeURIComponent(wikiTitle.replace(/ /g, "_"))}` : null;
    return [Promise.resolve(closureDate ? archivedUrl(officialWebsite) : null).then((archiveUrl) => ({
      entityId: entity.id,
      name: label,
      description: entity.descriptions?.en?.value || entity.descriptions?.es?.value || null,
      aliases,
      country: countryNames[0] || null,
      countryMatch,
      higherEducationType: typeLabels.get(typeId) || typeId,
      officialWebsite,
      websiteAvailability: "not_checked" as const,
      closureDate,
      wikipediaUrl,
      archiveUrl,
      sources: [
        { name: "Wikidata", url: `https://www.wikidata.org/wiki/${entity.id}`, retrievedAt },
        ...(wikipediaUrl ? [{ name: "Wikipedia", url: wikipediaUrl, retrievedAt }] : []),
        ...(archiveUrl ? [{ name: "Internet Archive", url: archiveUrl, retrievedAt }] : []),
      ],
    }))];
  }));
  const exact = candidates.filter((candidate) =>
    candidate.countryMatch && candidate.officialWebsite && [candidate.name, ...candidate.aliases].some((value) => normalize(value) === normalize(name)));
  const selected = selectedEntityId ? candidates.find((candidate) => candidate.entityId === selectedEntityId && candidate.countryMatch && candidate.officialWebsite) || null
    : exact.length === 1 ? exact[0]! : null;
  if (selected) {
    return { status: "verified" as const, message: "Country and higher-education type are corroborated by Wikidata. This is not an accreditation finding.", accreditationChecked: false, selected, candidates, retrievedAt };
  }
  if (candidates.length) {
    return { status: "ambiguous" as const, message: candidates.some((candidate) => candidate.countryMatch)
      ? "More than one plausible higher-education entity was found, or an official website listing is missing. Select an eligible institution."
      : "Higher-education name matches were found, but none match the selected country.", accreditationChecked: false, selected: null, candidates, retrievedAt };
  }
  return { status: "not_found" as const, message: "No country-matched higher-education entity was found in the available sources. This does not mean the institution is fake.", accreditationChecked: false, selected: null, candidates: [], retrievedAt };
}

router.post("/institutions/verify", async (req, res): Promise<void> => {
  if (rateLimited(req)) {
    res.status(429).json({ error: "rate_limited" });
    return;
  }
  const parsed = VerifyInstitutionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_request" });
    return;
  }
  try {
    const result = await verifyInstitutionEvidence(parsed.data.name.trim(), parsed.data.country.trim(), parsed.data.selectedEntityId);
    res.json(result);
  } catch (error) {
    req.log?.warn({ err: error }, "institution evidence provider unavailable");
    res.status(503).json({ error: "evidence_sources_unavailable" });
  }
});

export default router;