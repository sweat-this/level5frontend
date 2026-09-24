import { expect, test, type Page } from "@playwright/test";

// Mirrors cookie-policy.ts's DEV_COOKIE_NAME - not imported directly, since that module is
// marked "server-only" and throws outside Next's own server-rendering context (Playwright's test
// runner is plain Node, not that context).
const DEV_COOKIE_NAME = "level5_session";

// Real-Backend-V2 browser-session certification (issue #10): the opaque session cookie is the
// only thing the browser ever gets - no Backend V2 access/refresh token in document.cookie,
// localStorage, sessionStorage, page HTML, the URL, or console output. Runs in the same dev-mode
// (plain HTTP, next dev) configuration as the rest of e2e/ - see playwright.config.ts's header
// comment for why. The production-only cookie attributes this can't exercise here (Secure,
// __Host- prefix - both require HTTPS) are certified by the production E2E suite instead; this
// spec still asserts every attribute that IS meaningful over plain HTTP (HttpOnly, SameSite=Lax,
// Path=/, no Domain, and the dev cookie name).

function uniqueUsername(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

const PASSWORD = "Str0ng!Passw0rd#123";

async function registerNewAccount(
  page: Page,
  username: string,
  displayName: string,
): Promise<void> {
  await page.goto("/account/register");
  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Display Name").fill(displayName);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/account$/);
}

// Backend V2 credentials are opaque bearer/refresh tokens - not something this test can compare
// against a known value, so it scans for the shapes a leaked one would plausibly take instead:
// JWT-looking strings (header.payload.signature) and common field-name/value patterns.
const SUSPICIOUS_PATTERNS: readonly RegExp[] = [
  /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/, // JWT shape
  /"?(access|refresh)[_-]?token"?\s*[:=]\s*"[^"]{8,}"/i,
  /Bearer\s+[A-Za-z0-9._-]{10,}/,
];

function assertNoSuspiciousContent(source: string, where: string): void {
  for (const pattern of SUSPICIOUS_PATTERNS) {
    expect(source, `${where} must not contain a leaked credential`).not.toMatch(
      pattern,
    );
  }
}

test.describe("no Backend V2 credential ever reaches the browser", () => {
  test("cookie: HttpOnly, SameSite=Lax, Path=/, no Domain, dev name - and no separate token cookie", async ({
    page,
    context,
  }) => {
    const username = uniqueUsername("e2e_nolk");
    await registerNewAccount(page, username, "No Leak Player");

    const cookies = await context.cookies();
    const sessionCookie = cookies.find((c) => c.name === DEV_COOKIE_NAME);
    expect(sessionCookie).toBeDefined();
    expect(sessionCookie?.httpOnly).toBe(true);
    expect(sessionCookie?.sameSite).toBe("Lax");
    expect(sessionCookie?.path).toBe("/");
    // Playwright reports an unset Domain attribute as the request host itself (host-only cookie),
    // never a leading-dot wildcard domain - buildSessionCookie() never sets `domain` at all.
    expect(sessionCookie?.domain.startsWith(".")).toBe(false);

    // Exactly one cookie for this app - no second, non-HttpOnly cookie carrying a token.
    const appCookies = cookies.filter(
      (c) => c.name === DEV_COOKIE_NAME || /token|access|refresh/i.test(c.name),
    );
    expect(appCookies).toHaveLength(1);
  });

  test("document.cookie never exposes the session value or a token", async ({
    page,
  }) => {
    const username = uniqueUsername("e2e_nolk");
    await registerNewAccount(page, username, "No Leak Player");

    const visibleCookie = await page.evaluate(() => document.cookie);
    // HttpOnly means the cookie must be entirely absent from document.cookie, not just its value
    // hidden - the name shouldn't appear either.
    expect(visibleCookie).not.toContain(DEV_COOKIE_NAME);
    assertNoSuspiciousContent(visibleCookie, "document.cookie");
  });

  test("localStorage and sessionStorage are never used for auth state", async ({
    page,
  }) => {
    const username = uniqueUsername("e2e_nolk");
    await registerNewAccount(page, username, "No Leak Player");
    await page.goto("/account/profile");

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

    assertNoSuspiciousContent(JSON.stringify(storageDump), "local/sessionStorage");
  });

  test("rendered HTML never embeds a token, on the dashboard or the profile/friends pages", async ({
    page,
  }) => {
    const username = uniqueUsername("e2e_nolk");
    await registerNewAccount(page, username, "No Leak Player");

    for (const path of ["/account", "/account/profile", "/account/friends"]) {
      await page.goto(path);
      const html = await page.content();
      assertNoSuspiciousContent(html, `HTML of ${path}`);
    }
  });

  test("the URL never carries a token across login, reload, or navigation", async ({
    page,
  }) => {
    const username = uniqueUsername("e2e_nolk");
    await registerNewAccount(page, username, "No Leak Player");
    assertNoSuspiciousContent(page.url(), "URL after register");

    await page.reload();
    assertNoSuspiciousContent(page.url(), "URL after reload");

    await page.goto("/account/profile");
    assertNoSuspiciousContent(page.url(), "URL after navigating to profile");
  });

  test("console output during login never logs a token", async ({ page }) => {
    const consoleText: string[] = [];
    page.on("console", (msg) => consoleText.push(msg.text()));

    const username = uniqueUsername("e2e_nolk");
    await registerNewAccount(page, username, "No Leak Player");
    await page.goto("/account");
    await page.getByRole("button", { name: "Log out" }).click();
    await expect(page).toHaveURL(/\/account\/login/);
    await page.getByLabel("Username").fill(username);
    await page.getByLabel("Password").fill(PASSWORD);
    await page.getByRole("button", { name: "Log in" }).click();
    await expect(page).toHaveURL(/\/account$/);

    assertNoSuspiciousContent(consoleText.join("\n"), "console output");
  });
});
