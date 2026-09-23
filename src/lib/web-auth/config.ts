import "server-only";

export interface WebAuthConfig {
  readonly backendBaseUrl: string;
  readonly appOrigin: string;
  readonly certificationEnabled: boolean;
}

let cached: WebAuthConfig | null = null;

/**
 * Central, once-validated read of the server-only web-auth env vars. Certification is
 * forced off in production regardless of LEVEL5_AUTH_CERTIFICATION_ENABLED, so the
 * MemoryWebSessionStore-backed certification routes can never silently become
 * production authentication (issue audit Problem 13).
 */
export function getWebAuthConfig(): WebAuthConfig {
  if (cached) {
    return cached;
  }

  const certificationEnabled =
    process.env.LEVEL5_AUTH_CERTIFICATION_ENABLED === "true" &&
    process.env.NODE_ENV !== "production";

  const backendBaseUrl = process.env.LEVEL5_V2_API_BASE_URL ?? "";
  const appOrigin = process.env.LEVEL5_APP_ORIGIN ?? "";

  if (certificationEnabled && !backendBaseUrl) {
    throw new Error(
      "LEVEL5_V2_API_BASE_URL is required when LEVEL5_AUTH_CERTIFICATION_ENABLED=true",
    );
  }
  if (certificationEnabled && !appOrigin) {
    throw new Error(
      "LEVEL5_APP_ORIGIN is required when LEVEL5_AUTH_CERTIFICATION_ENABLED=true",
    );
  }

  cached = { backendBaseUrl, appOrigin, certificationEnabled };
  return cached;
}

/** Test-only: clears the cached config so a test can change process.env and re-read it. */
export function resetWebAuthConfigForTests(): void {
  cached = null;
}

export interface AccountRuntimeConfig {
  readonly backendBaseUrl: string;
  readonly appOrigin: string;
}

let cachedAccountRuntime: AccountRuntimeConfig | null = null;

/**
 * Unconditional validation of the two env vars production account functionality (issue #6)
 * requires - unlike getWebAuthConfig() above, these are required regardless of
 * LEVEL5_AUTH_CERTIFICATION_ENABLED, since real register/login/session-resolution code depends
 * on them whether or not certification is enabled. A sibling cache, not a shared one: this fails
 * closed with a clearly-named error the moment either var is missing, rather than a confusing
 * downstream failure (transport.ts's generic "not configured", or an Origin check that silently
 * rejects every request because the configured origin is empty).
 */
export function getAccountRuntimeConfig(): AccountRuntimeConfig {
  if (cachedAccountRuntime) {
    return cachedAccountRuntime;
  }

  const backendBaseUrl = process.env.LEVEL5_V2_API_BASE_URL ?? "";
  if (!backendBaseUrl) {
    throw new Error(
      "LEVEL5_V2_API_BASE_URL is required for account functionality.",
    );
  }
  const appOrigin = process.env.LEVEL5_APP_ORIGIN ?? "";
  if (!appOrigin) {
    throw new Error("LEVEL5_APP_ORIGIN is required for account functionality.");
  }

  cachedAccountRuntime = { backendBaseUrl, appOrigin };
  return cachedAccountRuntime;
}

/** Test-only: clears the cached account runtime config so a test can change process.env and re-read it. */
export function resetAccountRuntimeConfigForTests(): void {
  cachedAccountRuntime = null;
}
