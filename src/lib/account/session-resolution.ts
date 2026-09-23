import "server-only";
import { cookies } from "next/headers";
import type { CurrentAccountResponseDto } from "@/lib/web-auth/backend-auth-client";
import { sessionCookieName } from "@/lib/web-auth/cookie-policy";
import { tryGetWebSessionCoordinator } from "@/lib/web-auth/session-coordinator-runtime";

export type AccountSessionResult =
  | { kind: "authenticated"; account: CurrentAccountResponseDto }
  | { kind: "unauthenticated" }
  | { kind: "unavailable" }
  | { kind: "throttled" };

/**
 * The one place browser-session resolution for account pages/actions happens (issue #6) - reads
 * the opaque session cookie, calls WebSessionCoordinator.getMe, and maps its MeResult onto a
 * small account-application result. Callers (the protected /account page, any future
 * account-scoped action) depend only on this mapping, not on MeResult's kinds directly, so the
 * mapping lives in exactly one place rather than being repeated per call site.
 */
export async function resolveCurrentAccountSession(): Promise<AccountSessionResult> {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get(sessionCookieName())?.value;
  if (!sessionId) {
    return { kind: "unauthenticated" };
  }

  const coordinator = await tryGetWebSessionCoordinator();
  if (!coordinator) {
    return { kind: "unavailable" };
  }
  const result = await coordinator.getMe(sessionId);

  switch (result.kind) {
    case "success":
      return { kind: "authenticated", account: result.account };
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
