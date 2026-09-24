import { expect, test } from "@playwright/test";
import { login, logout, registerNewAccount, uniqueUsername } from "./test-support/ui";

// Real-Backend-V2 E2E for issue #7's player profile + exact Player Tag lookup. See
// e2e/account.spec.ts's header comment for the shared prerequisites (live local Backend V2,
// disposable/local V2 database, playwright.config.ts's env var surface).

test.describe("player profile", () => {
  test("shows the initial Display Name and Player Tag, edits the Display Name, and persists across reload with the tag unchanged", async ({
    page,
  }) => {
    const username = uniqueUsername("e2e_profile");
    await registerNewAccount(page, username, "Original Name");

    await page.goto("/account/profile");
    await expect(
      page.getByLabel(/^Display Name/),
    ).toHaveValue("Original Name");
    const tagLocator = page.getByText(/^[A-Za-z0-9_]+#\d{4}$/);
    await expect(tagLocator).toBeVisible();
    const tag = (await tagLocator.textContent())?.trim();
    expect(tag).toBeTruthy();

    await page.getByLabel(/^Display Name/).fill("Updated Name");
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("Display name updated.")).toBeVisible();

    await page.reload();
    await expect(
      page.getByLabel(/^Display Name/),
    ).toHaveValue("Updated Name");
    await expect(page.getByText(tag!)).toBeVisible();
  });

  test("reconciles the field to Backend V2's trimmed name immediately, before any reload", async ({
    page,
  }) => {
    const username = uniqueUsername("e2e_trim");
    await registerNewAccount(page, username, "Original Name");

    await page.goto("/account/profile");
    await page.getByLabel(/^Display Name/).fill("  Padded Name  ");
    await page.getByRole("button", { name: "Save" }).click();

    // Reconciled from the mutation response itself (issue #10), not from a reload.
    await expect(page.getByText("Display name updated.")).toBeVisible();
    await expect(page.getByLabel(/^Display Name/)).toHaveValue("Padded Name");

    await page.reload();
    await expect(page.getByLabel(/^Display Name/)).toHaveValue("Padded Name");
  });

  test("copies the Player Tag to the clipboard", async ({
    page,
    context,
  }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    const username = uniqueUsername("e2e_copy");
    await registerNewAccount(page, username, "Copy Player");

    await page.goto("/account/profile");
    const tagLocator = page.getByText(/^[A-Za-z0-9_]+#\d{4}$/);
    const tag = (await tagLocator.textContent())?.trim();

    await page.getByRole("button", { name: /Copy player tag/ }).click();
    await expect(page.getByText("Copied.")).toBeVisible();

    const clipboardText = await page.evaluate(() =>
      navigator.clipboard.readText(),
    );
    expect(clipboardText).toBe(tag);
  });

  test("an unauthenticated visit to /account/profile redirects to login", async ({
    page,
  }) => {
    await page.goto("/account/profile");
    await expect(page).toHaveURL(/\/account\/login\?returnTo=\/account\/profile/);
  });
});

test.describe("player lookup", () => {
  test("finds another player by their exact Player Tag", async ({
    page,
  }) => {
    const searcherUsername = uniqueUsername("e2e_searcher");
    await registerNewAccount(page, searcherUsername, "Searcher Player");
    await logout(page);

    const targetUsername = uniqueUsername("e2e_target");
    await registerNewAccount(page, targetUsername, "Target Player");
    await page.goto("/account/profile");
    const tagLocator = page.getByText(/^[A-Za-z0-9_]+#\d{4}$/);
    const targetTag = (await tagLocator.textContent())?.trim();
    expect(targetTag).toBeTruthy();
    await logout(page);

    await login(page, searcherUsername);
    await page.goto("/account/players");
    await page.getByLabel("Player Tag").fill(targetTag!);
    await page.getByRole("button", { name: "Search" }).click();

    // The GET form's own native submission builds the query string (never manually
    // interpolated) - what matters here is the rendered result, not the exact encoded URL.
    await expect(page.getByText("Target Player")).toBeVisible();
    await expect(page.getByText(targetTag!, { exact: true })).toBeVisible();
  });

  test("a well-formed but unknown tag reports no player found", async ({
    page,
  }) => {
    const username = uniqueUsername("e2e_notfound");
    await registerNewAccount(page, username, "Not Found Searcher");

    await page.goto("/account/players");
    await page.getByLabel("Player Tag").fill("Nobody#9999");
    await page.getByRole("button", { name: "Search" }).click();

    await expect(page.getByText("No player was found with that tag.")).toBeVisible();
  });

  test("a malformed tag reports an invalid-tag message", async ({
    page,
  }) => {
    const username = uniqueUsername("e2e_malformed");
    await registerNewAccount(page, username, "Malformed Searcher");

    await page.goto("/account/players");
    await page.getByLabel("Player Tag").fill("not-a-tag");
    await page.getByRole("button", { name: "Search" }).click();

    await expect(
      page.getByText("That doesn't look like a valid Player Tag."),
    ).toBeVisible();
  });

  test("an unauthenticated visit with a tag redirects to login and preserves the search on return", async ({
    page,
  }) => {
    await page.goto("/account/players?tag=Somebody%234444");
    await expect(page).toHaveURL(/\/account\/login/);
  });

  test("a repeated ?tag= query param resolves to the first occurrence", async ({
    page,
  }) => {
    const searcherUsername = uniqueUsername("e2e_repeated_tag");
    await registerNewAccount(page, searcherUsername, "Repeated Tag Searcher");
    await logout(page);

    const targetUsername = uniqueUsername("e2e_repeated_target");
    await registerNewAccount(page, targetUsername, "Repeated Tag Target");
    await page.goto("/account/profile");
    const tagLocator = page.getByText(/^[A-Za-z0-9_]+#\d{4}$/);
    const targetTag = (await tagLocator.textContent())?.trim();
    expect(targetTag).toBeTruthy();
    await logout(page);

    await login(page, searcherUsername);
    await page.goto(
      `/account/players?tag=${encodeURIComponent(targetTag!)}&tag=Nobody%239999`,
    );

    await expect(page.getByText("Repeated Tag Target")).toBeVisible();
    await expect(page.getByText(targetTag!, { exact: true })).toBeVisible();
  });
});
