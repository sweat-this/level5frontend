import "server-only";

/**
 * CSRF defense for the certification mutation routes (login/logout): the request's
 * Origin must exactly match the configured public application origin. Missing,
 * malformed, or mismatched Origin headers are all rejected - see Problem 8/9 in the
 * issue audit and docs/architecture/web-authentication.md. Deliberately does not fall
 * back to Host/X-Forwarded-Host, which an untrusted proxy hop could influence.
 */
export function isAllowedOrigin(
  originHeader: string | null,
  configuredAppOrigin: string,
): boolean {
  if (!originHeader || !configuredAppOrigin) {
    return false;
  }

  try {
    const incoming = new URL(originHeader);
    const configured = new URL(configuredAppOrigin);
    return incoming.origin === configured.origin;
  } catch {
    return false;
  }
}
