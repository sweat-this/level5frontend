import "server-only";
import type { cookies } from "next/headers";
import { sessionCookieName } from "@/lib/web-auth/cookie-policy";
import type { WebSessionCoordinator } from "@/lib/web-auth/web-session-coordinator";
import { writeSessionCookie } from "./session-cookie";

type CookieStore = Awaited<ReturnType<typeof cookies>>;

/**
 * Issue #6's "Session Replacement": a successful login/registration always creates a fresh web
 * session (WebSessionCoordinator.login/register already never reuse an existing session id) and
 * that new session must become authoritative before any cleanup of an old one is attempted -
 * never the other way around. The old session's cookie is read *before* it's overwritten, and
 * cleanup of the old Backend V2/store session is best-effort only: WebSessionCoordinator.logout
 * already never throws and already records a diagnostic event on failure internally, so a failed
 * cleanup here is recorded but never allowed to invalidate the login/registration that already
 * succeeded.
 */
export async function establishWebSession(
  cookieStore: CookieStore,
  coordinator: WebSessionCoordinator,
  result: { readonly sessionId: string; readonly absoluteExpiresAt: number },
): Promise<void> {
  const previousSessionId = cookieStore.get(sessionCookieName())?.value;

  writeSessionCookie(cookieStore, result.sessionId, result.absoluteExpiresAt);

  if (previousSessionId && previousSessionId !== result.sessionId) {
    await coordinator.logout(previousSessionId);
  }
}
