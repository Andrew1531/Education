import { afterEach, describe, expect, it, vi } from "vitest";
import { verifyInstitutionEvidence } from "./institutions";

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
}

function entity(id: string, name: string, countryId = "Q30", closure?: string) {
  return {
    id,
    labels: { en: { value: name } },
    descriptions: { en: { value: "university" } },
    aliases: { en: [{ value: `${name} alias` }] },
    claims: {
      P31: [{ mainsnak: { datavalue: { value: { id: "Q3918" } } } }],
      P17: [{ mainsnak: { datavalue: { value: { id: countryId } } } }],
      P856: [{ mainsnak: { datavalue: { value: "https://example.edu/" } } }],
      ...(closure ? { P576: [{ mainsnak: { datavalue: { value: { time: `+${closure}T00:00:00Z` } } } }] } : {}),
    },
    sitelinks: { enwiki: { title: name } },
  };
}

function mockProviders(items: ReturnType<typeof entity>[], countryName = "United States", archive = false) {
  vi.stubGlobal("fetch", vi.fn(async (input: string | URL) => {
    const url = new URL(String(input));
    if (url.hostname === "archive.org") {
      return json({ archived_snapshots: archive ? { closest: { available: true, url: "https://web.archive.org/web/20200101/https://example.edu/" } } : {} });
    }
    const action = url.searchParams.get("action");
    if (action === "wbsearchentities") return json({ search: items.map((item) => ({ id: item.id })) });
    const ids = (url.searchParams.get("ids") || "").split("|");
    const entities: Record<string, unknown> = {};
    for (const id of ids) {
      const found = items.find((item) => item.id === id);
      if (found) entities[id] = found;
      else if (id === "Q3918") entities[id] = { id, labels: { en: { value: "university" } }, claims: {} };
      else if (id.startsWith("Q")) entities[id] = { id, labels: { en: { value: countryName } }, aliases: {}, claims: {} };
    }
    return json({ entities });
  }));
}

afterEach(() => vi.unstubAllGlobals());

describe("institution public evidence", () => {
  it("does not call a fabricated name verified", async () => {
    mockProviders([]);
    const result = await verifyInstitutionEvidence("Definitely Fake Academy 123", "United States");
    expect(result.status).toBe("not_found");
    expect(result.message).toContain("does not mean");
  });

  it("requires country matching", async () => {
    mockProviders([entity("Q1", "Example University")], "Canada");
    const result = await verifyInstitutionEvidence("Example University", "United States");
    expect(result.status).toBe("ambiguous");
    expect(result.selected).toBeNull();
    expect(result.candidates[0]?.countryMatch).toBe(false);
  });

  it("requires disambiguation when exact aliases collide", async () => {
    const one = entity("Q1", "Example University");
    const two = entity("Q2", "Example University");
    mockProviders([one, two]);
    const result = await verifyInstitutionEvidence("Example University", "United States");
    expect(result.status).toBe("ambiguous");
    expect(result.candidates).toHaveLength(2);
  });

  it("includes explicit closure and archive evidence", async () => {
    mockProviders([entity("Q1", "Closed University", "Q30", "2019-06-01")], "United States", true);
    const result = await verifyInstitutionEvidence("Closed University", "United States");
    expect(result.status).toBe("verified");
    expect(result.selected?.closureDate).toBe("2019-06-01");
    expect(result.selected?.archiveUrl).toContain("web.archive.org");
    expect(result.selected?.sources.map((source) => source.name)).toContain("Internet Archive");
  });

  it("surfaces upstream failure", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));
    await expect(verifyInstitutionEvidence("Example University", "United States")).rejects.toThrow("offline");
  });
});