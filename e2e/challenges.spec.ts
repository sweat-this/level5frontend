import { expect, test, type Page } from "@playwright/test";
import {
  acceptDirect,
  completeAttempt,
  loginDirect,
  seedChallenge,
  seedCompletedSeries,
  startAttempt,
  type SeededPlayer,
} from "./test-support/backend-seed";
import {
  login,
  logout,
  PASSWORD,
  registerNewAccount,
  uniqueUsername,
} from "./test-support/ui";

// Real-Backend-V2 E2E for issue #9's correspondence portal (incoming/outgoing/active/completed
// challenges, accept/decline/cancel, series detail). See e2e/account.spec.ts's header comment for
// the shared prerequisites (live local Backend V2, disposable/local V2 database,
// playwright.config.ts's env var surface). Never run against production - registration here
// creates real accounts.
//
// Challenge creation and gameplay are deliberately absent from the web portal (issue #9's
// non-goals), so every fixture here is seeded by calling Backend V2's own existing HTTP API
// directly via test-support/backend-seed.ts - never through frontend product code.

async function readOwnTag(page: Page): Promise<string> {
  await page.goto("/account/profile");
  const tagLocator = page.getByText(/^[A-Za-z0-9_]+#\d{4}$/);
  const tag = (await tagLocator.textContent())?.trim();
  expect(tag).toBeTruthy();
  return tag!;
}

interface Participant {
  readonly username: string;
  readonly displayName: string;
  readonly tag: string;
  readonly backend: SeededPlayer;
}

async function registerParticipant(
  page: Page,
  prefix: string,
  displayName: string,
): Promise<Participant> {
  const username = uniqueUsername(prefix);
  await registerNewAccount(page, username, displayName);
  const tag = await readOwnTag(page);
  const backend = await loginDirect(username, PASSWORD);
  await logout(page);
  return { username, displayName, tag, backend };
}

test.describe("challenges portal", () => {
  test("an unauthenticated visit to /account/challenges redirects to login", async ({
    page,
  }) => {
    await page.goto("/account/challenges");
    await expect(page).toHaveURL(/\/account\/login\?returnTo=\/account\/challenges/);
  });

  test("pending challenge lifecycle: accept, both participants see the active series and its detail", async ({
    page,
  }) => {
    const a = await registerParticipant(page, "e2e_chal_a", "Challenger E2E");
    const b = await registerParticipant(page, "e2e_chal_b", "Opponent E2E");

    const series = await seedChallenge(a.backend, b.backend, 3);

    await login(page, b.username);
    await page.goto("/account/challenges");
    await expect(page.getByText("Challenger E2E")).toBeVisible();
    await expect(page.getByText(a.tag, { exact: true })).toBeVisible();

    await page
      .getByRole("button", { name: `Accept challenge from ${a.tag}` })
      .click();
    await expect(page).toHaveURL(
      /\/account\/challenges\?view=active&notice=accepted/,
    );
    await expect(page.getByText("Challenge accepted.")).toBeVisible();

    await page.goto("/account/challenges?view=incoming");
    await expect(page.getByText("No incoming challenges.")).toBeVisible();
    await page.goto("/account/challenges?view=active");

    await page
      .getByRole("link", { name: new RegExp(`View details for active series`) })
      .click();
    await expect(page).toHaveURL(new RegExp(`/account/challenges/${series.id}`));
    await expect(page.getByRole("heading", { name: "Participants" })).toBeVisible();
    await expect(page.getByText("Challenger E2E")).toBeVisible();
    await expect(page.getByText("Opponent E2E")).toBeVisible();
    await logout(page);

    await login(page, a.username);
    await page.goto("/account/challenges?view=active");
    await expect(page.getByText("Opponent E2E")).toBeVisible();
    await page.goto("/account/challenges?view=outgoing");
    await expect(page.getByText("No outgoing challenges.")).toBeVisible();

    await page.goto(`/account/challenges/${series.id}`);
    await expect(page.getByRole("heading", { name: "Participants" })).toBeVisible();
  });

  test("decline lifecycle: incoming challenge disappears for both sides", async ({
    page,
  }) => {
    const a = await registerParticipant(page, "e2e_decl_a", "Decline Sender");
    const b = await registerParticipant(page, "e2e_decl_b", "Decline Recipient");

    await seedChallenge(a.backend, b.backend, 3);

    await login(page, b.username);
    await page.goto("/account/challenges");
    await page
      .getByRole("button", { name: `Decline challenge from ${a.tag}` })
      .click();
    await expect(page).toHaveURL(
      /\/account\/challenges\?view=incoming&notice=declined/,
    );
    await expect(page.getByText("Challenge declined.")).toBeVisible();
    await expect(page.getByText("No incoming challenges.")).toBeVisible();
    await logout(page);

    await login(page, a.username);
    await page.goto("/account/challenges?view=outgoing");
    await expect(page.getByText("No outgoing challenges.")).toBeVisible();
  });

  test("cancel lifecycle: outgoing challenge disappears and the recipient no longer sees it", async ({
    page,
  }) => {
    const a = await registerParticipant(page, "e2e_canc_a", "Cancel Sender");
    const b = await registerParticipant(page, "e2e_canc_b", "Cancel Recipient");

    await seedChallenge(a.backend, b.backend, 3);

    await login(page, a.username);
    await page.goto("/account/challenges?view=outgoing");
    await page
      .getByRole("button", { name: `Cancel challenge to ${b.tag}` })
      .click();
    await expect(page).toHaveURL(
      /\/account\/challenges\?view=outgoing&notice=cancelled/,
    );
    await expect(page.getByText("Challenge cancelled.")).toBeVisible();
    await expect(page.getByText("No outgoing challenges.")).toBeVisible();
    await logout(page);

    await login(page, b.username);
    await page.goto("/account/challenges");
    await expect(page.getByText("No incoming challenges.")).toBeVisible();
  });

  test("participant-safe series detail: an opponent result Backend V2 hasn't disclosed is never shown", async ({
    page,
  }) => {
    const a = await registerParticipant(page, "e2e_seal_a", "Sealed Challenger");
    const b = await registerParticipant(page, "e2e_seal_b", "Sealed Opponent");

    const series = await seedChallenge(a.backend, b.backend, 3);
    await acceptDirect(b.backend, series.id);

    // Only the challenger (a) completes their attempt for game 1 - the opponent's (b) half of the
    // round is still outstanding, so Backend V2's own sealed-result rule keeps a's result hidden
    // from b, and b has no result at all yet.
    const attempt = await startAttempt(a.backend, series.id, 1);
    await completeAttempt(a.backend, series.id, 1, attempt.attemptId, 10);

    await login(page, b.username);
    await page.goto(`/account/challenges/${series.id}`);
    await expect(page.getByRole("heading", { name: "Games" })).toBeVisible();
    await expect(page.getByText("Result not available")).toBeVisible();
    // b's own result was never submitted - the raw per-metric score must never appear anywhere.
    await expect(page.getByText("Score: 10")).toHaveCount(0);
  });

  test("completed-series certification: the completed list and detail show a human-readable winner", async ({
    page,
  }) => {
    const a = await registerParticipant(page, "e2e_comp_a", "Winner E2E");
    const b = await registerParticipant(page, "e2e_comp_b", "Loser E2E");

    const series = await seedChallenge(a.backend, b.backend, 1);
    await acceptDirect(b.backend, series.id);
    await seedCompletedSeries(series.id, a.backend, b.backend);

    await login(page, a.username);
    await page.goto("/account/challenges?view=completed");
    await expect(page.getByText("Loser E2E")).toBeVisible();

    await page.goto(`/account/challenges/${series.id}`);
    await expect(page.getByText("Completed", { exact: true })).toBeVisible();
    await expect(page.getByText(/Winner E2E \(.+\)/).first()).toBeVisible();
  });
});
