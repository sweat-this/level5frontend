import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "./proxy";

beforeEach(() => {
  vi.unstubAllEnvs();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

function requestFor(pathname: string): NextRequest {
  return new NextRequest(new URL(pathname, "http://localhost:3000"));
}

describe("proxy", () => {
  it("uses a nonce-based script-src (no 'unsafe-inline') on a dynamically-rendered route", () => {
    const response = proxy(requestFor("/account/login"));
    const csp = response.headers.get("Content-Security-Policy");
    expect(csp).toContain("script-src 'self' 'nonce-");
    expect(csp).not.toMatch(/script-src[^;]*unsafe-inline/);
  });

  it("uses 'unsafe-inline' (no nonce) on the statically-rendered root route - a per-request nonce can never be correct there", () => {
    const response = proxy(requestFor("/"));
    const csp = response.headers.get("Content-Security-Policy");
    expect(csp).toContain("script-src 'self' 'unsafe-inline'");
    expect(csp).not.toContain("nonce-");
    expect(csp).not.toContain("youtube.com");
  });

  it("generates a different nonce per request on a dynamic route", () => {
    const first = proxy(requestFor("/account/login")).headers.get(
      "Content-Security-Policy",
    );
    const second = proxy(requestFor("/account/login")).headers.get(
      "Content-Security-Policy",
    );
    expect(first).not.toBe(second);
  });

  it("adds the legacy API origin to connect-src on /level5/leaderboards", () => {
    vi.stubEnv("NEXT_PUBLIC_LEGACY_API_BASE_URL", "http://localhost:5124");
    const response = proxy(requestFor("/level5/leaderboards"));
    expect(response.headers.get("Content-Security-Policy")).toContain(
      "connect-src 'self' http://localhost:5124",
    );
  });

  it("adds YouTube origins only on /level5/drblood", () => {
    const drblood = proxy(requestFor("/level5/drblood"));
    expect(drblood.headers.get("Content-Security-Policy")).toContain(
      "youtube.com",
    );

    const characters = proxy(requestFor("/level5/characters"));
    expect(characters.headers.get("Content-Security-Policy")).not.toContain(
      "youtube.com",
    );
  });

  it("does not add the legacy API origin outside /level5/leaderboards - issue #23 narrowed the boundary after leaderboard relocation", () => {
    const nonLeaderboardRoutes = [
      "/",
      "/account/login",
      "/account/profile",
      "/level5",
      "/level5/modes",
      "/level5/characters",
      "/level5/versus",
      "/level5/drblood",
    ];
    for (const path of nonLeaderboardRoutes) {
      vi.stubEnv("NEXT_PUBLIC_LEGACY_API_BASE_URL", "http://localhost:5124");
      const response = proxy(requestFor(path));
      expect(response.headers.get("Content-Security-Policy")).not.toContain(
        "localhost:5124",
      );
    }
  });

  it("sets the base security headers on every route", () => {
    const response = proxy(requestFor("/account/login"));
    expect(response.headers.get("Strict-Transport-Security")).toBe(
      "max-age=31536000",
    );
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(response.headers.get("X-Frame-Options")).toBe("DENY");
  });
});
