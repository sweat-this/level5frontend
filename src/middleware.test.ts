import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { middleware } from "./middleware";

beforeEach(() => {
  vi.unstubAllEnvs();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

function requestFor(pathname: string): NextRequest {
  return new NextRequest(new URL(pathname, "http://localhost:3000"));
}

describe("middleware", () => {
  it("sets a Content-Security-Policy with a nonce and no legacy API/YouTube on the root route", () => {
    const response = middleware(requestFor("/"));
    const csp = response.headers.get("Content-Security-Policy");
    expect(csp).toContain("script-src 'self' 'nonce-");
    expect(csp).not.toContain("youtube.com");
  });

  it("forwards the nonce as a request header so the root layout can read it", () => {
    const response = middleware(requestFor("/"));
    const csp = response.headers.get("Content-Security-Policy");
    const match = csp?.match(/'nonce-([^']+)'/);
    expect(match).toBeTruthy();
    const nonce = match?.[1];
    expect(response.headers.get("x-middleware-request-x-nonce")).toBe(nonce);
  });

  it("adds the legacy API origin to connect-src on /level5", () => {
    vi.stubEnv("NEXT_PUBLIC_LEGACY_API_BASE_URL", "http://localhost:5124");
    const response = middleware(requestFor("/level5"));
    expect(response.headers.get("Content-Security-Policy")).toContain(
      "connect-src 'self' http://localhost:5124",
    );
  });

  it("adds YouTube origins only on /level5/drblood", () => {
    const drblood = middleware(requestFor("/level5/drblood"));
    expect(drblood.headers.get("Content-Security-Policy")).toContain(
      "youtube.com",
    );

    const characters = middleware(requestFor("/level5/characters"));
    expect(characters.headers.get("Content-Security-Policy")).not.toContain(
      "youtube.com",
    );
  });

  it("does not add the legacy API origin on account or root routes", () => {
    for (const path of ["/", "/account/login", "/account/profile"]) {
      vi.stubEnv("NEXT_PUBLIC_LEGACY_API_BASE_URL", "http://localhost:5124");
      const response = middleware(requestFor(path));
      expect(response.headers.get("Content-Security-Policy")).not.toContain(
        "localhost:5124",
      );
    }
  });

  it("sets the base security headers on every route", () => {
    const response = middleware(requestFor("/account/login"));
    expect(response.headers.get("Strict-Transport-Security")).toBe(
      "max-age=31536000",
    );
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(response.headers.get("X-Frame-Options")).toBe("DENY");
  });
});
