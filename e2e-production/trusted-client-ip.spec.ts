import { expect, test } from "@playwright/test";
import { PASSWORD, registerNewAccount, uniqueUsername } from "../e2e/test-support/ui";

// Production-only certification of the trusted-client-IP contract's edge half (issue #10). The
// HTTPS proxy (e2e-production/support/https-proxy.mjs) plays the trusted edge: it strips any
// client-supplied copy of LEVEL5_TRUSTED_CLIENT_IP_HEADER and sets its own value
// (LEVEL5_E2E_PROD_TRUSTED_IP_VALUE) before forwarding to `next start`. The app-level
// certification that an *unconfigured* header is never trusted, and that a comma-separated
// (spoofed-looking) value is rejected rather than guessed at, already lives in
// src/lib/net/trusted-client-ip.certification.test.ts - this file's job is only to prove the
// real chain (edge -> app -> transport.ts -> Backend V2) actually completes over a real HTTPS
// connection with a real proxy in front of it. What this still can't prove: that a real
// deployment's edge is configured this way, or that direct-to-origin bypass of the edge is
// impossible - both stay deployment-dependent (see the final report).

const SPOOFED_IP = "198.51.100.7";
// Matches playwright.config.production.ts's own LEVEL5_E2E_PROD_TRUSTED_IP_VALUE default - the
// fixed value https-proxy.mjs is configured to overwrite the trusted header with.
const EXPECTED_EDGE_IP =
  process.env.LEVEL5_E2E_PROD_TRUSTED_IP_VALUE ?? "203.0.113.42";

test.describe("trusted client IP - edge contract", () => {
  test("a spoofed inbound copy of the trusted header is actually stripped and overwritten, not merely harmless", async ({
    request,
  }) => {
    // A direct request through the edge (not a browser navigation), spoofing the one header the
    // app trusts. https-proxy.mjs is supposed to delete any inbound copy before setting its own -
    // asserting only a 200 here can't tell a healthy strip-and-overwrite apart from a silent
    // pass-through of the spoofed value (page render doesn't depend on this header either way), so
    // this reads the proxy's own diagnostic response header (set from the exact value it forwarded
    // upstream - see https-proxy.mjs) to prove the spoofed value was actually replaced.
    const response = await request.get("/account/login", {
      headers: { "x-e2e-trusted-ip": SPOOFED_IP },
    });
    expect(response.status()).toBe(200);
    const forwarded = response.headers()["x-e2e-proxy-forwarded-trusted-ip"];
    expect(forwarded).toBe(EXPECTED_EDGE_IP);
    expect(forwarded).not.toBe(SPOOFED_IP);
  });

  test("an inbound request with no trusted-header attempt still gets the edge's own value forwarded", async ({
    request,
  }) => {
    const response = await request.get("/account/login");
    expect(response.status()).toBe(200);
    expect(response.headers()["x-e2e-proxy-forwarded-trusted-ip"]).toBe(
      EXPECTED_EDGE_IP,
    );
  });

  test("register, logout, and login all complete normally with the edge's trusted IP in place", async ({
    page,
  }) => {
    // Doesn't assert on Backend V2's internal rate-limit bucketing (out of scope for a frontend
    // certification) - proves the full chain (edge sets the header, resolveTrustedClientIp()
    // reads it, transport.ts forwards it as X-Forwarded-For to a real Backend V2) completes
    // without error for register, logout, and a subsequent login.
    const username = uniqueUsername("e2ep_ip");
    await registerNewAccount(page, username, "Prod IP Test");

    await page.getByRole("button", { name: "Log out" }).click();
    await expect(page).toHaveURL(/\/account\/login/);

    await page.getByLabel("Username").fill(username);
    await page.getByLabel("Password").fill(PASSWORD);
    await page.getByRole("button", { name: "Log in" }).click();
    await expect(page).toHaveURL(/\/account$/);
  });
});
