import "server-only";
import type { cookies } from "next/headers";
import {
  buildExpiredSessionCookie,
  buildSessionCookie,
} from "@/lib/web-auth/cookie-policy";

type CookieStore = Awaited<ReturnType<typeof cookies>>;

/**
 * Thin shared wrapper around cookie-policy.ts's SessionCookie builders - the three real mutation
 * call sites (login/register/logout actions) shouldn't each repeat the same cookieStore.set(...)
 * option-spreading the /api/auth-cert/* routes already duplicate.
 */
export function writeSessionCookie(
  cookieStore: CookieStore,
  sessionId: string,
  absoluteExpiresAt: number,
): void {
  const cookie = buildSessionCookie(sessionId, absoluteExpiresAt);
  cookieStore.set(cookie.name, cookie.value, {
    httpOnly: cookie.httpOnly,
    secure: cookie.secure,
    sameSite: cookie.sameSite,
    path: cookie.path,
    maxAge: cookie.maxAge,
  });
}

export function clearSessionCookie(cookieStore: CookieStore): void {
  const cookie = buildExpiredSessionCookie();
  cookieStore.set(cookie.name, cookie.value, {
    httpOnly: cookie.httpOnly,
    secure: cookie.secure,
    sameSite: cookie.sameSite,
    path: cookie.path,
    maxAge: cookie.maxAge,
  });
}
