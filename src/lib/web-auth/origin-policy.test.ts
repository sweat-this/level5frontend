import { describe, expect, it } from "vitest";
import { isAllowedOrigin } from "./origin-policy";

const APP_ORIGIN = "http://localhost:3000";

describe("origin-policy", () => {
  it("allows the exact configured origin", () => {
    expect(isAllowedOrigin("http://localhost:3000", APP_ORIGIN)).toBe(true);
  });

  it("rejects a different origin", () => {
    expect(isAllowedOrigin("https://evil.example.com", APP_ORIGIN)).toBe(false);
  });

  it("rejects a different port on the same host", () => {
    expect(isAllowedOrigin("http://localhost:4000", APP_ORIGIN)).toBe(false);
  });

  it("rejects a missing Origin header", () => {
    expect(isAllowedOrigin(null, APP_ORIGIN)).toBe(false);
  });

  it("rejects a malformed Origin header", () => {
    expect(isAllowedOrigin("not-a-url", APP_ORIGIN)).toBe(false);
  });

  it("rejects everything when no application origin is configured", () => {
    expect(isAllowedOrigin("http://localhost:3000", "")).toBe(false);
  });
});
