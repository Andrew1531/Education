import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";

vi.mock("@workspace/db", () => {
  const state = {
    selectRows: [] as Record<string, unknown>[],
    updateRows: [] as Record<string, unknown>[],
    setCalls: [] as Record<string, unknown>[],
  };

  const select = vi.fn(() => ({
    from: vi.fn(() => ({
      where: vi.fn(() => Promise.resolve(state.selectRows)),
    })),
  }));
  const update = vi.fn(() => ({
    set: vi.fn((value: Record<string, unknown>) => {
      state.setCalls.push(value);
      return {
        where: vi.fn(() => ({
          returning: vi.fn(() => Promise.resolve(state.updateRows)),
        })),
      };
    }),
  }));

  return {
    db: { select, update, insert: vi.fn() },
    usersTable: {},
    __roadmapState: state,
  };
});

import app from "../app";
import { issueUserToken } from "../lib/userToken";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const roadmapState = (await import("@workspace/db") as any).__roadmapState as {
  selectRows: Record<string, unknown>[];
  updateRows: Record<string, unknown>[];
  setCalls: Record<string, unknown>[];
};

const user = (roadmapSteps: boolean[]) => ({
  id: 1,
  username: "alice",
  roadmapSteps,
});

beforeEach(() => {
  process.env.SESSION_SECRET = "test-session-secret";
  roadmapState.selectRows = [];
  roadmapState.updateRows = [];
  roadmapState.setCalls = [];
});

describe("/api/auth/roadmap-steps", () => {
  it("saves the authenticated user's complete roadmap state", async () => {
    roadmapState.updateRows = [user([true, false, true, false])];

    const response = await request(app)
      .post("/api/auth/roadmap-steps")
      .set("x-auth-token", issueUserToken("alice") ?? "")
      .send({ username: "alice", roadmapSteps: [true, false, true, false] });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ ok: true });
    expect(roadmapState.setCalls).toEqual([
      { roadmapSteps: [true, false, true, false] },
    ]);
  });

  it("restores the authenticated user's saved roadmap state", async () => {
    roadmapState.selectRows = [user([true, true, false, false])];

    const response = await request(app)
      .get("/api/auth/roadmap-steps")
      .query({ username: "alice" })
      .set("x-auth-token", issueUserToken("alice") ?? "");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      roadmapSteps: [true, true, false, false],
    });
  });

  it.each(["get", "post"] as const)(
    "rejects a %s request authenticated as another user",
    async (method) => {
      const token = issueUserToken("bob") ?? "";
      const response = method === "get"
        ? await request(app)
            .get("/api/auth/roadmap-steps")
            .query({ username: "alice" })
            .set("x-auth-token", token)
        : await request(app)
            .post("/api/auth/roadmap-steps")
            .set("x-auth-token", token)
            .send({ username: "alice", roadmapSteps: [true] });

      expect(response.status).toBe(401);
      expect(response.body).toEqual({ error: "unauthorized" });
      expect(roadmapState.selectRows).toEqual([]);
      expect(roadmapState.setCalls).toEqual([]);
    },
  );

  it("rejects malformed roadmap state", async () => {
    const response = await request(app)
      .post("/api/auth/roadmap-steps")
      .set("x-auth-token", issueUserToken("alice") ?? "")
      .send({ username: "alice", roadmapSteps: "not-an-array" });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: "roadmapSteps must be an array",
    });
    expect(roadmapState.setCalls).toEqual([]);
  });
});