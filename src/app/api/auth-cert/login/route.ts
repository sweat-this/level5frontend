import "server-only";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { buildSessionCookie } from "@/lib/web-auth/cookie-policy";
import { getCertificationCoordinator } from "@/lib/web-auth/certification-runtime";
import { getWebAuthConfig } from "@/lib/web-auth/config";
import { isAllowedOrigin } from "@/lib/web-auth/origin-policy";

const NO_STORE = { "cache-control": "private, no-store" };

interface LoginRequestBody {
  username?: string;
  password?: string;
}

const FAILURE_STATUS: Record<string, number> = {
  invalid_credentials: 401,
  rate_limited: 429,
  unavailable: 503,
};
const DEFAULT_FAILURE_STATUS = 502;

// Temporary, explicitly-gated certification surface for issue #3 - not a permanent
// public API contract. Proves browser -> HttpOnly cookie -> session coordinator ->
// real Backend V2, without shipping any account/login UI. See
// docs/architecture/web-authentication.md.
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

  const body = (await request
    .json()
    .catch(() => null)) as LoginRequestBody | null;
  if (!body?.username || !body?.password) {
    return NextResponse.json(
      { error: "validation_failed" },
      { status: 400, headers: NO_STORE },
    );
  }

  const coordinator = await getCertificationCoordinator();
  const result = await coordinator.login(body.username, body.password);
  if (result.kind !== "success") {
    const status = FAILURE_STATUS[result.kind] ?? DEFAULT_FAILURE_STATUS;
    return NextResponse.json(
      { error: result.kind },
      { status, headers: NO_STORE },
    );
  }

  const cookie = buildSessionCookie(result.sessionId, result.absoluteExpiresAt);
  const cookieStore = await cookies();
  cookieStore.set(cookie.name, cookie.value, {
    httpOnly: cookie.httpOnly,
    secure: cookie.secure,
    sameSite: cookie.sameSite,
    path: cookie.path,
    maxAge: cookie.maxAge,
  });

  return NextResponse.json({ ok: true }, { status: 200, headers: NO_STORE });
}
