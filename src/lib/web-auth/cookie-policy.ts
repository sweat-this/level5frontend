import "server-only";

export const DEV_COOKIE_NAME = "level5_session";
// __Host- requires Secure, Path=/, and no Domain attribute - enforced below by never
// setting a domain and always pairing this name with secure: true.
export const PROD_COOKIE_NAME = "__Host-level5_session";

export interface SessionCookie {
  readonly name: string;
  readonly value: string;
  readonly httpOnly: true;
  readonly secure: boolean;
  readonly sameSite: "lax";
  readonly path: "/";
  readonly maxAge: number;
}

function isProductionCookiePolicy(nodeEnv: string | undefined): boolean {
  return nodeEnv === "production";
}

/** The cookie name the current environment reads/writes - dev/test vs production `__Host-`. */
export function sessionCookieName(
  nodeEnv: string | undefined = process.env.NODE_ENV,
): string {
  return isProductionCookiePolicy(nodeEnv) ? PROD_COOKIE_NAME : DEV_COOKIE_NAME;
}

/**
 * `absoluteExpiresAt` is the session's actual server-side deadline (WebSessionCoordinator's
 * fixed absolute lifetime - see web-session.ts), not an independent, hard-coded browser
 * lifetime: the cookie must never outlive the session it names. Max-Age is clamped at zero
 * rather than going negative for an already-expired deadline.
 */
export function buildSessionCookie(
  value: string,
  absoluteExpiresAt: number,
  nodeEnv: string | undefined = process.env.NODE_ENV,
  now: () => number = Date.now,
): SessionCookie {
  const production = isProductionCookiePolicy(nodeEnv);
  const maxAge = Math.max(0, Math.floor((absoluteExpiresAt - now()) / 1000));
  return {
    name: production ? PROD_COOKIE_NAME : DEV_COOKIE_NAME,
    value,
    httpOnly: true,
    secure: production,
    sameSite: "lax",
    path: "/",
    maxAge,
  };
}

export function buildExpiredSessionCookie(
  nodeEnv: string | undefined = process.env.NODE_ENV,
): SessionCookie {
  const production = isProductionCookiePolicy(nodeEnv);
  return {
    name: production ? PROD_COOKIE_NAME : DEV_COOKIE_NAME,
    value: "",
    httpOnly: true,
    secure: production,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  };
}
