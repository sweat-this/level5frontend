import { expect, test, type Page } from "@playwright/test";

// Real-Backend-V2 E2E for issue #6's account vertical slice. Requires a live local Backend V2
// (see v2/scripts/setup-local-dev.ps1 or equivalent) reachable at LEVEL5_E2E_BACKEND_BASE_URL
// (default http://localhost:5053) with a disposable/local V2 database - never point this at
// production, registration here creates real accounts. Run with:
//   npx playwright test
// See playwright.config.ts for the full env var surface (session-store backend, port, etc).

function uniqueUsername(): string {
  return `e2e_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

const PASSWORD = "Str0ng!Passw0rd#123";

async function registerNewAccount(
  page: Page,
  username: string,
): Promise<void> {
  await page.goto("/account/register");
  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Display Name").fill("E2E Player");
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
}

test.describe("account vertical slice", () => {
  test("register -> dashboard -> reload -> logout -> protected redirect -> log back in", async ({
    page,
  }) => {
    const username = uniqueUsername();

    await registerNewAccount(page, username);

    // Successful registration establishes the session directly and redirects to /account.
    await expect(page).toHaveURL(/\/account$/);
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
    const username = uniqueUsername();
    await registerNewAccount(page, username);
    await expect(page).toHaveURL(/\/account$/);

    await page.getByRole("button", { name: "Log out" }).click();
    await expect(page).toHaveURL(/\/account\/login/);

    await page.getByLabel("Username").fill(username);
    await page.getByLabel("Password").fill("definitely-the-wrong-password");
    await page.getByRole("button", { name: "Log in" }).click();

    await expect(page.getByText("Username or password is incorrect.")).toBeVisible();
    await expect(page).toHaveURL(/\/account\/login/);
  });
});
