import "server-only";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getSessionSecretsForCertification } from "@/lib/web-auth/certification-runtime";
import { getWebAuthConfig } from "@/lib/web-auth/config";
import { sessionCookieName } from "@/lib/web-auth/cookie-policy";

const NO_STORE = { "cache-control": "private, no-store" };

// Temporary certification surface - see me/route.ts. Unlike every other /api/auth-cert/* route,
// this one deliberately DOES return real Backend V2 tokens: it exists only so
// e2e/security-no-credential-leak.spec.ts can assert the browser never sees the literal value of
// its own session's tokens, rather than guessing at what a leaked credential's shape might be.
// Gated off in production the same way as every other certification route (config.ts hard-forces
// certificationEnabled off whenever NODE_ENV=production, regardless of the opt-in env var).
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

  const secrets = await getSessionSecretsForCertification(sessionId);
  if (!secrets) {
    return NextResponse.json(
      { error: "unauthenticated" },
      { status: 401, headers: NO_STORE },
    );
  }

  return NextResponse.json(secrets, { status: 200, headers: NO_STORE });
}
