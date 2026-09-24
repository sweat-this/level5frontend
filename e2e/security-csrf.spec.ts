import { expect, test, type Page, type Route } from "@playwright/test";

// Real-Backend-V2 HTTP/browser-level CSRF certification (issue #10), on top of the existing
// isAllowedOrigin() unit tests (origin-policy.test.ts).
//
// `Origin` is a forbidden/browser-computed header - verified empirically that Playwright's
// page.route()/route.continue({headers}) cannot override it for a real form-triggered request
// (Chromium recomputes it after interception; this is the same guarantee that makes Origin worth
// trusting as a CSRF signal in the first place). So "missing/wrong Origin" cases here capture the
// exact real request a genuine browser submission produces, block it from ever reaching the
// server, then replay that same request byte-for-byte via page.request (a raw HTTP client tied to
// the same session cookie, outside the page's fetch/CORS machinery) with only the Origin header
// changed. "Correct Origin" and "cross-site" cases need no such trick - a real same-origin
// submission, and a real different browsing context's request, each carry a genuine
// browser-computed Origin already. See e2e/account.spec.ts's header comment for the shared
// prerequisites (live local Backend V2, etc).

function uniqueUsername(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

const PASSWORD = "Str0ng!Passw0rd#123";
const EVIL_ORIGIN = "https://evil.example";

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

interface CapturedRequest {
  readonly url: string;
  readonly headers: Record<string, string>;
  readonly postData: string | null;
}

/**
 * Blocks the next POST to `path` before it reaches the server (fulfilling it locally instead) and
 * captures its exact url/headers/body, so the caller can replay the identical request via
 * page.request with only the Origin header changed. The blocked request never mutates anything -
 * this is standing in for "what would this real request have looked like", not letting a
 * correct-Origin copy through first.
 */
function captureAndBlockNextPost(
  page: Page,
  path: string,
): Promise<CapturedRequest> {
  return new Promise((resolve) => {
    const handler = async (route: Route): Promise<void> => {
      if (route.request().method() !== "POST") {
        await route.continue();
        return;
      }
      const headers = await route.request().allHeaders();
      const postData = route.request().postData();
      const url = route.request().url();
      await route.fulfill({ status: 204 });
      resolve({ url, headers, postData });
    };
    void page.route(path, handler);
  });
}

/** Replays a captured request via a raw HTTP client (not the page), with Origin overridden. */
async function replayWithOrigin(
  page: Page,
  captured: CapturedRequest,
  origin: string | null,
): Promise<void> {
  const headers = { ...captured.headers };
  delete headers.origin;
  delete headers["content-length"];
  if (origin !== null) {
    headers.origin = origin;
  }
  await page.request.post(captured.url, {
    headers,
    data: captured.postData ?? undefined,
  });
}

test.describe("CSRF certification - Display Name update", () => {
  test("correct Origin: the mutation succeeds", async ({ page }) => {
    const username = uniqueUsername("csrfok");
    await registerNewAccount(page, username, "Original Name");

    await page.goto("/account/profile");
    await page.getByLabel(/^Display Name/).fill("Updated Via Correct Origin");
    await page.getByRole("button", { name: "Save" }).click();

    await expect(page.getByText("Display name updated.")).toBeVisible();
  });

  test("missing Origin: the mutation is rejected", async ({ page }) => {
    const username = uniqueUsername("csrfmi");
    await registerNewAccount(page, username, "Original Name");

    await page.goto("/account/profile");
    const capturePromise = captureAndBlockNextPost(page, "**/account/profile");
    await page.getByLabel(/^Display Name/).fill("Should Not Persist");
    await page.getByRole("button", { name: "Save" }).click();
    const captured = await capturePromise;

    await replayWithOrigin(page, captured, null);

    await page.reload();
    await expect(page.getByLabel(/^Display Name/)).toHaveValue(
      "Original Name",
    );
  });

  test("wrong Origin: the mutation is rejected", async ({ page }) => {
    const username = uniqueUsername("csrfwr");
    await registerNewAccount(page, username, "Original Name");

    await page.goto("/account/profile");
    const capturePromise = captureAndBlockNextPost(page, "**/account/profile");
    await page.getByLabel(/^Display Name/).fill("Should Not Persist Either");
    await page.getByRole("button", { name: "Save" }).click();
    const captured = await capturePromise;

    await replayWithOrigin(page, captured, EVIL_ORIGIN);

    await page.reload();
    await expect(page.getByLabel(/^Display Name/)).toHaveValue(
      "Original Name",
    );
  });

  test("cross-site request: a real different origin's form submission is rejected", async ({
    page,
    context,
  }) => {
    const username = uniqueUsername("csrfxs");
    await registerNewAccount(page, username, "Original Name");
    const appUrl = new URL(page.url());

    // A genuinely different browsing context, standing in for an attacker's site - the browser
    // computes and sends this page's own real (different) origin, no interception needed.
    const attackerPage = await context.newPage();
    await Promise.all([
      attackerPage.waitForResponse((response) =>
        response.url().includes("/account/profile"),
      ),
      attackerPage.setContent(`
        <form id="f" method="POST" action="${appUrl.origin}/account/profile">
          <input type="hidden" name="displayName" value="Cross Site Attack" />
        </form>
        <script>document.getElementById('f').submit();</script>
      `),
    ]);
    await attackerPage.close();

    await page.goto("/account/profile");
    await expect(page.getByLabel(/^Display Name/)).toHaveValue(
      "Original Name",
    );
  });
});

test.describe("CSRF certification - other state-changing operations", () => {
  test("send friend request: missing Origin is rejected, no request created", async ({
    page,
  }) => {
    const searcherUsername = uniqueUsername("csrffs");
    await registerNewAccount(page, searcherUsername, "Searcher");
    await page.goto("/account");
    await page.getByRole("button", { name: "Log out" }).click();
    await expect(page).toHaveURL(/\/account\/login/);

    const targetUsername = uniqueUsername("csrfft");
    await registerNewAccount(page, targetUsername, "Target");
    await page.goto("/account/profile");
    const targetTag = (
      await page.getByText(/^[A-Za-z0-9_]+#\d{4}$/).textContent()
    )?.trim();
    expect(targetTag).toBeTruthy();
    await page.goto("/account");
    await page.getByRole("button", { name: "Log out" }).click();
    await expect(page).toHaveURL(/\/account\/login/);

    await page.goto("/account/login");
    await page.getByLabel("Username").fill(searcherUsername);
    await page.getByLabel("Password").fill(PASSWORD);
    await page.getByRole("button", { name: "Log in" }).click();
    await expect(page).toHaveURL(/\/account$/);

    await page.goto(`/account/players?tag=${encodeURIComponent(targetTag!)}`);
    const capturePromise = captureAndBlockNextPost(
      page,
      "**/account/players*",
    );
    await page.getByRole("button", { name: /Send friend request/ }).click();
    const captured = await capturePromise;

    await replayWithOrigin(page, captured, null);

    // Side-effect check, not a UI assertion - the blocked+replayed request never went through
    // useActionState, so no inline error renders. If the request had actually been accepted, the
    // target would now see an incoming request; it must not.
    await page.goto("/account");
    await page.getByRole("button", { name: "Log out" }).click();
    await expect(page).toHaveURL(/\/account\/login/);
    await page.getByLabel("Username").fill(targetUsername);
    await page.getByLabel("Password").fill(PASSWORD);
    await page.getByRole("button", { name: "Log in" }).click();
    await page.goto("/account/friends");
    await expect(page.getByText(searcherUsername)).not.toBeVisible();
  });

  test("logout: mismatched Origin silently no-ops - session stays active, no redirect", async ({
    page,
  }) => {
    const username = uniqueUsername("csrflo");
    await registerNewAccount(page, username, "Logout Origin Test");

    await page.goto("/account");
    const capturePromise = captureAndBlockNextPost(page, "**/account");
    await page.getByRole("button", { name: "Log out" }).click();
    const captured = await capturePromise;

    await replayWithOrigin(page, captured, EVIL_ORIGIN);

    // Documented behavior (actions.ts): a mismatched Origin on logout aborts before mutating
    // anything - no cookie change. The session must still be active afterwards.
    await page.reload();
    await expect(page).toHaveURL(/\/account$/);
    await expect(page.getByText(username)).toBeVisible();
  });
});
