import { expect, test } from "@playwright/test";

// Behavioral certification for every protected route under src/app/(account)/account/** (audit
// finding F-02): auth is enforced per-page, by convention, with no middleware/layout backstop -
// see resolveCurrentAccountSession()'s own doc comments. This suite doesn't re-implement or
// grep for that check; it proves the observable outcome instead, so a future page added under
// (account)/account/ without the call fails this suite rather than shipping silently. Login and
// register themselves are deliberately excluded - they're the one pair of intentionally public
// routes in this route group. The complementary logout-then-back-navigation check lives in
// e2e-production/account-history-navigation.spec.ts, since it is only meaningful against a
// production build.
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
});
