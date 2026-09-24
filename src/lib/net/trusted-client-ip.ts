import "server-only";
import { isIP } from "node:net";

/**
 * Provider-neutral trusted-ingress client IP resolution (issue #10). Reads ONLY the one
 * configured canonical edge header (LEVEL5_TRUSTED_CLIENT_IP_HEADER) - never Host,
 * X-Forwarded-Host, or raw/inbound X-Forwarded-For, and never falls back to any of those when
 * the configured header is absent or malformed. Backend V2 already trusts only its own
 * configured KnownProxies/KnownNetworks (see docs/architecture/web-authentication.md); this
 * resolver's only job is to hand it a value worth trusting in the first place.
 *
 * The deployment's edge/proxy is solely responsible for stripping any client-supplied copy of
 * this header and overwriting it with the real client address before the request reaches this
 * process - that contract can't be verified from inside this process, only assumed. See
 * docs/operations/frontend-production.md for exactly what the edge must guarantee.
 *
 * Never logs or stores the resolved address - callers must not either (see
 * docs/architecture/web-authentication.md's "never log secrets/PII" convention, which this
 * extends to client IPs).
 */
export function resolveTrustedClientIp(headers: Headers): string | undefined {
  const headerName = process.env.LEVEL5_TRUSTED_CLIENT_IP_HEADER;
  if (!headerName) {
    return undefined;
  }

  const raw = headers.get(headerName);
  if (!raw) {
    return undefined;
  }

  const value = raw.trim();
  // A single address only. A comma-separated list is the classic X-Forwarded-For shape a
  // misconfigured edge (appending instead of overwriting) would produce - rather than guess
  // which hop is the real client, this treats that shape as untrustworthy and returns nothing.
  if (value.length === 0 || value.includes(",") || /\s/.test(value)) {
    return undefined;
  }

  return isIP(value) !== 0 ? value : undefined;
}
