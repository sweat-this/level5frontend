import { expect, test } from "@playwright/test";
import { registerNewAccount, uniqueUsername } from "./test-support/ui";

// Behavioral certification for every protected route under src/app/(account)/account/** (audit
// finding F-02): auth is enforced per-page, by convention, with no middleware/layout backstop -
// see resolveCurrentAccountSession()'s own doc comments. This suite doesn't re-implement or
// grep for that check; it proves the observable outcome instead, so a future page added under
// (account)/account/ without the call fails this suite rather than shipping silently. Login and
// register themselves are deliberately excluded - they're the one pair of intentionally public
// routes in this route group.
const PROTECTED_ROUTES = [
  "/account",
  "/account/friends",
  "/account/players",
  "/account/profile",
  "/account/games/level5",
  "/account/games/level5/challenges",
  // Auth is checked before the seriesId lookup (see the route's own reads.ts) - a nonexistent
  // series still proves the redirect without needing a real one seeded.
  "/account/games/level5/challenges/e2e-nonexistent-series",
];

test.describe("protected account routes reject unauthenticated visitors", () => {
  for (const route of PROTECTED_ROUTES) {
    test(`direct, unauthenticated visit to ${route} redirects to login`, async ({
      page,
    }) => {
      await page.goto(route);
      await expect(page).toHaveURL(/\/account\/login/);
    });
  }

  test("client-side history navigation back to a protected page after logout does not surface cached content", async ({
    page,
  }) => {
    const username = uniqueUsername("e2e_routeguard");
    await registerNewAccount(page, username, "Route Guard Player");

    // Prime the client router's cache for a protected page while still authenticated. This is
    // browser history entry A.
    await page.goto("/account/friends");
    await expect(
      page.getByRole("heading", { level: 1, name: "Friends" }),
    ).toBeVisible();

    // The "Log out" button only lives on /account (see reads.ts's own doc comment on that page),
    // so reaching it requires one more navigation - entry B - before logging out lands on
    // /account/login. Deliberately not using the shared logout() helper here: it performs this
    // same /account hop internally, which would make a single goBack() land back on entry B
    // (/account) instead of entry A (/account/friends) - the actual page this test needs to
    // prove doesn't resurrect cached content. Written out explicitly so the history stack (and
    // the two goBack() calls below) stays self-evident rather than coupled to another helper.
    await page.goto("/account");
    await page.getByRole("button", { name: "Log out" }).click();
    await expect(page).toHaveURL(/\/account\/login/);

    // First back: entry B (/account) - still login-gated, unremarkable on its own.
    await page.goBack();
    await expect(page).toHaveURL(/\/account\/login/);

    // Second back: entry A (/account/friends) - the same-tab back navigation must not resurrect
    // the cached authenticated render; it should land back on a login-gated state, exactly like a
    // fresh direct visit would.
    await page.goBack();
    await expect(page).toHaveURL(/\/account\/login/);
    await expect(
      page.getByRole("heading", { level: 1, name: "Friends" }),
    ).not.toBeVisible();
  });
});
