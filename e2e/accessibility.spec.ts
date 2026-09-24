import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { acceptDirect, loginDirect, seedChallenge } from "./test-support/backend-seed";

// Real-Backend-V2 automated accessibility certification (issue #10), on top of the existing
// jsx-a11y lint baseline (eslint.config.js) - that catches static/structural issues at author
// time; this catches runtime/rendered-DOM issues (contrast, landmark structure, ARIA usage,
// focus order artifacts) across the critical flows a lint rule can't see. See
// e2e/account.spec.ts's header comment for the shared prerequisites (live local Backend V2, etc).

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

async function logout(page: Page): Promise<void> {
  await page.goto("/account");
  await page.getByRole("button", { name: "Log out" }).click();
  await expect(page).toHaveURL(/\/account\/login/);
}

/** Runs axe against the current page and attaches full violation detail to the test report on
 *  failure, rather than just a pass/fail count. */
async function assertNoAxeViolations(
  page: Page,
  testInfo: TestInfo,
): Promise<void> {
  const results = await new AxeBuilder({ page })
    // WCAG 2.0/2.1 A/AA only - axe's default ruleset (no tag filter) also runs its own
    // "best-practice" rules (e.g. page-has-heading-one), which are stricter/more opinionated
    // than an actual WCAG success criterion and outside what this certification is scoped to.
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();

  if (results.violations.length > 0) {
    await testInfo.attach("axe-violations", {
      body: JSON.stringify(results.violations, null, 2),
      contentType: "application/json",
    });
  }
  expect(
    results.violations,
    `axe found ${results.violations.length} violation(s) - see the axe-violations attachment for detail`,
  ).toEqual([]);
}

test.describe("accessibility - critical flows", () => {
  test("register", async ({ page }, testInfo) => {
    await page.goto("/account/register");
    await assertNoAxeViolations(page, testInfo);
  });

  test("login", async ({ page }, testInfo) => {
    await page.goto("/account/login");
    await assertNoAxeViolations(page, testInfo);
  });

  test("account dashboard", async ({ page }, testInfo) => {
    await registerNewAccount(page, uniqueUsername("e2ea_dash"), "A11y Dashboard");
    await assertNoAxeViolations(page, testInfo);
  });

  test("profile", async ({ page }, testInfo) => {
    await registerNewAccount(page, uniqueUsername("e2ea_prof"), "A11y Profile");
    await page.goto("/account/profile");
    await assertNoAxeViolations(page, testInfo);
  });

  test("player lookup", async ({ page }, testInfo) => {
    await registerNewAccount(page, uniqueUsername("e2ea_look"), "A11y Lookup");
    await page.goto("/account/players");
    await assertNoAxeViolations(page, testInfo);
  });

  test("friends", async ({ page }, testInfo) => {
    await registerNewAccount(page, uniqueUsername("e2ea_frnd"), "A11y Friends");
    await page.goto("/account/friends");
    await assertNoAxeViolations(page, testInfo);
  });

  test("challenges list", async ({ page }, testInfo) => {
    await registerNewAccount(page, uniqueUsername("e2ea_chal"), "A11y Challenges");
    await page.goto("/account/challenges");
    await assertNoAxeViolations(page, testInfo);
  });

  test("challenge detail", async ({ page }, testInfo) => {
    const challengerUsername = uniqueUsername("e2ea_cd_a");
    await registerNewAccount(page, challengerUsername, "A11y Challenger");
    const challengerBackend = await loginDirect(challengerUsername, PASSWORD);
    await logout(page);

    const opponentUsername = uniqueUsername("e2ea_cd_b");
    await registerNewAccount(page, opponentUsername, "A11y Opponent");
    const opponentBackend = await loginDirect(opponentUsername, PASSWORD);

    const series = await seedChallenge(challengerBackend, opponentBackend);
    await acceptDirect(opponentBackend, series.id);

    await page.goto(`/account/challenges/${series.id}`);
    await assertNoAxeViolations(page, testInfo);
  });
});
