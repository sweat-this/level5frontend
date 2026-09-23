import "server-only";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getCertificationCoordinator } from "@/lib/web-auth/certification-runtime";
import { getWebAuthConfig } from "@/lib/web-auth/config";
import {
  buildExpiredSessionCookie,
  sessionCookieName,
} from "@/lib/web-auth/cookie-policy";
import { isAllowedOrigin } from "@/lib/web-auth/origin-policy";

const NO_STORE = { "cache-control": "private, no-store" };

// Temporary certification surface - see login/route.ts. Local session invalidation
// always runs, even if the best-effort Backend V2 logout call fails (see
// WebSessionCoordinator.logout).
export async function POST(request: Request): Promise<NextResponse> {
  const config = getWebAuthConfig();
  if (!config.certificationEnabled) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (!isAllowedOrigin(request.headers.get("origin"), config.appOrigin)) {
    return NextResponse.json(
      { error: "origin_rejected" },
      { status: 403, headers: NO_STORE },
    );
  }

  const cookieStore = await cookies();
  const sessionId = cookieStore.get(sessionCookieName())?.value;
  if (sessionId) {
    try {
      const coordinator = await getCertificationCoordinator();
      await coordinator.logout(sessionId);
    } catch {
      // Local cookie invalidation below must happen regardless of remote-cleanup failure - see
      // WebSessionCoordinator.logout and docs/architecture/web-authentication.md's logout-failure
      // semantics. WebSessionCoordinator.logout already swallows the expected
      // SessionStoreUnavailableError case itself; this is a last-resort safety net.
    }
  }

  const expired = buildExpiredSessionCookie();
  cookieStore.set(expired.name, expired.value, {
    httpOnly: expired.httpOnly,
    secure: expired.secure,
    sameSite: expired.sameSite,
    path: expired.path,
    maxAge: expired.maxAge,
  });

  return NextResponse.json({ ok: true }, { status: 200, headers: NO_STORE });
}
