import { expect, test } from "@playwright/test";

// Smallest maintainable visual regression coverage (issue #27): four screenshots at the
// highest-value breakpoints/routes, using Playwright's native toHaveScreenshot() - no custom
// image-diff code, no screenshot SaaS. Runs against this config's real `next build` + `next
// start` + HTTPS edge (see playwright.config.production.ts's header comment) rather than
// dev-mode, so nothing here is sensitive to Turbopack/HMR artifacts.
//
// The CI `e2e-production` job (Ubuntu + Chromium) is the authoritative baseline environment -
// cross-OS font/rendering differences make pixel snapshots inherently environment-sensitive, and
// Playwright's own snapshot naming already keys baselines by platform (this file's baselines
// taken locally on Windows land in *-win32.png, never compared against a Linux CI run). That job
// is currently informational (continue-on-error: true - see ci.yml and this repo's issue #10
// notes), so a visual diff here does not yet block a merge; promoting it to a required gate is a
// CI/branch-protection decision that belongs to that job's own ownership, not to this
// UX-certification issue.
//
// Deliberately excludes anything with per-viewer/per-run content (Player Tags, generated
// usernames, timestamps, series ids, friend data) - the semantic/responsive E2E suites already
// protect those surfaces far more reliably than a pixel snapshot could. Every route captured here
// is static, unauthenticated, public content.

test.describe("visual regression - highest-value breakpoints (issue #27)", () => {
  test("Sweat This homepage - desktop", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/");
    await expect(
      page.getByRole("heading", { level: 1 }).first(),
    ).toBeVisible();
    await expect(page).toHaveScreenshot("homepage-desktop.png", {
      fullPage: true,
    });
  });

  test("Sweat This homepage - mobile Drawer open", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    await page.getByRole("button", { name: "Open navigation menu" }).click();
    await expect(page.getByRole("navigation", { name: "Mobile" })).toBeVisible();
    await expect(page).toHaveScreenshot("homepage-mobile-drawer-open.png");
  });

  test("Level 5 hub - desktop", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/level5");
    await expect(
      page.getByRole("heading", { level: 1 }).first(),
    ).toBeVisible();
    await expect(page).toHaveScreenshot("level5-hub-desktop.png", {
      fullPage: true,
    });
  });

  test("Secret Robot hub - desktop", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/secret-robot");
    await expect(
      page.getByRole("heading", { level: 1 }).first(),
    ).toBeVisible();
    await expect(page).toHaveScreenshot("secret-robot-hub-desktop.png", {
      fullPage: true,
    });
  });
});
