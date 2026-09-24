import { defineConfig, devices } from "@playwright/test";

// Production-mode E2E certification (issue #10) - a real `next build` + `next start`, a real
// local Redis, a real local Backend V2, fronted by a test-only local HTTPS edge
// (e2e-production/support/https-proxy.mjs) so the app genuinely runs the way it would in
// production: HTTPS, the __Host-/Secure session cookie, real security headers/CSP, and the
// trusted-client-IP contract, none of which the dev-mode e2e/ suite (plain HTTP, `next dev`) can
// exercise for real - see that config's own header comment for why it's intentionally split this
// way rather than one suite trying to do both.
//
// Never point this at production - registration in these tests creates real accounts, same as
// the dev-mode suite.
//
// The HTTPS certificate is generated fresh in memory on every run and never written to disk or
// committed (see https-proxy.mjs) - ignoreHTTPSErrors below is scoped to this config only.
const APP_PORT = process.env.LEVEL5_E2E_PROD_APP_PORT ?? "3200";
const HTTPS_PORT = process.env.LEVEL5_E2E_PROD_HTTPS_PORT ?? "3443";
const BASE_URL = `https://localhost:${HTTPS_PORT}`;
const APP_URL = `http://localhost:${APP_PORT}`;

// Test-only fixed key material - never real secrets, regenerated to nothing persistent between
// runs (Redis data doesn't need to survive across runs). Override via env if a run needs to
// simulate a specific rotation scenario.
const DEFAULT_TEST_KEYRING = JSON.stringify({
  k1: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
});

export default defineConfig({
  testDir: "./e2e-production",
  fullyParallel: false,
  retries: 0,
  reporter: "line",
  use: {
    baseURL: BASE_URL,
    ignoreHTTPSErrors: true,
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: `npm run build && npm run start -- --port ${APP_PORT}`,
      url: APP_URL,
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
      env: {
        NODE_ENV: "production",
        LEVEL5_V2_API_BASE_URL:
          process.env.LEVEL5_E2E_BACKEND_BASE_URL ?? "http://localhost:5053",
        LEVEL5_APP_ORIGIN: BASE_URL,
        LEVEL5_WEB_SESSION_STORE: "redis",
        LEVEL5_WEB_SESSION_REDIS_URL:
          process.env.LEVEL5_E2E_PROD_REDIS_URL ?? "redis://localhost:6379",
        LEVEL5_WEB_SESSION_ACTIVE_KEY_ID:
          process.env.LEVEL5_E2E_PROD_ACTIVE_KEY_ID ?? "k1",
        LEVEL5_WEB_SESSION_KEYRING_JSON:
          process.env.LEVEL5_E2E_PROD_KEYRING_JSON ?? DEFAULT_TEST_KEYRING,
        // Trusted-client-IP certification (issue #10): the app trusts this header name; the
        // HTTPS proxy below is what actually plays the "edge" role of stripping/overwriting it.
        LEVEL5_TRUSTED_CLIENT_IP_HEADER:
          process.env.LEVEL5_E2E_PROD_TRUSTED_IP_HEADER ?? "x-e2e-trusted-ip",
        NEXT_PUBLIC_LEGACY_API_BASE_URL:
          process.env.LEVEL5_E2E_PROD_LEGACY_API_BASE_URL ?? "",
      },
    },
    {
      command: "node e2e-production/support/https-proxy.mjs",
      port: Number(HTTPS_PORT),
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
      env: {
        LEVEL5_E2E_PROD_HTTPS_PORT: HTTPS_PORT,
        LEVEL5_E2E_PROD_APP_PORT: APP_PORT,
        LEVEL5_E2E_PROD_TRUSTED_IP_HEADER:
          process.env.LEVEL5_E2E_PROD_TRUSTED_IP_HEADER ?? "x-e2e-trusted-ip",
        LEVEL5_E2E_PROD_TRUSTED_IP_VALUE:
          process.env.LEVEL5_E2E_PROD_TRUSTED_IP_VALUE ?? "203.0.113.42",
      },
    },
  ],
});
