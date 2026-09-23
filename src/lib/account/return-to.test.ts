import { describe, expect, it } from "vitest";
import { sanitizeAccountReturnTo } from "./return-to";

describe("sanitizeAccountReturnTo", () => {
  it("defaults to /account for null/undefined/empty input", () => {
    expect(sanitizeAccountReturnTo(null)).toBe("/account");
    expect(sanitizeAccountReturnTo(undefined)).toBe("/account");
    expect(sanitizeAccountReturnTo("")).toBe("/account");
  });

  it("allows a plain /account subpath", () => {
    expect(sanitizeAccountReturnTo("/account/friends")).toBe(
      "/account/friends",
    );
  });

  it("keeps a safe local query string", () => {
    expect(sanitizeAccountReturnTo("/account/friends?tab=pending")).toBe(
      "/account/friends?tab=pending",
    );
  });

  it("rejects the login page", () => {
    expect(sanitizeAccountReturnTo("/account/login")).toBe("/account");
    expect(sanitizeAccountReturnTo("/account/login?foo=bar")).toBe("/account");
  });

  it("rejects the register page", () => {
    expect(sanitizeAccountReturnTo("/account/register")).toBe("/account");
  });

  it("rejects an absolute external URL", () => {
    expect(sanitizeAccountReturnTo("https://example.com")).toBe("/account");
  });

  it("rejects a protocol-relative URL", () => {
    expect(sanitizeAccountReturnTo("//example.com")).toBe("/account");
  });

  it("rejects a javascript: URL", () => {
    expect(sanitizeAccountReturnTo("javascript:alert(1)")).toBe("/account");
  });

  it("rejects a path outside /account", () => {
    expect(sanitizeAccountReturnTo("/level5")).toBe("/account");
  });

  it("rejects a backslash-prefixed value a browser could treat like //", () => {
    expect(sanitizeAccountReturnTo("/\\evil.com")).toBe("/account");
  });

  it("drops any fragment", () => {
    expect(sanitizeAccountReturnTo("/account/friends#section")).toBe(
      "/account/friends",
    );
  });
});
