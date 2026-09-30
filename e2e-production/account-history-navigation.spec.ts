import { expect, test } from "@playwright/test";
import { registerNewAccount, uniqueUsername } from "../e2e/test-support/ui";

// Moved here from e2e/account-route-protection.spec.ts (audit finding F-02's history-navigation
// check). Entries A and B below are full document loads (page.goto), so this is browser
// history-traversal behavior, not the App Router's client cache: the browser reuses its
// HTTP-cached copy of a document on back/forward unless the response carried
// `Cache-Control: no-store`. A production build sends `private, no-cache, no-store, ...` on
// account pages, so going back re-requests the server and lands on the login redirect; `next dev`
// sends only `no-cache, must-revalidate`, so against the dev server this assertion fails
// deterministically. It certifies what actually ships, so it lives with the production-mode specs.
test("client-side history navigation back to a protected page after logout does not surface cached content", async ({
  page,
}) => {
  const username = uniqueUsername("e2ep_routeguard");
  await registerNewAccount(page, username, "Route Guard Player");

  // Prime the client router's cache for a protected page while still authenticated. This is
  // browser history entry A.
  await page.goto("/account/friends");
  await expect(
    page.getByRole("heading", { level: 1, name: "Friends" }),
  ).toBeVisible();

  // The "Log out" button only lives on /account (see reads.ts's own doc comment on that page),
  // so reaching it requires one more navigation - entry B - before logging out lands on
  // /account/login. Deliberately not using the shared logout() helper: it performs this same
  // /account hop internally, which would make a single goBack() land on entry B (/account)
  // instead of entry A (/account/friends) - the page this test needs to prove doesn't resurrect
  // cached content.
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
