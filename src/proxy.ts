import { NextResponse, type NextRequest } from "next/server";
import {
  buildBaseSecurityHeaders,
  buildContentSecurityPolicy,
  generateNonce,
  toOrigin,
} from "@/lib/security/headers";

// Legacy V1 public API (ScoresTable/useHighscores) - issue #23 relocated the only caller from
// /level5 to /level5/leaderboards, so this is the only route that still needs connect-src access
// to it. Re-inspect this set if a future page starts calling the legacy V1 API.
const LEGACY_API_ROUTES = new Set(["/level5/leaderboards"]);

// Statically rendered (see next.config.ts's build output) - a per-request nonce can never be
// correct on a page whose HTML is fixed at build time, so these get 'unsafe-inline' on
// script-src instead (see headers.ts's module doc comment for why, and for the caching
// regression trying to force them dynamic caused).
//
// This list is hand-maintained and must stay in sync with which routes Next actually renders
// statically - it has already drifted twice (a caching regression, then a CSP/hydration break on
// /_not-found). proxy.static-routes.build.test.ts guards against silent drift going
// forward: it reads .next/prerender-manifest.json after a real `next build` and fails if this
// Set and Next's own static-route list ever disagree.
export const STATIC_PUBLIC_ROUTES = new Set([
  "/",
  "/level5",
  "/level5/modes",
  "/level5/characters",
  "/level5/versus",
  "/level5/leaderboards",
  "/level5/drblood",
  "/secret-robot",
  "/secret-robot/world",
  "/secret-robot/characters",
]);

export function proxy(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;
  const allowInlineScript = STATIC_PUBLIC_ROUTES.has(pathname);

  const csp = buildContentSecurityPolicy({
    nonce: allowInlineScript ? undefined : generateNonce(),
    allowInlineScript,
    legacyApiOrigin: LEGACY_API_ROUTES.has(pathname)
      ? toOrigin(process.env.NEXT_PUBLIC_LEGACY_API_BASE_URL)
      : undefined,
    includeYouTube: pathname === "/level5/drblood",
  });

  const response = NextResponse.next();
  response.headers.set("Content-Security-Policy", csp);
  for (const header of buildBaseSecurityHeaders()) {
    response.headers.set(header.key, header.value);
  }
  return response;
}

export const config = {
  matcher: [
    // Every page and Server Action, skipping static assets and image optimization output -
    // those aren't rendered HTML and don't need a CSP header.
    "/((?!_next/static|_next/image|favicon.ico|images/).*)",
  ],
};
