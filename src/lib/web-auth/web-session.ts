import "server-only";

export type RefreshState = "Ready" | "Refreshing" | "ReauthenticationRequired";

/**
 * Server-side record for one browser session. Deliberately holds only what the refresh
 * coordinator needs - no account/profile data. Backend V2 remains the authority for
 * account data (see docs/architecture/web-authentication.md).
 *
 * `createdAt`/`absoluteExpiresAt` implement the fixed absolute web-session lifetime (issue #5):
 * set once at login (`absoluteExpiresAt` = Backend's initial `refreshTokenExpiresAt`) and never
 * extended, only ever shortened - see `applyAbsoluteExpiry` in web-session-coordinator.ts. This
 * is coordinator algorithm, not storage detail, so it lives on the runtime type the coordinator
 * operates on, not only in the persisted encoding (persisted-web-session.ts).
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
  readonly createdAt: number;
  readonly absoluteExpiresAt: number;
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

/**
 * The fixed absolute web-session lifetime has passed. Checked defensively wherever a session is
 * read from a networked store (Redis TTL should already have evicted it, but clock skew and the
 * gap between "Redis expired the key" and "we last read it" make a belt-and-suspenders check
 * worthwhile) - see RedisWebSessionStore.find and persisted-web-session.ts.
 */
export function isSessionExpired(session: WebSession, now: number): boolean {
  return session.absoluteExpiresAt <= now;
}

/**
 * The absolute web-session lifetime rule (issue #5): never extended, only ever shortened to the
 * earliest of the existing deadline and a freshly-rotated Backend V2 refresh token's own expiry.
 * `previousAbsoluteExpiresAt` is `undefined` at login, when there is nothing yet to take the
 * minimum against.
 */
export function nextAbsoluteExpiresAt(
  previousAbsoluteExpiresAt: number | undefined,
  refreshTokenExpiresAt: number,
): number {
  return previousAbsoluteExpiresAt === undefined
    ? refreshTokenExpiresAt
    : Math.min(previousAbsoluteExpiresAt, refreshTokenExpiresAt);
}
