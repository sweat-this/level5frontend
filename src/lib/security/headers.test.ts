import { describe, expect, it } from "vitest";
import {
  buildBaseSecurityHeaders,
  buildContentSecurityPolicy,
  generateNonce,
  toOrigin,
} from "./headers";

describe("toOrigin", () => {
  it("returns undefined for an unset/blank value", () => {
    expect(toOrigin(undefined)).toBeUndefined();
    expect(toOrigin("")).toBeUndefined();
  });

  it("returns undefined for a malformed value rather than throwing", () => {
    expect(toOrigin("not-a-url")).toBeUndefined();
  });

  it("strips a path down to the bare origin", () => {
    expect(toOrigin("http://localhost:5124/some/path")).toBe(
      "http://localhost:5124",
    );
  });

  it("passes a bare origin through unchanged", () => {
    expect(toOrigin("https://api.example.com")).toBe("https://api.example.com");
  });
});

describe("generateNonce", () => {
  it("returns a non-empty base64-looking string", () => {
    const nonce = generateNonce();
    expect(nonce.length).toBeGreaterThan(0);
    expect(nonce).toMatch(/^[A-Za-z0-9+/]+=*$/);
  });

  it("returns a different value on each call", () => {
    expect(generateNonce()).not.toBe(generateNonce());
  });
});

describe("buildContentSecurityPolicy", () => {
  it("includes the required directives with the specified minimum values", () => {
    const csp = buildContentSecurityPolicy({ nonce: "abc" });
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("form-action 'self'");
  });

  it("scopes script-src to the nonce by default, with no 'unsafe-inline'", () => {
    const csp = buildContentSecurityPolicy({ nonce: "abc123" });
    expect(csp).toContain("script-src 'self' 'nonce-abc123'");
    expect(csp).not.toMatch(/script-src[^;]*unsafe-inline/);
  });

  it("uses 'unsafe-inline' for script-src when allowInlineScript is set (static routes) - no nonce needed", () => {
    const csp = buildContentSecurityPolicy({ allowInlineScript: true });
    expect(csp).toContain("script-src 'self' 'unsafe-inline'");
    expect(csp).not.toContain("nonce-");
  });

  it("style-src is always 'unsafe-inline' - never nonce-based (see the module doc comment for why)", () => {
    const csp = buildContentSecurityPolicy({ nonce: "abc" });
    expect(csp).toContain("style-src 'self' 'unsafe-inline'");
    expect(csp).not.toMatch(/style-src[^;]*nonce-/);
    // No separate style-src-attr directive either - 'unsafe-inline' on style-src alone (with no
    // nonce/hash present in that directive) already covers both <style> elements and the style
    // attribute.
    expect(csp).not.toContain("style-src-attr");
  });

  it("has no legacy API origin or YouTube by default", () => {
    const csp = buildContentSecurityPolicy({ nonce: "abc" });
    expect(csp).toContain("connect-src 'self'");
    expect(csp).not.toContain("youtube.com");
    expect(csp).toContain("frame-src 'none'");
  });

  it("adds the legacy API origin to connect-src only when provided", () => {
    const csp = buildContentSecurityPolicy({
      nonce: "abc",
      legacyApiOrigin: "http://localhost:5124",
    });
    expect(csp).toContain("connect-src 'self' http://localhost:5124");
  });

  it("adds YouTube script/img/frame origins only when includeYouTube is set", () => {
    const csp = buildContentSecurityPolicy({
      nonce: "abc",
      includeYouTube: true,
    });
    expect(csp).toContain(
      "script-src 'self' 'nonce-abc' https://www.youtube.com",
    );
    expect(csp).toContain("img-src 'self' https://img.youtube.com");
    expect(csp).toContain("frame-src https://www.youtube.com");
  });
});

describe("buildBaseSecurityHeaders", () => {
  it("sets HSTS without preload or includeSubDomains", () => {
    const header = buildBaseSecurityHeaders().find(
      (h) => h.key === "Strict-Transport-Security",
    );
    expect(header?.value).toBe("max-age=31536000");
    expect(header?.value).not.toMatch(/preload|includeSubDomains/);
  });

  it("sets the other minimum-required headers", () => {
    const headers = buildBaseSecurityHeaders();
    const byKey = Object.fromEntries(headers.map((h) => [h.key, h.value]));
    expect(byKey["X-Content-Type-Options"]).toBe("nosniff");
    expect(byKey["Referrer-Policy"]).toBeTruthy();
    expect(byKey["Permissions-Policy"]).toBeTruthy();
  });
});
