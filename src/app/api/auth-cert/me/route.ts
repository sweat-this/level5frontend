import "server-only";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getCertificationCoordinator } from "@/lib/web-auth/certification-runtime";
import { getWebAuthConfig } from "@/lib/web-auth/config";
import { sessionCookieName } from "@/lib/web-auth/cookie-policy";

const NO_STORE = { "cache-control": "private, no-store" };

// Temporary certification surface - see login/route.ts. Never returns Backend V2
// access/refresh tokens; only the safe account DTO Backend V2 itself already exposes.
export async function GET(): Promise<NextResponse> {
  const config = getWebAuthConfig();
  if (!config.certificationEnabled) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const cookieStore = await cookies();
  const sessionId = cookieStore.get(sessionCookieName())?.value;
  if (!sessionId) {
    return NextResponse.json(
      { error: "unauthenticated" },
      { status: 401, headers: NO_STORE },
    );
  }

  const coordinator = await getCertificationCoordinator();
  const result = await coordinator.getMe(sessionId);

  if (result.kind === "success") {
    return NextResponse.json(
      { account: result.account },
      { status: 200, headers: NO_STORE },
    );
  }
  if (result.kind === "throttled") {
    return NextResponse.json(
      { error: "throttled" },
      { status: 429, headers: NO_STORE },
    );
  }
  if (result.kind === "unavailable") {
    return NextResponse.json(
      { error: "unavailable" },
      { status: 503, headers: NO_STORE },
    );
  }
  // reauthentication_required or not_found: both mean "not currently authenticated".
  return NextResponse.json(
    { error: "unauthenticated" },
    { status: 401, headers: NO_STORE },
  );
}
