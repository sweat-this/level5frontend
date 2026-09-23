import { describe, expect, it } from "vitest";
import {
  buildExpiredSessionCookie,
  buildSessionCookie,
  DEV_COOKIE_NAME,
  PROD_COOKIE_NAME,
  sessionCookieName,
} from "./cookie-policy";

const FIXED_NOW = 1_700_000_000_000;
const fixedNow = () => FIXED_NOW;

describe("cookie-policy", () => {
  describe("development/test", () => {
    it("uses the plain cookie name without the __Host- prefix", () => {
      expect(sessionCookieName("development")).toBe(DEV_COOKIE_NAME);
      expect(sessionCookieName("test")).toBe(DEV_COOKIE_NAME);
      expect(sessionCookieName(undefined)).toBe(DEV_COOKIE_NAME);
    });

    it("does not require Secure", () => {
      const cookie = buildSessionCookie(
        "opaque-value",
        FIXED_NOW + 3_600_000,
        "development",
        fixedNow,
      );
      expect(cookie.name).toBe(DEV_COOKIE_NAME);
      expect(cookie.secure).toBe(false);
      expect(cookie.httpOnly).toBe(true);
      expect(cookie.sameSite).toBe("lax");
      expect(cookie.path).toBe("/");
    });
  });

  describe("production", () => {
    it("uses the __Host- prefixed cookie name", () => {
      expect(sessionCookieName("production")).toBe(PROD_COOKIE_NAME);
      expect(PROD_COOKIE_NAME.startsWith("__Host-")).toBe(true);
    });

    it("requires Secure, HttpOnly, SameSite=Lax, Path=/, and never sets Domain", () => {
      const cookie = buildSessionCookie(
        "opaque-value",
        FIXED_NOW + 3_600_000,
        "production",
        fixedNow,
      );
      expect(cookie.name).toBe(PROD_COOKIE_NAME);
      expect(cookie.secure).toBe(true);
      expect(cookie.httpOnly).toBe(true);
      expect(cookie.sameSite).toBe("lax");
      expect(cookie.path).toBe("/");
      expect(cookie).not.toHaveProperty("domain");
    });
  });

  it("never places the raw session value anywhere but `value`", () => {
    const cookie = buildSessionCookie(
      "opaque-value",
      FIXED_NOW + 3_600_000,
      "production",
      fixedNow,
    );
    expect(cookie.value).toBe("opaque-value");
  });

  describe("Max-Age derived from the session's absolute expiry", () => {
    it("computes Max-Age as the whole-second gap to absoluteExpiresAt", () => {
      const cookie = buildSessionCookie(
        "opaque-value",
        FIXED_NOW + 90_500,
        "production",
        fixedNow,
      );
      expect(cookie.maxAge).toBe(90);
    });

    it("clamps Max-Age at zero for an already-past absoluteExpiresAt", () => {
      const cookie = buildSessionCookie(
        "opaque-value",
        FIXED_NOW - 1000,
        "production",
        fixedNow,
      );
      expect(cookie.maxAge).toBe(0);
    });

    it("never exceeds the session's own absolute lifetime", () => {
      const absoluteExpiresAt = FIXED_NOW + 5000;
      const cookie = buildSessionCookie(
        "opaque-value",
        absoluteExpiresAt,
        "production",
        fixedNow,
      );
      expect(FIXED_NOW + cookie.maxAge * 1000).toBeLessThanOrEqual(
        absoluteExpiresAt,
      );
    });
  });

  it("expires the cookie with an empty value and maxAge 0 in both policies", () => {
    for (const env of ["development", "production"] as const) {
      const expired = buildExpiredSessionCookie(env);
      expect(expired.value).toBe("");
      expect(expired.maxAge).toBe(0);
    }
  });
});
