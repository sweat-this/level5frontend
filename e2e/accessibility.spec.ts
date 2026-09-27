import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page, type TestInfo } from "@playwright/test";
import {
  acceptDirect,
  loginDirect,
  seedChallenge,
  seedFriendship,
} from "./test-support/backend-seed";
import {
  login,
  logout,
  PASSWORD,
  registerNewAccount,
  uniqueUsername,
} from "./test-support/ui";

// Real-Backend-V2 automated accessibility certification (issue #10), on top of the existing
// jsx-a11y lint baseline (eslint.config.js) - that catches static/structural issues at author
// time; this catches runtime/rendered-DOM issues (contrast, landmark structure, ARIA usage,
// focus order artifacts) across the critical flows a lint rule can't see. See
// e2e/account.spec.ts's header comment for the shared prerequisites (live local Backend V2, etc).
//
// axe's automated scan only covers what's inspectable from a static render of the DOM - it
// cannot detect a broken Tab order, a missing/incorrect visible focus indicator, or a dialog that
// fails to trap or restore focus (WCAG 2.1.1/2.4.3/2.4.7 all require actually driving the
// interaction, not just inspecting markup). The "keyboard and focus management" describe block
// below exercises those directly, on top of the axe pass per flow.

/** Runs axe against the current page and attaches full violation detail to the test report on
 *  failure, rather than just a pass/fail count. */
async function assertNoAxeViolations(
  page: Page,
  testInfo: TestInfo,
): Promise<void> {
  const results = await new AxeBuilder({ page })
    // WCAG 2.0/2.1/2.2 A/AA only (issue #27 adds wcag22aa) - axe's default ruleset (no tag
    // filter) also runs its own "best-practice" rules (e.g. page-has-heading-one), which are
    // stricter/more opinionated than an actual WCAG success criterion and outside what this
    // certification is scoped to.
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();

  if (results.violations.length > 0) {
    await testInfo.attach("axe-violations", {
      body: JSON.stringify(results.violations, null, 2),
      contentType: "application/json",
    });
  }
  expect(
    results.violations,
    `axe found ${results.violations.length} violation(s) - see the axe-violations attachment for detail`,
  ).toEqual([]);
}

test.describe("accessibility - critical flows", () => {
  test("register", async ({ page }, testInfo) => {
    await page.goto("/account/register");
    await assertNoAxeViolations(page, testInfo);
  });

  test("login", async ({ page }, testInfo) => {
    await page.goto("/account/login");
    await assertNoAxeViolations(page, testInfo);
  });

  test("account dashboard", async ({ page }, testInfo) => {
    await registerNewAccount(
      page,
      uniqueUsername("e2ea_dash"),
      "A11y Dashboard",
    );
    await assertNoAxeViolations(page, testInfo);
  });

  test("profile", async ({ page }, testInfo) => {
    await registerNewAccount(page, uniqueUsername("e2ea_prof"), "A11y Profile");
    await page.goto("/account/profile");
    await assertNoAxeViolations(page, testInfo);
  });

  test("player lookup", async ({ page }, testInfo) => {
    await registerNewAccount(page, uniqueUsername("e2ea_look"), "A11y Lookup");
    await page.goto("/account/players");
    await assertNoAxeViolations(page, testInfo);
  });

  test("friends", async ({ page }, testInfo) => {
    await registerNewAccount(page, uniqueUsername("e2ea_frnd"), "A11y Friends");
    await page.goto("/account/friends");
    await assertNoAxeViolations(page, testInfo);
  });

  test("Level 5 game-data page", async ({ page }, testInfo) => {
    await registerNewAccount(
      page,
      uniqueUsername("e2ea_l5game"),
      "A11y Level 5 Game",
    );
    await page.goto("/account/games/level5");
    await assertNoAxeViolations(page, testInfo);
  });

  test("challenges list", async ({ page }, testInfo) => {
    await registerNewAccount(
      page,
      uniqueUsername("e2ea_chal"),
      "A11y Challenges",
    );
    await page.goto("/account/games/level5/challenges");
    await assertNoAxeViolations(page, testInfo);
  });

  test("challenge detail", async ({ page }, testInfo) => {
    const challengerUsername = uniqueUsername("e2ea_cd_a");
    await registerNewAccount(page, challengerUsername, "A11y Challenger");
    const challengerBackend = await loginDirect(challengerUsername, PASSWORD);
    await logout(page);

    const opponentUsername = uniqueUsername("e2ea_cd_b");
    await registerNewAccount(page, opponentUsername, "A11y Opponent");
    const opponentBackend = await loginDirect(opponentUsername, PASSWORD);

    const series = await seedChallenge(challengerBackend, opponentBackend);
    await acceptDirect(opponentBackend, series.id);

    await page.goto(`/account/games/level5/challenges/${series.id}`);
    await assertNoAxeViolations(page, testInfo);
  });
});

test.describe("accessibility - Sweat This homepage (issue #22)", () => {
  // No account/backend seeding needed - static, unauthenticated public page.
  test("/", async ({ page }, testInfo) => {
    await page.goto("/");
    await assertNoAxeViolations(page, testInfo);
  });
});

test.describe("accessibility - Level 5 public hub (issue #23)", () => {
  // No account/backend seeding needed - these are static, unauthenticated public pages.
  for (const path of [
    "/level5",
    "/level5/modes",
    "/level5/versus",
    // Part of the current public game hub (issue #27) - also exercises CharacterCard, whose
    // legacy CardActionArea wrapper previously exposed keyboard-focusable button semantics for
    // an activation that does nothing (see CharacterCard.tsx and its own regression test).
    "/level5/characters",
  ]) {
    test(`${path}`, async ({ page }, testInfo) => {
      await page.goto(path);
      await assertNoAxeViolations(page, testInfo);
    });
  }
});

test.describe("accessibility - Secret Robot public hub (issue #24)", () => {
  // No account/backend seeding needed - these are static, unauthenticated public pages. Also
  // covers the accentColor seam GameLocalNav uses for Secret Robot's identity (error.dark) -
  // axe's color-contrast rule fails here if that choice doesn't clear WCAG AA.
  for (const path of [
    "/secret-robot",
    "/secret-robot/world",
    "/secret-robot/characters",
  ]) {
    test(`${path}`, async ({ page }, testInfo) => {
      await page.goto(path);
      await assertNoAxeViolations(page, testInfo);
    });
  }
});

test.describe("keyboard and focus management", () => {
  test("the login form is fully operable by keyboard alone, in a sensible Tab order", async ({
    page,
  }) => {
    await page.goto("/account/login");

    // Starting focus is on <body> (nothing pre-focused). The first Tab reaches the skip link
    // (issue #27) - PlatformHeader's global nav otherwise sits between <body> and the page's own
    // content in Tab order on every page. Activating it jumps straight past the header to
    // <main>, whose next Tab reaches Username first, not somewhere in the middle of the form.
    await page.keyboard.press("Tab");
    const skipLink = page.getByRole("link", { name: "Skip to main content" });
    await expect(skipLink).toBeFocused();
    await page.keyboard.press("Enter");
    await page.keyboard.press("Tab");
    await expect(page.getByLabel("Username")).toBeFocused();

    await page.keyboard.type(uniqueUsername("e2ea_kbd"));
    await page.keyboard.press("Tab");
    await expect(page.getByLabel("Password")).toBeFocused();

    await page.keyboard.type("wrong-password-on-purpose");
    await page.keyboard.press("Tab");
    await expect(page.getByRole("button", { name: "Log in" })).toBeFocused();

    // Activating the focused submit button via the keyboard (not a mouse click) must actually
    // submit - proves the button is a real, keyboard-activatable control, not a mouse-only
    // click handler on a non-interactive element. The alert container is always present (see
    // LoginForm.tsx) but only ever has text once a real submission actually failed, so asserting
    // non-empty text (not just visibility) proves the keyboard submission was received. Scoped by
    // id, not role alone - Next.js's own route announcer also carries role="alert".
    await page.keyboard.press("Enter");
    await expect(page.locator("#login-form-status")).not.toBeEmpty();
  });

  test("the Remove Friend dialog traps focus while open and restores it to the trigger button on close", async ({
    page,
  }) => {
    const username = uniqueUsername("e2ea_kbd_a");
    await registerNewAccount(page, username, "Keyboard Dialog Test");
    const self = await loginDirect(username, PASSWORD);
    await logout(page);

    const friendUsername = uniqueUsername("e2ea_kbd_b");
    await registerNewAccount(page, friendUsername, "Keyboard Dialog Friend");
    const friend = await loginDirect(friendUsername, PASSWORD);
    await logout(page);

    // Established directly against Backend V2 (never through the browser) - the browser's own
    // session was only needed above to create the two accounts in the first place.
    await seedFriendship(self, friend);

    // Back in the browser as `self`, who should now see `friend` in their friends list.
    await login(page, username);
    await page.goto("/account/friends");

    const removeButton = page.getByRole("button", {
      name: /^Remove .+ from friends$/,
    });
    await expect(removeButton).toBeVisible();
    await removeButton.focus();
    await expect(removeButton).toBeFocused();
    await page.keyboard.press("Enter");

    const dialog = page.getByRole("dialog", { name: "Remove friend?" });
    await expect(dialog).toBeVisible();

    // Focus must have moved into the dialog, not stayed on the trigger button behind it. MUI's
    // Modal marks the rest of the page aria-hidden while open, which also removes the trigger
    // button from the accessibility tree - re-querying it by role here would simply fail to find
    // it, so this checks document.activeElement directly instead.
    const focusIsInsideDialog = await dialog.evaluate((dialogEl) =>
      dialogEl.contains(document.activeElement),
    );
    expect(focusIsInsideDialog).toBe(true);

    // Tabbing forward from the last focusable element in the dialog (Confirm) must cycle back
    // to the first (Cancel), never escape to the page behind it - the definition of a focus trap.
    const cancelButton = dialog.getByRole("button", { name: "Cancel" });
    const confirmButton = dialog.getByRole("button", { name: "Confirm" });
    await confirmButton.focus();
    await page.keyboard.press("Tab");
    await expect(cancelButton).toBeFocused();

    // Escape must close the dialog and restore focus to the trigger, not leave focus lost on
    // <body> or on some other element entirely.
    await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible();
    await expect(removeButton).toBeFocused();
  });
});

/**
 * Tabs forward from wherever focus currently sits until `target` is reached, or fails. Real
 * keyboard-driven focus, not a programmatic .focus() call - Chromium's :focus-visible heuristic
 * doesn't reliably fire for the latter (see e2e/responsive.spec.ts's Level 5 local-nav test, which
 * established this same pattern first).
 */
async function tabToElement(
  page: Page,
  target: ReturnType<Page["getByRole"]>,
  maxTabStops = 40,
): Promise<void> {
  for (let i = 0; i < maxTabStops; i += 1) {
    if (await target.evaluate((el) => el === document.activeElement)) {
      return;
    }
    await page.keyboard.press("Tab");
  }
  await expect(target).toBeFocused();
}

async function assertVisibleFocusOutline(
  target: ReturnType<Page["getByRole"]>,
): Promise<void> {
  const outlineStyle = await target.evaluate(
    (el) => getComputedStyle(el).outlineStyle,
  );
  expect(outlineStyle).not.toBe("none");
}

test.describe("focus visibility across representative controls (issue #27)", () => {
  // Game-local navigation already has its own dedicated real-Tab-walk certification
  // (e2e/responsive.spec.ts's "Level 5 local navigation is keyboard-reachable" test) - not
  // duplicated here.

  test("platform global navigation", async ({ page }) => {
    await page.goto("/");
    const link = page
      .getByRole("navigation", { name: "Primary" })
      .getByRole("link", { name: "Level 5" });
    await tabToElement(page, link);
    await expect(link).toBeFocused();
    await assertVisibleFocusOutline(link);
  });

  test("mobile menu trigger", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    const trigger = page.getByRole("button", { name: "Open navigation menu" });
    await tabToElement(page, trigger);
    await expect(trigger).toBeFocused();
    await assertVisibleFocusOutline(trigger);
  });

  test("account navigation", async ({ page }) => {
    await registerNewAccount(page, uniqueUsername("e2ea_fv_acct"), "Focus Nav");
    const link = page
      .getByRole("navigation", { name: "Account" })
      .getByRole("link", { name: "Profile" });
    await tabToElement(page, link);
    await expect(link).toBeFocused();
    await assertVisibleFocusOutline(link);
  });

  test("challenge category navigation", async ({ page }) => {
    await registerNewAccount(
      page,
      uniqueUsername("e2ea_fv_chal"),
      "Focus Challenges",
    );
    await page.goto("/account/games/level5/challenges");
    const link = page
      .getByRole("navigation", { name: "Challenge category" })
      .getByRole("link", { name: "Completed" });
    await tabToElement(page, link);
    await expect(link).toBeFocused();
    await assertVisibleFocusOutline(link);
  });
});

test.describe("pointer targets at mobile width (issue #27)", () => {
  // WCAG 2.2's target-size rule evaluates each control's actual rendered box - a scan at desktop
  // width would miss a control that only gets tightly packed/shrunk at narrow widths. Game-local
  // navigation already has dedicated desktop-viewport axe coverage (the Level 5 public hub
  // block above); account navigation and challenge category navigation don't, and both wrap at
  // mobile width (see account/layout.tsx and challenges/page.tsx's CategoryNav) - exactly the
  // layout change most likely to introduce a target-size/spacing regression.
  test.use({ viewport: { width: 390, height: 844 } });

  test("account navigation", async ({ page }, testInfo) => {
    await registerNewAccount(
      page,
      uniqueUsername("e2ea_pt_acct"),
      "Pointer Target Nav",
    );
    await assertNoAxeViolations(page, testInfo);
  });

  test("challenge category navigation", async ({ page }, testInfo) => {
    await registerNewAccount(
      page,
      uniqueUsername("e2ea_pt_chal"),
      "Pointer Target Challenges",
    );
    await page.goto("/account/games/level5/challenges");
    await assertNoAxeViolations(page, testInfo);
  });
});

test.describe("authentication form paste behavior (issue #27)", () => {
  // Proves actual browser paste (via the clipboard, like a real password manager would perform),
  // not just an absence-of-onPaste-handler check - the two aren't equivalent: a stray
  // preventDefault() anywhere in a parent handler, or an input mode/pattern that silently rejects
  // pasted characters, would pass the latter while still breaking real paste.
  test("a password can be pasted into the login form", async ({
    page,
    context,
  }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.goto("/account/login");

    const pastedPassword = "Pasted!Str0ngPassw0rd#456";
    await page.evaluate(
      (text) => navigator.clipboard.writeText(text),
      pastedPassword,
    );

    const passwordField = page.getByLabel("Password");
    await passwordField.click();
    const isMac = process.platform === "darwin";
    await page.keyboard.press(isMac ? "Meta+V" : "Control+V");

    await expect(passwordField).toHaveValue(pastedPassword);
  });
});
