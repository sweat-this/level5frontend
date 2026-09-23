import { describe, expect, it } from "vitest";
import {
  buildExpiredSessionCookie,
  buildSessionCookie,
  DEV_COOKIE_NAME,
  PROD_COOKIE_NAME,
  sessionCookieName,
} from "./cookie-policy";

describe("cookie-policy", () => {
  describe("development/test", () => {
    it("uses the plain cookie name without the __Host- prefix", () => {
      expect(sessionCookieName("development")).toBe(DEV_COOKIE_NAME);
      expect(sessionCookieName("test")).toBe(DEV_COOKIE_NAME);
      expect(sessionCookieName(undefined)).toBe(DEV_COOKIE_NAME);
    });

    it("does not require Secure", () => {
      const cookie = buildSessionCookie("opaque-value", "development");
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
      const cookie = buildSessionCookie("opaque-value", "production");
      expect(cookie.name).toBe(PROD_COOKIE_NAME);
      expect(cookie.secure).toBe(true);
      expect(cookie.httpOnly).toBe(true);
      expect(cookie.sameSite).toBe("lax");
      expect(cookie.path).toBe("/");
      expect(cookie).not.toHaveProperty("domain");
    });
  });

  it("never places the raw session value anywhere but `value`", () => {
    const cookie = buildSessionCookie("opaque-value", "production");
    expect(cookie.value).toBe("opaque-value");
  });

  it("expires the cookie with an empty value and maxAge 0 in both policies", () => {
    for (const env of ["development", "production"] as const) {
      const expired = buildExpiredSessionCookie(env);
      expect(expired.value).toBe("");
      expect(expired.maxAge).toBe(0);
    }
  });
});
