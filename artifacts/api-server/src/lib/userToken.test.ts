import { describe, it, expect, beforeEach } from "vitest";
import { issueUserToken, verifyUserToken } from "./userToken";

beforeEach(() => {
  process.env.SESSION_SECRET = "test-secret";
  process.env.NODE_ENV = "test";
});

describe("user tokens", () => {
  it("a token verifies only for the username it was issued to", () => {
    const aliceToken = issueUserToken("alice");
    expect(aliceToken).toBeTruthy();
    expect(verifyUserToken("alice", aliceToken)).toBe(true);
    // Another account cannot use alice's token to read or write her data
    expect(verifyUserToken("bob", aliceToken)).toBe(false);
  });

  it("normalizes username case and whitespace", () => {
    const token = issueUserToken("Alice");
    expect(verifyUserToken("  alice ", token)).toBe(true);
  });

  it("rejects missing, empty, or forged tokens", () => {
    expect(verifyUserToken("alice", undefined)).toBe(false);
    expect(verifyUserToken("alice", "")).toBe(false);
    expect(verifyUserToken("alice", "f".repeat(64))).toBe(false);
  });

  it("fails closed in production without SESSION_SECRET", () => {
    delete process.env.SESSION_SECRET;
    process.env.NODE_ENV = "production";
    expect(issueUserToken("alice")).toBeNull();
    expect(verifyUserToken("alice", "anything")).toBe(false);
  });
});
