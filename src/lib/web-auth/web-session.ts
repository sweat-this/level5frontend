import "server-only";

export type RefreshState = "Ready" | "Refreshing" | "ReauthenticationRequired";

/**
 * Server-side record for one browser session. Deliberately holds only what the refresh
 * coordinator needs - no account/profile data. Backend V2 remains the authority for
 * account data (see docs/architecture/web-authentication.md).
 */
export interface WebSession {
  readonly sessionIdHash: string;
  readonly accessToken: string;
  readonly accessTokenExpiresAt: number;
  readonly refreshToken: string;
  readonly refreshTokenExpiresAt: number;
  readonly revision: number;
  readonly refreshState: RefreshState;
  readonly refreshLeaseExpiresAt: number | null;
}

// Small fixed safety margin so a token judged "valid" here doesn't expire mid-flight
// before it reaches Backend V2.
const EXPIRY_SKEW_MS = 2000;

export function isAccessTokenExpired(
  session: WebSession,
  now: number,
): boolean {
  return session.accessTokenExpiresAt - EXPIRY_SKEW_MS <= now;
}

export function isRefreshLeaseExpired(
  session: WebSession,
  now: number,
): boolean {
  return (
    session.refreshLeaseExpiresAt !== null &&
    session.refreshLeaseExpiresAt <= now
  );
}
