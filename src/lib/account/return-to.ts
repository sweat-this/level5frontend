import "server-only";

export const DEFAULT_ACCOUNT_RETURN_TO = "/account";

const DISALLOWED_ACCOUNT_PATHS = new Set([
  "/account/login",
  "/account/register",
]);

// An origin no real request can ever share - used purely as a base so relative/protocol-relative/
// backslash-prefixed input resolves through the same WHATWG URL parser a browser uses, instead of
// a hand-rolled string check that a parser quirk (e.g. "\\evil.com" behaving like "//evil.com")
// could slip past.
const SENTINEL_BASE = "http://internal.invalid";

/**
 * Validates an untrusted post-login/post-registration destination (issue #6's "Safe Return
 * Destination"): must be an internal pathname beginning with /account, never the login/register
 * pages themselves, and never resolve to a different origin. Always returns a safe value - never
 * throws, never the raw input - so a caller can pass its result straight to redirect() without a
 * second check. Must be called again inside the server mutation itself, not only when rendering
 * the form - a caller can POST directly to the action with an arbitrary hidden field value.
 */
export function sanitizeAccountReturnTo(
  raw: string | null | undefined,
): string {
  if (!raw || !raw.startsWith("/account") || raw.startsWith("//")) {
    return DEFAULT_ACCOUNT_RETURN_TO;
  }

  let parsed: URL;
  try {
    parsed = new URL(raw, SENTINEL_BASE);
  } catch {
    return DEFAULT_ACCOUNT_RETURN_TO;
  }

  // Confirms `raw` never carried its own scheme/host (e.g. "https://evil.com", "javascript:...",
  // or a backslash-prefixed value a browser could treat like "//evil.com") - only a same-origin
  // relative reference resolves to SENTINEL_BASE's own origin.
  if (parsed.origin !== SENTINEL_BASE) {
    return DEFAULT_ACCOUNT_RETURN_TO;
  }
  if (!parsed.pathname.startsWith("/account")) {
    return DEFAULT_ACCOUNT_RETURN_TO;
  }
  if (DISALLOWED_ACCOUNT_PATHS.has(parsed.pathname)) {
    return DEFAULT_ACCOUNT_RETURN_TO;
  }

  // Pathname + safe local query string only - never the fragment, never anything else URL
  // parsed off of `raw`.
  return `${parsed.pathname}${parsed.search}`;
}
