import { expect, test } from "@playwright/test";

// Production caching certification (issue #10): authenticated/account routes must be dynamic,
// private/no-store, and never shared-CDN cacheable; public routes should retain their existing
// static/cacheable behavior. Checked against real `next start` response headers, not the dev
// server (Next's dev server doesn't apply the same caching headers a production build does).

test.describe("account routes are never cacheable", () => {
  for (const path of ["/account/login", "/account/register"]) {
    test(`${path} responds with a private, no-store Cache-Control`, async ({
      page,
    }) => {
      const response = await page.goto(path);
      const cacheControl = response?.headers()["cache-control"] ?? "";
      expect(cacheControl).toMatch(/no-store/);
      expect(cacheControl).toMatch(/private/);
    });
  }
});

test.describe("public routes retain cacheable behavior", () => {
  for (const path of ["/", "/level5", "/level5/characters", "/level5/drblood"]) {
    test(`${path} does not respond with an account-style private/no-store Cache-Control`, async ({
      page,
    }) => {
      const response = await page.goto(path);
      const cacheControl = response?.headers()["cache-control"] ?? "";
      // Not asserting a specific positive caching header (Next's own static-asset caching
      // strategy for prerendered pages isn't this suite's concern to pin exactly) - only that
      // these routes were never forced into the account routes' private/no-store treatment.
      expect(cacheControl).not.toMatch(/no-store/);
    });
  }
});
