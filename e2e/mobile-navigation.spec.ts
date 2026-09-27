import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page, type TestInfo } from "@playwright/test";

// Global mobile navigation certification (issue #27): PlatformHeader's Drawer menu (issue #21)
// only ever had its rendered markup covered by the desktop-oriented accessibility/responsive
// suites - never a real keyboard/focus walk of the mobile menu itself, and never an axe scan while
// it's actually open (its destinations/trigger are display:none at desktop width, so a desktop-
// viewport axe scan never sees them at all). Uses MUI's own Drawer/Modal focus management
// throughout - no custom focus trap is implemented here or in PlatformHeader.

const MOBILE_VIEWPORT = { width: 390, height: 844 };

async function assertNoAxeViolations(
  page: Page,
  testInfo: TestInfo,
): Promise<void> {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
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

test.describe("mobile navigation (issue #27)", () => {
  test.use({ viewport: MOBILE_VIEWPORT });

  test("the menu trigger is keyboard-reachable and Enter opens the Drawer with focus managed inside it", async ({
    page,
  }) => {
    await page.goto("/");

    const trigger = page.getByRole("button", { name: "Open navigation menu" });
    await trigger.focus();
    await expect(trigger).toBeFocused();

    await page.keyboard.press("Enter");

    const nav = page.getByRole("navigation", { name: "Mobile" });
    await expect(nav).toBeVisible();

    // MUI's Modal (which Drawer uses internally) moves focus onto the Drawer's own dialog root
    // automatically on open - never left behind on the (now aria-hidden) trigger button. That
    // root is an ancestor of `nav` (the Drawer's Paper, not a descendant of it), so this checks
    // the dialog itself rather than nav.contains(...).
    const dialog = page.getByRole("dialog");
    const focusIsInsideDrawer = await dialog.evaluate((dialogEl) =>
      dialogEl.contains(document.activeElement),
    );
    expect(focusIsInsideDrawer).toBe(true);
  });

  test("Tab reaches every navigation destination inside the open Drawer", async ({
    page,
  }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Open navigation menu" }).click();

    const nav = page.getByRole("navigation", { name: "Mobile" });
    await expect(nav).toBeVisible();

    const destinationNames = ["Sweat This", "Level 5", "Secret Robot", "Sign In"];
    for (const name of destinationNames) {
      const link = nav.getByRole("link", { name, exact: true });
      // Bounded forward-Tab search from wherever focus currently sits, matching the existing
      // Level 5 local-nav keyboard test's approach (destinations are in a fixed, known order, but
      // exactly how many stops precede the first one can shift with markup details worth staying
      // resilient to).
      const MAX_TAB_STOPS = 10;
      let reached = false;
      for (let i = 0; i < MAX_TAB_STOPS; i += 1) {
        if (await link.evaluate((el) => el === document.activeElement)) {
          reached = true;
          break;
        }
        await page.keyboard.press("Tab");
      }
      if (!reached) {
        reached = await link.evaluate((el) => el === document.activeElement);
      }
      expect(reached, `${name} was not reached by keyboard Tab`).toBe(true);
    }
  });

  test("Escape closes the Drawer and restores focus to the trigger", async ({
    page,
  }) => {
    await page.goto("/");

    const trigger = page.getByRole("button", { name: "Open navigation menu" });
    await trigger.click();

    const nav = page.getByRole("navigation", { name: "Mobile" });
    await expect(nav).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(nav).not.toBeVisible();
    await expect(trigger).toBeFocused();
  });

  test("selecting a destination closes the Drawer and navigates", async ({
    page,
  }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Open navigation menu" }).click();

    const nav = page.getByRole("navigation", { name: "Mobile" });
    await nav.getByRole("link", { name: "Level 5", exact: true }).click();

    await expect(page).toHaveURL(/\/level5$/);
    await expect(nav).not.toBeVisible();
  });

  test("the open Drawer at mobile width has no WCAG 2.2 AA violations", async ({
    page,
  }, testInfo) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Open navigation menu" }).click();
    await expect(page.getByRole("navigation", { name: "Mobile" })).toBeVisible();

    await assertNoAxeViolations(page, testInfo);
  });

  test("the Drawer stays fully usable with prefers-reduced-motion enabled", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");

    const trigger = page.getByRole("button", { name: "Open navigation menu" });
    await trigger.click();

    const nav = page.getByRole("navigation", { name: "Mobile" });
    await expect(nav).toBeVisible();
    await nav.getByRole("link", { name: "Level 5", exact: true }).click();
    await expect(page).toHaveURL(/\/level5$/);
  });
});
