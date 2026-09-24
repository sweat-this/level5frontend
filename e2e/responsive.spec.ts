import { expect, test, type Page } from "@playwright/test";
import { acceptDirect, loginDirect, seedChallenge } from "./test-support/backend-seed";

// Real-Backend-V2 responsive smoke certification (issue #10): targeted viewport coverage for the
// social/challenge layouts specifically, not a 3x multiplication of the whole e2e/ suite - these
// two routes are the ones issue #10 calls out as needing verification that they don't depend on
// desktop-width tables (a static check already confirms neither friends/ nor challenges/ renders
// an actual <table> - both use Stack/List layouts - this is the runtime confirmation that those
// layouts stay usable, not just present, at small viewports).

function uniqueUsername(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

const PASSWORD = "Str0ng!Passw0rd#123";

const VIEWPORTS = {
  mobile: { width: 390, height: 844 }, // iPhone 12-class
  tablet: { width: 768, height: 1024 }, // iPad portrait
  desktop: { width: 1280, height: 800 },
} as const;

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

/**
 * No horizontal overflow within the app's own content - the classic symptom of a layout that
 * silently assumed desktop width. Scoped to <main> (the one semantic landmark every page renders
 * - see app/layout.tsx), not document.documentElement: `next dev`'s own floating "Next.js Dev
 * Tools" indicator is a fixed-position sibling of <main> that can itself read as viewport
 * overflow at narrow widths - a dev-mode-only artifact of the test harness, never present in a
 * production build, and not something this certification is trying to measure.
 */
async function assertNoHorizontalOverflow(page: Page): Promise<void> {
  const overflowing = await page.evaluate(() => {
    const main = document.querySelector("main");
    if (!main) {
      throw new Error("expected a <main> landmark on the page");
    }
    return main.scrollWidth > document.documentElement.clientWidth + 1;
  });
  expect(overflowing, "page content overflows at this viewport").toBe(false);
}

for (const [name, viewport] of Object.entries(VIEWPORTS)) {
  test.describe(`responsive - ${name} (${viewport.width}x${viewport.height})`, () => {
    test.use({ viewport });

    test("friends: list and incoming-request actions stay usable", async ({
      page,
    }) => {
      const aUsername = uniqueUsername(`e2er_${name.slice(0, 2)}a`);
      await registerNewAccount(page, aUsername, "Responsive Friend A");
      await page.goto("/account/profile");
      const tagA = (
        await page.getByText(/^[A-Za-z0-9_]+#\d{4}$/).textContent()
      )?.trim();
      expect(tagA).toBeTruthy();
      await logout(page);

      const bUsername = uniqueUsername(`e2er_${name.slice(0, 2)}b`);
      await registerNewAccount(page, bUsername, "Responsive Friend B");

      // B sends A a request through the real UI (never seeded - this is in-scope product UI,
      // unlike challenge creation).
      await page.goto("/account/players");
      await page.getByLabel("Player Tag").fill(tagA!);
      await page.getByRole("button", { name: "Search" }).click();
      const sendRequestButton = page.getByRole("button", {
        name: /Send friend request/,
      });
      await expect(sendRequestButton).toBeVisible();
      await assertNoHorizontalOverflow(page);
      await sendRequestButton.click();
      await expect(page).toHaveURL(/\/account\/friends\?notice=request-sent/);
      await logout(page);

      await page.goto("/account/login");
      await page.getByLabel("Username").fill(aUsername);
      await page.getByLabel("Password").fill(PASSWORD);
      await page.getByRole("button", { name: "Log in" }).click();
      await expect(page).toHaveURL(/\/account$/);

      await page.goto("/account/friends");
      await expect(
        page.getByRole("heading", { level: 1, name: "Friends" }),
      ).toBeVisible();
      await expect(page.getByText("Responsive Friend B")).toBeVisible();
      await expect(
        page.getByRole("button", { name: /^Accept friend request from/ }),
      ).toBeVisible();
      await assertNoHorizontalOverflow(page);
    });

    test("challenges: list and a challenge's detail stay usable", async ({
      page,
    }) => {
      const challengerUsername = uniqueUsername(`e2er_${name.slice(0, 2)}c`);
      await registerNewAccount(page, challengerUsername, "Responsive Challenger");
      const challengerBackend = await loginDirect(challengerUsername, PASSWORD);
      await logout(page);

      const opponentUsername = uniqueUsername(`e2er_${name.slice(0, 2)}o`);
      await registerNewAccount(page, opponentUsername, "Responsive Opponent");
      const opponentBackend = await loginDirect(opponentUsername, PASSWORD);

      const series = await seedChallenge(challengerBackend, opponentBackend);
      await acceptDirect(opponentBackend, series.id);

      await page.goto("/account/challenges");
      await assertNoHorizontalOverflow(page);

      await page.goto(`/account/challenges/${series.id}`);
      await assertNoHorizontalOverflow(page);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    });
  });
}
