import { describe, expect, it } from "vitest";
import { generateSessionId, hashSessionId } from "./session-id";

describe("session-id", () => {
  it("generates ids that differ across calls", () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateSessionId()));
    expect(ids.size).toBe(100);
  });

  it("encodes at least 256 bits of randomness", () => {
    const id = generateSessionId();
    // base64url: 4 chars per 3 bytes, no padding.
    const decodedBytes = Buffer.from(id, "base64url").length;
    expect(decodedBytes).toBeGreaterThanOrEqual(32);
  });

  it("hashes deterministically to a value distinct from the raw id", () => {
    const id = generateSessionId();
    const hash1 = hashSessionId(id);
    const hash2 = hashSessionId(id);
    expect(hash1).toBe(hash2);
    expect(hash1).not.toBe(id);
    expect(hash1).toMatch(/^[0-9a-f]{64}$/);
  });

  it("hashes different ids to different values", () => {
    const a = hashSessionId(generateSessionId());
    const b = hashSessionId(generateSessionId());
    expect(a).not.toBe(b);
  });
});
