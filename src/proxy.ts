import { NextResponse, type NextRequest } from "next/server";
import {
  buildBaseSecurityHeaders,
  buildContentSecurityPolicy,
  generateNonce,
  toOrigin,
} from "@/lib/security/headers";
import { STATIC_PUBLIC_ROUTES } from "@/lib/platform/static-public-routes";

// Legacy V1 public API (ScoresTable/useHighscores) - issue #23 relocated the only caller from
// /level5 to /level5/leaderboards, so this is the only route that still needs connect-src access
// to it. Re-inspect this set if a future page starts calling the legacy V1 API.
const LEGACY_API_ROUTES = new Set(["/level5/leaderboards"]);

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
