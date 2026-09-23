import "server-only";
import { NextResponse } from "next/server";
import { checkWebSessionStoreHealth } from "@/lib/web-auth/session-store-runtime";

const NO_STORE = { "cache-control": "private, no-store" };

/**
 * Checks only what this frontend instance needs to serve authenticated traffic: valid
 * session-store configuration (fail-closed - see session-store-config.ts) and, when Redis is
 * selected, real connectivity to it. Backend V2 is deliberately not part of this check (or of
 * process liveness) - see docs/architecture/web-authentication.md. Never leaks config/connection
 * error detail into the response body.
 */
export async function GET(): Promise<NextResponse> {
  const healthy = await checkWebSessionStoreHealth();
  return NextResponse.json(
    { status: healthy ? "ok" : "unavailable" },
    { status: healthy ? 200 : 503, headers: NO_STORE },
  );
}
