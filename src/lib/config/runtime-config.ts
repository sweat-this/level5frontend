import "server-only";
import { getAccountRuntimeConfig } from "@/lib/web-auth/config";
import { getWebSessionStoreConfig } from "@/lib/web-auth/session-store-config";

/**
 * Format validation for LEVEL5_V2_API_BASE_URL (issue #10): presence is already enforced by
 * getAccountRuntimeConfig() (config.ts) - this adds the shape checks that matter for a value
 * that's about to be string-concatenated with a request path in transport.ts.
 */
export function assertValidBackendBaseUrl(value: string): void {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(
      "LEVEL5_V2_API_BASE_URL must be an absolute URL (e.g. https://backend.example.com).",
    );
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(
      "LEVEL5_V2_API_BASE_URL must use the http: or https: scheme.",
    );
  }
  if (url.username || url.password) {
    throw new Error(
      "LEVEL5_V2_API_BASE_URL must not embed a username or password.",
    );
  }
}

/**
 * Format validation for LEVEL5_APP_ORIGIN (issue #10): must be a bare origin - the Origin-based
 * CSRF check (origin-policy.ts) and the __Host- cookie policy both assume this is exactly an
 * origin, never a URL with a path/query/fragment that could silently never match a real
 * incoming Origin header.
 */
export function assertValidAppOrigin(value: string): void {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(
      "LEVEL5_APP_ORIGIN must be an absolute URL (e.g. https://app.example.com).",
    );
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("LEVEL5_APP_ORIGIN must use the http: or https: scheme.");
  }
  if (url.username || url.password) {
    throw new Error("LEVEL5_APP_ORIGIN must not embed a username or password.");
  }
  if (url.pathname !== "/" && url.pathname !== "") {
    throw new Error("LEVEL5_APP_ORIGIN must not include a path.");
  }
  if (url.search) {
    throw new Error("LEVEL5_APP_ORIGIN must not include a query string.");
  }
  if (url.hash) {
    throw new Error("LEVEL5_APP_ORIGIN must not include a fragment.");
  }
}

/**
 * The one production runtime-configuration boundary (issue #10): composes the existing
 * fail-closed validators (getAccountRuntimeConfig for backend URL / app origin presence,
 * getWebSessionStoreConfig for the Redis/keyring contract) with the format checks above. Meant
 * to be called once, from instrumentation.ts's register() hook, so a production deploy with
 * malformed configuration fails at process startup rather than on first request. Never called
 * during `next build` - reading env vars at build time is exactly what this issue asks to avoid.
 */
export function validateProductionRuntimeConfig(): void {
  const accountConfig = getAccountRuntimeConfig();
  assertValidBackendBaseUrl(accountConfig.backendBaseUrl);
  assertValidAppOrigin(accountConfig.appOrigin);
  getWebSessionStoreConfig();
}
