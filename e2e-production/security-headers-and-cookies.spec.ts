import { expect, test } from "@playwright/test";
import { registerNewAccount, uniqueUsername } from "../e2e/test-support/ui";

// Production-only certification (issue #10): the __Host-/Secure cookie attributes require a
// real HTTPS origin to ever actually apply - cookie-policy.ts only sets `secure: true` and the
// __Host- prefix when NODE_ENV=production, and a browser silently drops any cookie whose
// attributes don't match its actual name-prefix/scheme requirements, so this can only be proven
// through the HTTPS edge (see playwright.config.production.ts), never in the dev-mode suite.

test.describe("production security headers", () => {
  test("HSTS, CSP, and the other minimum headers are present on a real HTTPS response", async ({
    page,
  }) => {
    const response = await page.goto("/account/login");
    expect(response).not.toBeNull();
    const headers = response!.headers();

    expect(headers["strict-transport-security"]).toBe("max-age=31536000");
    expect(headers["strict-transport-security"]).not.toMatch(
      /preload|includeSubDomains/,
    );
    expect(headers["x-content-type-options"]).toBe("nosniff");
    expect(headers["x-frame-options"]).toBe("DENY");
    expect(headers["referrer-policy"]).toBeTruthy();
    expect(headers["permissions-policy"]).toBeTruthy();

    const csp = headers["content-security-policy"];
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("form-action 'self'");
    expect(csp).toMatch(/script-src 'self' 'nonce-/);

    expect(headers["x-powered-by"]).toBeUndefined();
  });

  test("no CSP violation or script-execution failure occurs on a real HTTPS page load", async ({
    page,
  }) => {
    const violations: string[] = [];
    page.on("console", (msg) => {
      if (/content security policy|refused to/i.test(msg.text())) {
        violations.push(msg.text());
      }
    });

    await page.goto("/account/login");
    await page.waitForTimeout(500);

    expect(violations).toEqual([]);
    // If script-src's nonce hadn't reached the real hydration scripts, the login form's
    // client-side validation/interactivity wouldn't work at all - a light behavioral check on
    // top of the header/console assertions above.
    await expect(page.getByLabel("Username")).toBeVisible();
  });

  test("no CSP violation occurs on an unmatched path (the not-found fallback)", async ({
    page,
  }) => {
    // Regression coverage (issue #10 review): proxy.ts's static-public-route allowlist is
    // keyed on exact pathname, which can never cover "any path that doesn't match a real route" -
    // an unmatched path always resolves to app/not-found.tsx's fallback. If that page were ever
    // statically rendered again (see its `export const dynamic = "force-dynamic"`), its inline
    // hydration scripts would carry no nonce while the proxy still sends a fresh nonce-only CSP
    // header, and the browser would correctly refuse to execute them - reproduced with a real
    // headless browser before this page was fixed to render dynamically.
    const violations: string[] = [];
    page.on("console", (msg) => {
      if (/content security policy|refused to/i.test(msg.text())) {
        violations.push(msg.text());
      }
    });
    const pageErrors: string[] = [];
    page.on("pageerror", (err) => pageErrors.push(err.message));

    const response = await page.goto("/this-path-does-not-exist");
    expect(response?.status()).toBe(404);
    await page.waitForTimeout(500);

    expect(violations).toEqual([]);
    expect(pageErrors).toEqual([]);
    await expect(page.getByText("Page not found")).toBeVisible();
    await expect(page.getByRole("link", { name: "Back home" })).toBeVisible();
  });
});

test.describe("production session cookie", () => {
  test("the session cookie is __Host-level5_session, Secure, HttpOnly, SameSite=Lax, Path=/, no Domain", async ({
    page,
    context,
  }) => {
    const username = uniqueUsername("e2ep_cookie");
    await registerNewAccount(page, username, "Prod Cookie Test");

    const cookies = await context.cookies();
    const sessionCookie = cookies.find(
      (c) => c.name === "__Host-level5_session",
    );
    expect(sessionCookie).toBeDefined();
    expect(sessionCookie?.secure).toBe(true);
    expect(sessionCookie?.httpOnly).toBe(true);
    expect(sessionCookie?.sameSite).toBe("Lax");
    expect(sessionCookie?.path).toBe("/");
    expect(sessionCookie?.domain.startsWith(".")).toBe(false);

    // No plain, non-__Host- cookie alongside it either.
    expect(cookies.find((c) => c.name === "level5_session")).toBeUndefined();
  });

  test("no Backend V2 credential reaches document.cookie, localStorage, sessionStorage, or the page HTML", async ({
    page,
  }) => {
    const username = uniqueUsername("e2ep_leak");
    await registerNewAccount(page, username, "Prod Leak Test");

    const jwtLike = /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/;

    const visibleCookie = await page.evaluate(() => document.cookie);
    expect(visibleCookie).not.toContain("level5_session");
    expect(visibleCookie).not.toMatch(jwtLike);

    const storageDump = await page.evaluate(() => {
      const dump: Record<string, string> = {};
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i)!;
        dump[`local:${key}`] = localStorage.getItem(key) ?? "";
      }
      for (let i = 0; i < sessionStorage.length; i++) {
        const key = sessionStorage.key(i)!;
        dump[`session:${key}`] = sessionStorage.getItem(key) ?? "";
      }
      return dump;
    });
    expect(JSON.stringify(storageDump)).not.toMatch(jwtLike);

    const html = await page.content();
    expect(html).not.toMatch(jwtLike);
  });
});
