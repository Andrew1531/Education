import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";

vi.mock("@workspace/db", () => ({
  db: { select: vi.fn(), update: vi.fn(), insert: vi.fn(), delete: vi.fn() },
  usersTable: {},
}));
import app from "../app";

describe("GET /api/schools/search", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it("forwards validated filters and attributes live College Scorecard results", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ results: [{
        id: 12, "school.name": "Example College", "school.city": "Boston", "school.state": "MA",
        "school.school_url": "example.edu", "school.online_only": 1,
        "latest.academics.program_available.cip_4_digit": ["1101"],
      }] }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const res = await request(app).get("/api/schools/search?cip=1101&state=MA&degree=bachelor&online=online&page=2");
    expect(res.status).toBe(200);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("school.state=MA");
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("cip_4_digit=1101");
    expect(res.body.source.name).toBe("U.S. Department of Education College Scorecard");
    expect(res.body.schools[0]).toMatchObject({ id: "12", website: "https://example.edu/", onlineOnly: true });
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
    expect(res.body.schools).toBeUndefined();
  });
});