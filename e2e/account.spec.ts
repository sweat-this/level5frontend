import { expect, test } from "@playwright/test";
import { PASSWORD, registerNewAccount, uniqueUsername } from "./test-support/ui";

// Real-Backend-V2 E2E for issue #6's account vertical slice. Requires a live local Backend V2
// (see v2/scripts/setup-local-dev.ps1 or equivalent) reachable at LEVEL5_E2E_BACKEND_BASE_URL
// (default http://localhost:5053) with a disposable/local V2 database - never point this at
// production, registration here creates real accounts. Run with:
//   npx playwright test
// See playwright.config.ts for the full env var surface (session-store backend, port, etc).

test.describe("account vertical slice", () => {
  test("register -> dashboard -> reload -> logout -> protected redirect -> log back in", async ({
    page,
  }) => {
    const username = uniqueUsername("e2e");

    // Successful registration establishes the session directly and redirects to /account.
    await registerNewAccount(page, username, "E2E Player");
    await expect(page.getByText(username)).toBeVisible();
    await expect(page.getByText("Active")).toBeVisible();
    await expect(page.getByText(/Member Since/)).toBeVisible();

    // Session restore: reloading the dashboard keeps the user authenticated.
    await page.reload();
    await expect(page).toHaveURL(/\/account$/);
    await expect(page.getByText(username)).toBeVisible();

    // Logout is a state-changing action that redirects to the login page.
    await page.getByRole("button", { name: "Log out" }).click();
    await expect(page).toHaveURL(/\/account\/login/);

    // A direct, unauthenticated visit to the protected route redirects to login.
    await page.goto("/account");
    await expect(page).toHaveURL(/\/account\/login/);

    // Logging back in with the same credentials reaches the dashboard again.
    await page.getByLabel("Username").fill(username);
    await page.getByLabel("Password").fill(PASSWORD);
    await page.getByRole("button", { name: "Log in" }).click();
    await expect(page).toHaveURL(/\/account$/);
    await expect(page.getByText(username)).toBeVisible();
  });

  test("wrong password shows the generic invalid-credentials message", async ({
    page,
  }) => {
    const username = uniqueUsername("e2e");
    await registerNewAccount(page, username, "E2E Player");

    await page.getByRole("button", { name: "Log out" }).click();
    await expect(page).toHaveURL(/\/account\/login/);

    await page.getByLabel("Username").fill(username);
    await page.getByLabel("Password").fill("definitely-the-wrong-password");
    await page.getByRole("button", { name: "Log in" }).click();

    await expect(page.getByText("Username or password is incorrect.")).toBeVisible();
    await expect(page).toHaveURL(/\/account\/login/);
  });
});

// Issue #25's shared identity dashboard and Level 5 game-data entry point. Extends this existing
// account vertical-slice suite rather than a separate fixture architecture - registration is the
// only seeding these tests need; friends/challenges keep their own dedicated suites.
test.describe("account dashboard (issue #25)", () => {
  test("shows identity, secondary account details, social links, and the Level 5 game-data entry point", async ({
    page,
  }) => {
    const username = uniqueUsername("e2e_dash");
    await registerNewAccount(page, username, "Dashboard Player");

    await expect(
      page.getByRole("heading", { level: 1, name: "Account" }),
    ).toBeVisible();

    // Identity leads with Display Name/Player Tag, not Username.
    const identity = page.getByRole("region", { name: "Identity" });
    await expect(identity.getByText("Dashboard Player")).toBeVisible();
    await expect(identity.getByText(/^[A-Za-z0-9_]+#\d{4}$/)).toBeVisible();
    await expect(
      identity.getByRole("link", { name: "Edit Profile" }),
    ).toBeVisible();

    // Social links to shared, Sweat This-wide features - no friend/request counts.
    const social = page.getByRole("region", { name: "Social" });
    await expect(social.getByRole("link", { name: "Friends" })).toBeVisible();
    await expect(
      social.getByRole("link", { name: "Find Player" }),
    ).toBeVisible();
    await expect(page.getByText(/\d+\s+Friends/)).toHaveCount(0);

    // Games links to Level 5's game-data entry point - no fabricated Secret Robot save UI.
    // Scoped to the Games section itself: "Secret Robot" legitimately appears in the site's
    // global nav elsewhere on the page.
    const games = page.getByRole("region", { name: "Games" });
    const level5Link = games.getByRole("link", { name: "Level 5" });
    await expect(level5Link).toBeVisible();
    await expect(games.getByText("Secret Robot")).toHaveCount(0);

    // Account details (Username/Status/Member Since) are preserved, just made secondary.
    const details = page.getByRole("region", { name: "Account details" });
    await expect(details.getByText(username)).toBeVisible();
    await expect(details.getByText("Active")).toBeVisible();
    await expect(details.getByText(/Member Since/)).toBeVisible();

    // Challenges is Level 5-specific correspondence, no longer a platform-level nav feature.
    await expect(
      page
        .getByRole("navigation", { name: "Account" })
        .getByRole("link", { name: "Challenges" }),
    ).toHaveCount(0);

    // The Games entry point links to the existing, unmigrated /account/challenges URL - issue
    // #26 owns moving it under /account/games/level5/challenges.
    await level5Link.click();
    await expect(page).toHaveURL(/\/account\/games\/level5$/);
    await expect(
      page.getByRole("heading", { level: 1, name: "Level 5" }),
    ).toBeVisible();

    const challengesLink = page.getByRole("link", { name: "Challenges" });
    await expect(challengesLink).toBeVisible();
    await challengesLink.click();
    await expect(page).toHaveURL(/\/account\/challenges$/);
  });

  test("an unauthenticated visit to the Level 5 game-data page redirects to login with returnTo", async ({
    page,
  }) => {
    await page.goto("/account/games/level5");
    await expect(page).toHaveURL(
      /\/account\/login\?returnTo=\/account\/games\/level5/,
    );
  });
});
