import { expect, test } from "@playwright/test";
import { PASSWORD, registerNewAccount, uniqueUsername } from "../e2e/test-support/ui";

// Production-mode smoke certification of the major account flows (issue #10) - proves the real
// HTTPS/production-cookie/CSP stack doesn't break what the dev-mode e2e/ suite already certifies
// in depth at the business-logic level. Deliberately not a re-run of every dev-mode scenario:
// this suite's job is the production *infrastructure* layer (see the other e2e-production/
// specs), and one representative pass through each major flow is enough to catch an
// infrastructure-layer regression (e.g. a cookie/header change silently breaking a real flow)
// without duplicating logic-level coverage that already exists.

test.describe("production account flow", () => {
  test("register -> dashboard -> reload -> logout -> login again", async ({
    page,
  }) => {
    const username = uniqueUsername("e2ep_acct");
    await registerNewAccount(page, username, "Prod Flow Player");

    await expect(page.getByText(username)).toBeVisible();
    await page.reload();
    await expect(page).toHaveURL(/\/account$/);
    await expect(page.getByText(username)).toBeVisible();

    await page.getByRole("button", { name: "Log out" }).click();
    await expect(page).toHaveURL(/\/account\/login/);

    await page.goto("/account");
    await expect(page).toHaveURL(/\/account\/login/);

    await page.getByLabel("Username").fill(username);
    await page.getByLabel("Password").fill(PASSWORD);
    await page.getByRole("button", { name: "Log in" }).click();
    await expect(page).toHaveURL(/\/account$/);
  });

  test("profile: edit Display Name, server-confirmed value persists across reload", async ({
    page,
  }) => {
    const username = uniqueUsername("e2ep_prof");
    await registerNewAccount(page, username, "Original Prod Name");

    await page.goto("/account/profile");
    await page.getByLabel(/^Display Name/).fill("Updated Prod Name");
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("Display name updated.")).toBeVisible();
    await expect(page.getByLabel(/^Display Name/)).toHaveValue(
      "Updated Prod Name",
    );

    await page.reload();
    await expect(page.getByLabel(/^Display Name/)).toHaveValue(
      "Updated Prod Name",
    );
  });

  test("friends: A finds B by exact Player Tag, sends a request, B accepts, both see the friendship", async ({
    page,
  }) => {
    const usernameA = uniqueUsername("e2ep_fa");
    await registerNewAccount(page, usernameA, "Prod Friend A");
    await page.goto("/account/profile");
    const tagA = (
      await page.getByText(/^[A-Za-z0-9_]+#\d{4}$/).textContent()
    )?.trim();
    expect(tagA).toBeTruthy();
    await page.goto("/account");
    await page.getByRole("button", { name: "Log out" }).click();
    await expect(page).toHaveURL(/\/account\/login/);

    const usernameB = uniqueUsername("e2ep_fb");
    await registerNewAccount(page, usernameB, "Prod Friend B");
    await page.goto("/account/profile");
    const tagB = (
      await page.getByText(/^[A-Za-z0-9_]+#\d{4}$/).textContent()
    )?.trim();
    expect(tagB).toBeTruthy();

    await page.goto("/account/players");
    await page.getByLabel("Player Tag").fill(tagA!);
    await page.getByRole("button", { name: "Search" }).click();
    await page.getByRole("button", { name: /Send friend request/ }).click();
    await expect(page).toHaveURL(/\/account\/friends\?notice=request-sent/);
    await expect(page.getByText("Friend request sent.")).toBeVisible();

    await page.goto("/account");
    await page.getByRole("button", { name: "Log out" }).click();
    await expect(page).toHaveURL(/\/account\/login/);

    await page.getByLabel("Username").fill(usernameA);
    await page.getByLabel("Password").fill(PASSWORD);
    await page.getByRole("button", { name: "Log in" }).click();
    await expect(page).toHaveURL(/\/account$/);

    await page.goto("/account/friends");
    await page
      .getByRole("button", { name: `Accept friend request from ${tagB}` })
      .click();
    await expect(page.getByText("Prod Friend B")).toBeVisible();
  });
});
