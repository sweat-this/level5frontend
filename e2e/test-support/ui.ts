import { expect, type Page } from "@playwright/test";

/**
 * Shared browser-driven test helpers for the e2e/ and e2e-production/ suites (issue #10 review
 * follow-up): register/login/logout and username generation were previously copy-pasted across
 * 11+ spec files - a UI change to the register/login form (a renamed label or button) only needs
 * updating here now, instead of leaving some suites silently testing stale selectors.
 */

export const PASSWORD = "Str0ng!Passw0rd#123";

export function uniqueUsername(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export async function registerNewAccount(
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

/**
 * The "Log out" button only lives on the /account dashboard, not every account/* page -
 * navigating there first makes this helper safe to call from any page.
 */
export async function logout(page: Page): Promise<void> {
  await page.goto("/account");
  await page.getByRole("button", { name: "Log out" }).click();
  await expect(page).toHaveURL(/\/account\/login/);
}

export async function login(page: Page, username: string): Promise<void> {
  await page.goto("/account/login");
  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL(/\/account$/);
}
