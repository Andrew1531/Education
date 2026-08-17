/**
 * Unit tests for the cleanContacted sanitisation function.
 *
 * cleanContacted is the single gate between untrusted client-supplied JSONB
 * and the database. These tests verify every sanitisation rule: type rejection,
 * key/value truncation, the 100-entry cap, and blank-key stripping.
 */
import { describe, it, expect } from "vitest";
import { cleanContacted } from "./users";

describe("cleanContacted — type rejection (returns null)", () => {
  it("returns null for null", () => {
    expect(cleanContacted(null)).toBeNull();
  });

  it("returns null for undefined", () => {
    expect(cleanContacted(undefined)).toBeNull();
  });

  it("returns null for a string", () => {
    expect(cleanContacted("WES")).toBeNull();
  });

  it("returns null for a number", () => {
    expect(cleanContacted(42)).toBeNull();
  });

  it("returns null for an array (even an array of strings)", () => {
    expect(cleanContacted(["WES", "IQAS"])).toBeNull();
  });

  it("returns null for a boolean", () => {
    expect(cleanContacted(true)).toBeNull();
  });
});

describe("cleanContacted — valid input", () => {
  it("passes a well-formed map through unchanged", () => {
    const input = { WES: "2026-08-01", IQAS: "2026-07-15" };
    expect(cleanContacted(input)).toEqual(input);
  });

  it("accepts an empty object and returns an empty map", () => {
    expect(cleanContacted({})).toEqual({});
  });

  it("handles a single entry correctly", () => {
    expect(cleanContacted({ WES: "2026-08-01" })).toEqual({ WES: "2026-08-01" });
  });
});

describe("cleanContacted — value filtering", () => {
  it("drops entries whose value is a number", () => {
    const result = cleanContacted({ WES: 123, IQAS: "2026-08-01" });
    expect(result).not.toBeNull();
    expect(result).not.toHaveProperty("WES");
    expect(result).toHaveProperty("IQAS", "2026-08-01");
  });

  it("drops entries whose value is null", () => {
    const result = cleanContacted({ WES: null, IQAS: "2026-08-01" });
    expect(result).not.toBeNull();
    expect(result).not.toHaveProperty("WES");
  });

  it("drops entries whose value is an array", () => {
    const result = cleanContacted({ WES: ["2026-08-01"], IQAS: "2026-08-01" });
    expect(result).not.toBeNull();
    expect(result).not.toHaveProperty("WES");
  });

  it("drops entries whose value is a boolean", () => {
    const result = cleanContacted({ WES: true, IQAS: "2026-08-01" });
    expect(result).not.toBeNull();
    expect(result).not.toHaveProperty("WES");
  });

  it("drops entries whose value is an object", () => {
    const result = cleanContacted({ WES: { date: "2026-08-01" }, IQAS: "2026-08-01" });
    expect(result).not.toBeNull();
    expect(result).not.toHaveProperty("WES");
  });

  it("keeps entries whose value is an empty string (valid, just an empty date)", () => {
    // Empty-string values are technically string — cleanContacted does not
    // reject them on format grounds. The UI enforces ISO date format separately.
    const result = cleanContacted({ WES: "" });
    expect(result).not.toBeNull();
    expect(result).toHaveProperty("WES", "");
  });
});

describe("cleanContacted — key filtering", () => {
  it("drops entries with a whitespace-only key", () => {
    const result = cleanContacted({ "   ": "2026-08-01", WES: "2026-08-01" });
    expect(result).not.toBeNull();
    const keys = Object.keys(result!);
    expect(keys.every((k) => k.trim().length > 0)).toBe(true);
    expect(result).toHaveProperty("WES", "2026-08-01");
  });

  it("drops entries with an empty-string key", () => {
    const result = cleanContacted({ "": "2026-08-01", WES: "2026-08-01" });
    expect(result).not.toBeNull();
    // Avoid toHaveProperty("") — vitest's path-split logic has an edge case with "".
    expect(Object.keys(result!).includes("")).toBe(false);
    expect(Object.keys(result!)).toContain("WES");
  });
});

describe("cleanContacted — key truncation (200-char limit)", () => {
  it("passes keys up to 200 chars unchanged", () => {
    const key200 = "A".repeat(200);
    const result = cleanContacted({ [key200]: "2026-08-01" });
    expect(result).not.toBeNull();
    expect(result).toHaveProperty(key200, "2026-08-01");
  });

  it("truncates keys longer than 200 chars to exactly 200", () => {
    const key300 = "A".repeat(300);
    const result = cleanContacted({ [key300]: "2026-08-01" });
    expect(result).not.toBeNull();
    const keys = Object.keys(result!);
    expect(keys).toHaveLength(1);
    expect(keys[0]!.length).toBe(200);
  });

  it("two keys that differ only past position 200 are merged into one entry", () => {
    const base = "A".repeat(200);
    const result = cleanContacted({ [base + "X"]: "2026-08-01", [base + "Y"]: "2026-08-02" });
    expect(result).not.toBeNull();
    // Both truncate to the same 200-char key; the second value wins.
    expect(Object.keys(result!)).toHaveLength(1);
  });
});

describe("cleanContacted — value truncation (40-char limit)", () => {
  it("passes values up to 40 chars unchanged", () => {
    const val40 = "2026-08-01".padEnd(40, "0");
    const result = cleanContacted({ WES: val40 });
    expect(result).not.toBeNull();
    expect(result!.WES).toBe(val40);
    expect(result!.WES.length).toBe(40);
  });

  it("truncates values longer than 40 chars to exactly 40", () => {
    const longVal = "2026-08-01".padEnd(100, "X");
    const result = cleanContacted({ WES: longVal });
    expect(result).not.toBeNull();
    expect(result!.WES.length).toBe(40);
    expect(result!.WES).toBe(longVal.slice(0, 40));
  });
});

describe("cleanContacted — 100-entry cap", () => {
  it("passes exactly 100 entries unchanged", () => {
    const input: Record<string, string> = {};
    for (let i = 0; i < 100; i++) input[`Agency${i}`] = "2026-08-01";
    const result = cleanContacted(input);
    expect(result).not.toBeNull();
    expect(Object.keys(result!)).toHaveLength(100);
  });

  it("caps the output at 100 entries when the input has 101", () => {
    const input: Record<string, string> = {};
    for (let i = 0; i < 101; i++) input[`Agency${i}`] = "2026-08-01";
    const result = cleanContacted(input);
    expect(result).not.toBeNull();
    expect(Object.keys(result!)).toHaveLength(100);
  });

  it("caps the output at 100 entries when the input has 200", () => {
    const input: Record<string, string> = {};
    for (let i = 0; i < 200; i++) input[`Agency${i}`] = "2026-08-01";
    const result = cleanContacted(input);
    expect(result).not.toBeNull();
    expect(Object.keys(result!)).toHaveLength(100);
  });
});
