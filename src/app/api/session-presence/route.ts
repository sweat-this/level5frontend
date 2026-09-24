import "server-only";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { sessionCookieName } from "@/lib/web-auth/cookie-policy";

const NO_STORE = { "cache-control": "private, no-store" };

/**
 * Presentation-only signal for PlatformHeader's account entry (issue #21). Reads only whether the
 * opaque web-session cookie is present - never its value, never validated, never refreshed, and
 * never backed by Redis or Backend V2 (contrast resolveCurrentAccountSession, the actual
 * authentication authority for protected /account/* routes). A stale/expired cookie can make this
 * report signedIn: true; that only changes which label the header shows, never what a protected
 * route allows.
 */
export async function GET(): Promise<NextResponse> {
  const cookieStore = await cookies();
  const signedIn = cookieStore.get(sessionCookieName())?.value !== undefined;
  return NextResponse.json({ signedIn }, { status: 200, headers: NO_STORE });
}
