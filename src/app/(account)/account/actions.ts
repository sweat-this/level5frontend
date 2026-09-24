"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { clearSessionCookie } from "@/lib/account/session-cookie";
import { resolveTrustedClientIp } from "@/lib/net/trusted-client-ip";
import { sessionCookieName } from "@/lib/web-auth/cookie-policy";
import { getAccountRuntimeConfig } from "@/lib/web-auth/config";
import { isAllowedOrigin } from "@/lib/web-auth/origin-policy";
import { getWebSessionCoordinator } from "@/lib/web-auth/session-coordinator-runtime";

/**
 * Logout is state-changing (issue #6) - always a POST Server Action, never a GET navigation -
 * and, like login/register, requires a same-origin request. Unlike login/register there is no
 * form-level error UI to report a rejected origin through, so a mismatched Origin simply aborts
 * without mutating anything (no backend call, no cookie change, no redirect): a forged
 * cross-site request achieves nothing rather than force-logging-out a real user's browser.
 */
export async function logoutAction(): Promise<void> {
  const config = getAccountRuntimeConfig();
  const headerList = await headers();
  if (!isAllowedOrigin(headerList.get("origin"), config.appOrigin)) {
    return;
  }

  const cookieStore = await cookies();
  const sessionId = cookieStore.get(sessionCookieName())?.value;

  if (sessionId) {
    try {
      const coordinator = await getWebSessionCoordinator();
      // WebSessionCoordinator.logout never throws by contract - Backend V2 revocation and store
      // deletion are each already best-effort and recorded internally. This try/catch is a
      // last-resort safety net only (mirrors /api/auth-cert/logout's route.ts), so local cookie
      // invalidation below happens unconditionally regardless of this outcome.
      const clientIp = resolveTrustedClientIp(headerList);
      await coordinator.logout(sessionId, clientIp ? { clientIp } : undefined);
    } catch {
      // Intentionally swallowed - see comment above.
    }
  }

  clearSessionCookie(cookieStore);

  redirect("/account/login");
}
