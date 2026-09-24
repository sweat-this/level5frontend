import { expect, test, type Page } from "@playwright/test";
import { login, logout, registerNewAccount, uniqueUsername } from "./test-support/ui";

// Real-Backend-V2 E2E for issue #8's friendship lifecycle (find player -> send request ->
// accept/decline/cancel -> friend list -> remove). See e2e/account.spec.ts's header comment for
// the shared prerequisites (live local Backend V2, disposable/local V2 database,
// playwright.config.ts's env var surface). Never run against production - registration here
// creates real accounts.

async function readOwnTag(page: Page): Promise<string> {
  await page.goto("/account/profile");
  const tagLocator = page.getByText(/^[A-Za-z0-9_]+#\d{4}$/);
  const tag = (await tagLocator.textContent())?.trim();
  expect(tag).toBeTruthy();
  return tag!;
}

async function sendFriendRequestTo(page: Page, targetTag: string): Promise<void> {
  await page.goto("/account/players");
  await page.getByLabel("Player Tag").fill(targetTag);
  await page.getByRole("button", { name: "Search" }).click();
  await page
    .getByRole("button", { name: new RegExp(`^Send friend request to .*\\(${targetTag}\\)$`) })
    .click();
  await expect(page).toHaveURL(/\/account\/friends\?notice=request-sent/);
  await expect(page.getByText("Friend request sent.")).toBeVisible();
}

test.describe("friends portal", () => {
  test("accept lifecycle: send, accept, both see the friendship, remove ends it for both", async ({
    page,
  }) => {
    const aUsername = uniqueUsername("e2e_friends_a");
    await registerNewAccount(page, aUsername, "Alice E2E");
    const aTag = await readOwnTag(page);
    await logout(page);

    const bUsername = uniqueUsername("e2e_friends_b");
    await registerNewAccount(page, bUsername, "Bob E2E");
    const bTag = await readOwnTag(page);
    await logout(page);

    await login(page, aUsername);
    await sendFriendRequestTo(page, bTag);
    await logout(page);

    await login(page, bUsername);
    await page.goto("/account/friends");
    await expect(page.getByText("Alice E2E")).toBeVisible();
    await expect(page.getByText(aTag, { exact: true })).toBeVisible();

    await page
      .getByRole("button", { name: `Accept friend request from ${aTag}` })
      .click();
    await expect(page).toHaveURL(/\/account\/friends\?notice=request-accepted/);
    await expect(page.getByText("Friend request accepted.")).toBeVisible();

    // Friend list now shows Alice, and there is no leftover incoming/outgoing request.
    await expect(page.getByText("No incoming friend requests.")).toBeVisible();
    await expect(page.getByText(/Friends since/)).toBeVisible();
    await logout(page);

    await login(page, aUsername);
    await page.goto("/account/friends");
    await expect(page.getByText("Bob E2E")).toBeVisible();
    await expect(page.getByText(bTag, { exact: true })).toBeVisible();
    await expect(page.getByText("No outgoing friend requests.")).toBeVisible();

    await page
      .getByRole("button", { name: `Remove Bob E2E (${bTag}) from friends` })
      .click();
    await page.getByRole("button", { name: "Confirm" }).click();
    await expect(page).toHaveURL(/\/account\/friends\?notice=friend-removed/);
    await expect(page.getByText("Friend removed.")).toBeVisible();
    await expect(page.getByText("Bob E2E")).toHaveCount(0);
    await logout(page);

    await login(page, bUsername);
    await page.goto("/account/friends");
    await expect(page.getByText("You don't have any friends yet.")).toBeVisible();
    await expect(page.getByText("Alice E2E")).toHaveCount(0);
  });

  test("decline lifecycle: incoming request disappears and no friendship is created", async ({
    page,
  }) => {
    const aUsername = uniqueUsername("e2e_decline_a");
    await registerNewAccount(page, aUsername, "Decliner Sender");
    const aTag = await readOwnTag(page);
    await logout(page);

    const bUsername = uniqueUsername("e2e_decline_b");
    await registerNewAccount(page, bUsername, "Decliner Recipient");
    const bTag = await readOwnTag(page);
    await logout(page);

    await login(page, aUsername);
    await sendFriendRequestTo(page, bTag);
    await logout(page);

    await login(page, bUsername);
    await page.goto("/account/friends");
    await page
      .getByRole("button", { name: `Decline friend request from ${aTag}` })
      .click();
    await expect(page).toHaveURL(/\/account\/friends\?notice=request-declined/);
    await expect(page.getByText("Friend request declined.")).toBeVisible();
    await expect(page.getByText("No incoming friend requests.")).toBeVisible();
    await expect(page.getByText("You don't have any friends yet.")).toBeVisible();
  });

  test("cancel lifecycle: outgoing request disappears and the recipient no longer sees it", async ({
    page,
  }) => {
    const aUsername = uniqueUsername("e2e_cancel_a");
    await registerNewAccount(page, aUsername, "Canceller Sender");
    await logout(page);

    const bUsername = uniqueUsername("e2e_cancel_b");
    await registerNewAccount(page, bUsername, "Canceller Recipient");
    const bTag = await readOwnTag(page);
    await logout(page);

    await login(page, aUsername);
    await sendFriendRequestTo(page, bTag);

    await page.goto("/account/friends");
    await page
      .getByRole("button", { name: `Cancel friend request to ${bTag}` })
      .click();
    await expect(page).toHaveURL(/\/account\/friends\?notice=request-cancelled/);
    await expect(page.getByText("Friend request cancelled.")).toBeVisible();
    await expect(page.getByText("No outgoing friend requests.")).toBeVisible();
    await logout(page);

    await login(page, bUsername);
    await page.goto("/account/friends");
    await expect(page.getByText("No incoming friend requests.")).toBeVisible();
  });

  test("an unauthenticated visit to /account/friends redirects to login", async ({ page }) => {
    await page.goto("/account/friends");
    await expect(page).toHaveURL(/\/account\/login\?returnTo=\/account\/friends/);
  });
});
