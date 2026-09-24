import "server-only";
import { cookies, headers } from "next/headers";
import { sessionCookieName } from "@/lib/web-auth/cookie-policy";
import { tryGetWebSessionCoordinator } from "@/lib/web-auth/session-coordinator-runtime";
import { resolveTrustedClientIp } from "@/lib/net/trusted-client-ip";

export type AuthenticatedBackendAccess =
  | { readonly kind: "ready"; readonly accessToken: string }
  | { readonly kind: "unauthenticated" }
  | { readonly kind: "unavailable" }
  | { readonly kind: "throttled" };

/**
 * The one place server-only code resolves a usable Backend V2 access token for the current
 * browser session (issues #7/#8/#9) - reads the opaque session cookie, gets/refreshes a token
 * through WebSessionCoordinator, and maps its AccessTokenResult onto this small result. Mirrors
 * resolveCurrentAccountSession()'s shape (session-resolution.ts) as an independent sibling: that
 * one resolves the account itself via /me, this one resolves a bearer token for any other
 * authenticated Backend V2 resource call (players, friends, series, ...). Callers depend only on
 * this mapping, not on AccessTokenResult's kinds directly, so it's never repeated per call site.
 *
 * Never returns the token to a Client Component, rendered HTML, browser storage, or a query
 * string - callers use it only for a server-side Backend V2 request's Authorization header.
 */
export async function resolveAuthenticatedBackendAccess(): Promise<AuthenticatedBackendAccess> {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get(sessionCookieName())?.value;
  if (!sessionId) {
    return { kind: "unauthenticated" };
  }

  const coordinator = await tryGetWebSessionCoordinator();
  if (!coordinator) {
    return { kind: "unavailable" };
  }
  const clientIp = resolveTrustedClientIp(await headers());
  const result = await coordinator.getAccessToken(
    sessionId,
    clientIp ? { clientIp } : undefined,
  );

  switch (result.kind) {
    case "ready":
      return { kind: "ready", accessToken: result.accessToken };
    case "not_found":
    case "reauthentication_required":
      return { kind: "unauthenticated" };
    case "unavailable":
      return { kind: "unavailable" };
    case "throttled":
      return { kind: "throttled" };
    default:
      return result satisfies never;
  }
}
