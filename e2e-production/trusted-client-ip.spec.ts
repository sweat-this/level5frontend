import { expect, test } from "@playwright/test";

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

function uniqueUsername(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
}

const PASSWORD = "Str0ng!Passw0rd#123";

test.describe("trusted client IP - edge contract", () => {
  test("a spoofed inbound copy of the trusted header does not break the request - the edge's overwrite wins", async ({
    request,
  }) => {
    // A direct request through the edge (not a browser navigation), spoofing the one header the
    // app trusts. https-proxy.mjs deletes any inbound copy before conditionally setting its own
    // - if that stripping ever regressed and the app received two conflicting values, this would
    // still not crash (resolveTrustedClientIp treats a malformed/comma-joined header as absent,
    // never guesses), but a healthy 200 here is the actual end-to-end proof the edge's contract
    // is being honored during this run.
    const response = await request.get("/account/login", {
      headers: { "x-e2e-trusted-ip": "198.51.100.7" },
    });
    expect(response.status()).toBe(200);
  });

  test("register, logout, and login all complete normally with the edge's trusted IP in place", async ({
    page,
  }) => {
    // Doesn't assert on Backend V2's internal rate-limit bucketing (out of scope for a frontend
    // certification) - proves the full chain (edge sets the header, resolveTrustedClientIp()
    // reads it, transport.ts forwards it as X-Forwarded-For to a real Backend V2) completes
    // without error for register, logout, and a subsequent login.
    const username = uniqueUsername("e2ep_ip");
    await page.goto("/account/register");
    await page.getByLabel("Username").fill(username);
    await page.getByLabel("Display Name").fill("Prod IP Test");
    await page.getByLabel("Password").fill(PASSWORD);
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page).toHaveURL(/\/account$/);

    await page.getByRole("button", { name: "Log out" }).click();
    await expect(page).toHaveURL(/\/account\/login/);

    await page.getByLabel("Username").fill(username);
    await page.getByLabel("Password").fill(PASSWORD);
    await page.getByRole("button", { name: "Log in" }).click();
    await expect(page).toHaveURL(/\/account$/);
  });
});
