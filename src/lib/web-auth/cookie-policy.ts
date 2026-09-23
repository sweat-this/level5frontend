import "server-only";

export const DEV_COOKIE_NAME = "level5_session";
// __Host- requires Secure, Path=/, and no Domain attribute - enforced below by never
// setting a domain and always pairing this name with secure: true.
export const PROD_COOKIE_NAME = "__Host-level5_session";

// Long enough to outlive Backend V2's refresh-token lifetime so the browser doesn't
// drop the cookie itself before the server-side session does.
export const SESSION_COOKIE_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

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

export function buildSessionCookie(
  value: string,
  nodeEnv: string | undefined = process.env.NODE_ENV,
): SessionCookie {
  const production = isProductionCookiePolicy(nodeEnv);
  return {
    name: production ? PROD_COOKIE_NAME : DEV_COOKIE_NAME,
    value,
    httpOnly: true,
    secure: production,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_COOKIE_MAX_AGE_SECONDS,
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
