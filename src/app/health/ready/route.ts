import "server-only";
import { NextResponse } from "next/server";
import { getAccountRuntimeConfig } from "@/lib/web-auth/config";
import { checkWebSessionStoreHealth } from "@/lib/web-auth/session-store-runtime";

const NO_STORE = { "cache-control": "private, no-store" };

/**
 * Checks only what this frontend instance needs to serve authenticated *account* traffic: valid
 * account runtime configuration (LEVEL5_V2_API_BASE_URL/LEVEL5_APP_ORIGIN - see
 * getAccountRuntimeConfig()'s issue #6 remediation) and valid session-store configuration, with
 * real connectivity when Redis is selected. Backend V2 network reachability is deliberately not
 * part of this check (or of process liveness) - a transient Backend V2 outage must not restart
 * this frontend, see docs/architecture/web-authentication.md. Never leaks config/connection error
 * detail into the response body.
 */
export async function GET(): Promise<NextResponse> {
  const hasValidAccountConfig = isAccountConfigValid();
  const healthy = hasValidAccountConfig && (await checkWebSessionStoreHealth());
  return NextResponse.json(
    { status: healthy ? "ok" : "unavailable" },
    { status: healthy ? 200 : 503, headers: NO_STORE },
  );
}

function isAccountConfigValid(): boolean {
  try {
    getAccountRuntimeConfig();
    return true;
  } catch {
    return false;
  }
}
