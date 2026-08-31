import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";

vi.mock("@workspace/db", () => ({
  db: { select: vi.fn(), update: vi.fn(), insert: vi.fn(), delete: vi.fn() },
  usersTable: {},
}));
import app from "../app";
import { normalizeCip4, schoolFromScorecard } from "./schools";

describe("GET /api/schools/search", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    process.env.NODE_ENV = "test";
    delete process.env.COLLEGE_SCORECARD_API_KEY;
  });

  it("forwards validated filters and attributes live College Scorecard results", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ results: [{
        id: 12, "school.name": "Example College", "school.city": "Boston", "school.state": "MA",
        "school.school_url": "example.edu", "school.online_only": 1, "school.ownership": 1,
        latest: { programs: [{ cip4: "1101", cip6: "110701", title: "Computer Science", credential_level: 3 }] },
      }] }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const res = await request(app).get("/api/schools/search?cip=1101&state=MA&degree=bachelor&online=online&page=2");
    expect(res.status).toBe(200);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("school.state=MA");
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("latest.programs.cip4=1101");
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("keys_nested=true");
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("school.ownership=1");
    expect(res.body.source.name).toBe("U.S. Department of Education College Scorecard");
    expect(res.body.schools[0]).toMatchObject({ id: "12", website: "https://example.edu/", onlineOnly: true });
    expect(res.body.schools[0].programs).toEqual([{ cip4: "1101", cip6: "110701", title: "Computer Science", credentialLevel: 3 }]);
  });

  it("rejects invalid query filters without calling upstream", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const res = await request(app).get("/api/schools/search?state=ma&degree=doctoral");
    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns a clear 503 rather than fabricated data on upstream failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    const res = await request(app).get("/api/schools/search");
    expect(res.status).toBe(503);
    expect(res.body.error).toBe("college_scorecard_unavailable");
    expect(res.body.message).toContain("College Scorecard");
    expect(res.body.schools).toBeUndefined();
  });

  it("turns Scorecard parameter_not_found responses into a clear 503", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 400, json: async () => ({ error: "parameter_not_found" }) }));
    const res = await request(app).get("/api/schools/search?cip=1107");
    expect(res.status).toBe(503);
    expect(res.body).toMatchObject({ error: "college_scorecard_unavailable" });
  });

  it("normalizes numeric nested CIP values to four digits", () => {
    expect(schoolFromScorecard({ id: 1, "school.ownership": 1, latest: { programs: [{ cip4: 101 }] } }).programs)
      .toEqual([{ cip4: "0101", cip6: null, title: null, credentialLevel: null }]);
  });

  it("normalizes decimal numeric and string CIP values", () => {
    expect(normalizeCip4(11.01)).toBe("1101");
    expect(normalizeCip4("1.1")).toBe("0110");
  });

  it("never falls back to DEMO_KEY in production", async () => {
    process.env.NODE_ENV = "production";
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const res = await request(app).get("/api/schools/search");
    expect(res.status).toBe(503);
    expect(res.body).toEqual({ error: "college_scorecard_api_key_not_configured" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reports Scorecard key health without exposing the key", async () => {
    process.env.NODE_ENV = "production";
    process.env.COLLEGE_SCORECARD_API_KEY = "secret-value";
    const configured = await request(app).get("/api/schools/health");
    expect(configured.status).toBe(200);
    expect(configured.body).toEqual({ configured: true });
    expect(JSON.stringify(configured.body)).not.toContain("secret-value");
    delete process.env.COLLEGE_SCORECARD_API_KEY;
    const missing = await request(app).get("/api/schools/health");
    expect(missing.status).toBe(503);
    expect(missing.body).toEqual({ configured: false });
  });
});