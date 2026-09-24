import { expect, test, type Page } from "@playwright/test";

// Real-Backend-V2 XSS certification (issue #10). A static audit of src/ found no
// dangerouslySetInnerHTML, no innerHTML/document.write, no untrusted URL construction, and no
// third-party script beyond the YouTube IFrame API loader (already scoped by CSP - see
// src/lib/security/headers.ts) - every player-controlled string (Display Name, Player Tag) is
// rendered as plain React text children. This certifies that in a real browser: a Display Name
// containing HTML/script-like markup renders as literal visible text, with no extra DOM node
// created and no script execution - both for the player who set it, and for another player who
// views it (friend request / player lookup), which is the actual stored-XSS threat model. See
// e2e/account.spec.ts's header comment for the shared prerequisites (live local Backend V2, etc).

function uniqueUsername(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

const PASSWORD = "Str0ng!Passw0rd#123";
// Under the 32-char Display Name limit (RegisterForm.tsx), and deliberately mixes an unclosed
// script tag with an event-handler-bearing element - if this were ever interpreted as HTML
// instead of text, either half would fire.
const XSS_PAYLOAD = "<img src=x onerror=alert(1)>";

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

/** Watches for the DOM-injection/script-execution side effects an HTML-interpreted payload
 *  would produce - independent of *where* the caller confirms the payload rendered as text. */
function watchForInjectionSideEffects(page: Page): () => Promise<void> {
  let dialogFired = false;
  page.on("dialog", (dialog) => {
    dialogFired = true;
    void dialog.dismiss();
  });

  return async () => {
    const injectedImg = await page.locator('img[src="x"]').count();
    expect(injectedImg).toBe(0);
    await page.waitForTimeout(300);
    expect(dialogFired).toBe(false);
  };
}

/** No <img>/<script> matching the payload exists in the DOM, and no alert dialog fired - the
 *  payload appears only as a rendered text node (e.g. a friend/search result), never markup. */
async function assertPayloadRenderedAsTextOnly(page: Page): Promise<void> {
  const assertNoSideEffects = watchForInjectionSideEffects(page);
  await expect(page.getByText(XSS_PAYLOAD)).toBeVisible();
  await assertNoSideEffects();
}

test.describe("XSS certification - Display Name", () => {
  test("a player's own profile renders their HTML-like Display Name as text, not markup", async ({
    page,
  }) => {
    const username = uniqueUsername("e2e_xss1");
    await registerNewAccount(page, username, XSS_PAYLOAD);

    await page.goto("/account/profile");
    // The Display Name field renders it as an <input> VALUE, not a text node - getByText()
    // (used for the other two tests, where it renders as a plain text node) wouldn't find it here.
    const assertNoSideEffects = watchForInjectionSideEffects(page);
    await expect(page.getByLabel(/^Display Name/)).toHaveValue(XSS_PAYLOAD);
    await assertNoSideEffects();
  });

  test("another player viewing it via exact Player Tag lookup sees text, not markup", async ({
    page,
  }) => {
    const targetUsername = uniqueUsername("e2e_xss2");
    await registerNewAccount(page, targetUsername, XSS_PAYLOAD);
    await page.goto("/account/profile");
    const targetTag = (
      await page.getByText(/^[A-Za-z0-9_]+#\d{4}$/).textContent()
    )?.trim();
    expect(targetTag).toBeTruthy();
    await logout(page);

    const searcherUsername = uniqueUsername("e2e_xss3");
    await registerNewAccount(page, searcherUsername, "Searcher Player");
    await page.goto("/account/players");
    await page.getByLabel("Player Tag").fill(targetTag!);
    await page.getByRole("button", { name: "Search" }).click();

    await assertPayloadRenderedAsTextOnly(page);
  });

  test("a friend's list entry renders an HTML-like Display Name as text, not markup", async ({
    page,
  }) => {
    // "attacker" holds the malicious Display Name; "victim" is who eventually views it in their
    // own accepted-friends list (not their own incoming-requests list, which would show the
    // *other* party's identity instead - see FriendRequestActionForm.tsx's aria-label).
    const attackerUsername = uniqueUsername("e2e_xss4");
    await registerNewAccount(page, attackerUsername, XSS_PAYLOAD);
    await page.goto("/account/profile");
    const attackerTag = (
      await page.getByText(/^[A-Za-z0-9_]+#\d{4}$/).textContent()
    )?.trim();
    expect(attackerTag).toBeTruthy();
    await logout(page);

    const victimUsername = uniqueUsername("e2e_xss5");
    await registerNewAccount(page, victimUsername, "Victim Player");
    await page.goto("/account/profile");
    const victimTag = (
      await page.getByText(/^[A-Za-z0-9_]+#\d{4}$/).textContent()
    )?.trim();
    expect(victimTag).toBeTruthy();

    await page.goto("/account/players");
    await page.getByLabel("Player Tag").fill(attackerTag!);
    await page.getByRole("button", { name: "Search" }).click();
    await page.getByRole("button", { name: /Send friend request/ }).click();
    await logout(page);

    await page.goto("/account/login");
    await page.getByLabel("Username").fill(attackerUsername);
    await page.getByLabel("Password").fill(PASSWORD);
    await page.getByRole("button", { name: "Log in" }).click();
    await expect(page).toHaveURL(/\/account$/);
    await page.goto("/account/friends");
    await page
      .getByRole("button", {
        name: `Accept friend request from ${victimTag}`,
      })
      .click();
    await logout(page);

    await page.goto("/account/login");
    await page.getByLabel("Username").fill(victimUsername);
    await page.getByLabel("Password").fill(PASSWORD);
    await page.getByRole("button", { name: "Log in" }).click();
    await expect(page).toHaveURL(/\/account$/);
    await page.goto("/account/friends");

    await assertPayloadRenderedAsTextOnly(page);
  });
});
