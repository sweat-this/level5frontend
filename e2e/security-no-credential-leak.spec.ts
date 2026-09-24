import { expect, test, type Page } from "@playwright/test";
import { PASSWORD, registerNewAccount, uniqueUsername } from "./test-support/ui";

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

// Backend V2 credentials are opaque bearer/refresh tokens, so a shape-based heuristic alone can't
// prove a real token isn't leaking under a shape it doesn't anticipate. Kept as a first, cheap
// pass (still useful - it catches an obviously token-shaped string even if it isn't this
// session's), but every real assertion below also fetches this session's actual token values via
// /api/auth-cert/session-secrets (a certification-only route, gated off in production - see its
// own file) and checks for that literal value, per issue #10's own requirement.
const SUSPICIOUS_PATTERNS: readonly RegExp[] = [
  /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/, // JWT shape
  /"?(access|refresh)[_-]?token"?\s*[:=]\s*"[^"]{8,}"/i,
  /Bearer\s+[A-Za-z0-9._-]{10,}/,
];

interface SessionSecrets {
  readonly accessToken: string;
  readonly refreshToken: string;
}

async function fetchSessionSecrets(page: Page): Promise<SessionSecrets> {
  const response = await page.request.get("/api/auth-cert/session-secrets");
  expect(
    response.ok(),
    "session-secrets certification route must be reachable and authenticated - if this fails, the test itself is broken, not the thing it's certifying",
  ).toBe(true);
  return (await response.json()) as SessionSecrets;
}

function assertNoSuspiciousContent(
  source: string,
  where: string,
  secrets?: SessionSecrets,
): void {
  for (const pattern of SUSPICIOUS_PATTERNS) {
    expect(source, `${where} must not contain a leaked credential`).not.toMatch(
      pattern,
    );
  }
  if (secrets) {
    expect(
      source,
      `${where} must not contain this session's real, literal access token`,
    ).not.toContain(secrets.accessToken);
    expect(
      source,
      `${where} must not contain this session's real, literal refresh token`,
    ).not.toContain(secrets.refreshToken);
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
    const secrets = await fetchSessionSecrets(page);

    const visibleCookie = await page.evaluate(() => document.cookie);
    // HttpOnly means the cookie must be entirely absent from document.cookie, not just its value
    // hidden - the name shouldn't appear either.
    expect(visibleCookie).not.toContain(DEV_COOKIE_NAME);
    assertNoSuspiciousContent(visibleCookie, "document.cookie", secrets);
  });

  test("localStorage and sessionStorage are never used for auth state", async ({
    page,
  }) => {
    const username = uniqueUsername("e2e_nolk");
    await registerNewAccount(page, username, "No Leak Player");
    const secrets = await fetchSessionSecrets(page);
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

    assertNoSuspiciousContent(
      JSON.stringify(storageDump),
      "local/sessionStorage",
      secrets,
    );
  });

  test("rendered HTML never embeds a token, on the dashboard or the profile/friends pages", async ({
    page,
  }) => {
    const username = uniqueUsername("e2e_nolk");
    await registerNewAccount(page, username, "No Leak Player");
    const secrets = await fetchSessionSecrets(page);

    for (const path of ["/account", "/account/profile", "/account/friends"]) {
      await page.goto(path);
      const html = await page.content();
      assertNoSuspiciousContent(html, `HTML of ${path}`, secrets);
    }
  });

  test("the URL never carries a token across login, reload, or navigation", async ({
    page,
  }) => {
    const username = uniqueUsername("e2e_nolk");
    await registerNewAccount(page, username, "No Leak Player");
    const secrets = await fetchSessionSecrets(page);
    assertNoSuspiciousContent(page.url(), "URL after register", secrets);

    await page.reload();
    assertNoSuspiciousContent(page.url(), "URL after reload", secrets);

    await page.goto("/account/profile");
    assertNoSuspiciousContent(
      page.url(),
      "URL after navigating to profile",
      secrets,
    );
  });

  test("console output during login never logs a token", async ({ page }) => {
    const consoleText: string[] = [];
    page.on("console", (msg) => consoleText.push(msg.text()));

    const username = uniqueUsername("e2e_nolk");
    await registerNewAccount(page, username, "No Leak Player");
    const secretsBeforeLogout = await fetchSessionSecrets(page);
    await page.goto("/account");
    await page.getByRole("button", { name: "Log out" }).click();
    await expect(page).toHaveURL(/\/account\/login/);
    await page.getByLabel("Username").fill(username);
    await page.getByLabel("Password").fill(PASSWORD);
    await page.getByRole("button", { name: "Log in" }).click();
    await expect(page).toHaveURL(/\/account$/);
    const secretsAfterLogin = await fetchSessionSecrets(page);

    const output = consoleText.join("\n");
    // Checked against both the pre-logout and the freshly re-issued post-login token/session, so
    // this can't pass merely because the console happened not to log the *new* session's secret
    // while still having logged the old one during the logout/login round trip.
    assertNoSuspiciousContent(output, "console output", secretsBeforeLogout);
    assertNoSuspiciousContent(output, "console output", secretsAfterLogin);
  });
});
