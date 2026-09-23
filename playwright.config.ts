import { defineConfig, devices } from "@playwright/test";

// Small, real-Backend-V2 E2E suite for issue #6's account vertical slice - not part of the
// default `npm test`/CI-equivalent chain (see package.json's "test" script), the same way
// src/lib/web-auth/live-backend.certification.test.ts targets a real, separately-started local
// Backend V2 rather than the fakes the rest of the Vitest suite uses. Never point this at
// production - registration in these tests creates real accounts.
//
// Deliberately run via `next dev`, not a production build/start: cookie-policy.ts's production
// cookie policy requires Secure (__Host-*), which a plain-HTTP local run can never satisfy in a
// real browser, and session-store-config.ts requires LEVEL5_WEB_SESSION_STORE=redis whenever
// NODE_ENV=production - forcing a live Redis dependency this suite doesn't need by default (the
// issue's own wording is "preferably Redis-backed", not mandatory - set LEVEL5_E2E_SESSION_STORE
// below to opt in).
const APP_PORT = process.env.LEVEL5_E2E_APP_PORT ?? "3100";
const BASE_URL = `http://localhost:${APP_PORT}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  retries: 0,
  reporter: "line",
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `npm run dev -- --port ${APP_PORT}`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      LEVEL5_V2_API_BASE_URL:
        process.env.LEVEL5_E2E_BACKEND_BASE_URL ?? "http://localhost:5053",
      LEVEL5_APP_ORIGIN: BASE_URL,
      LEVEL5_WEB_SESSION_STORE:
        process.env.LEVEL5_E2E_SESSION_STORE ?? "memory",
      LEVEL5_WEB_SESSION_REDIS_URL:
        process.env.LEVEL5_WEB_SESSION_REDIS_URL ?? "",
      LEVEL5_WEB_SESSION_ACTIVE_KEY_ID:
        process.env.LEVEL5_WEB_SESSION_ACTIVE_KEY_ID ?? "",
      LEVEL5_WEB_SESSION_KEYRING_JSON:
        process.env.LEVEL5_WEB_SESSION_KEYRING_JSON ?? "",
    },
  },
});
