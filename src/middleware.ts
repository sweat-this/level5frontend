import { NextResponse, type NextRequest } from "next/server";
import {
  buildBaseSecurityHeaders,
  buildContentSecurityPolicy,
  generateNonce,
  toOrigin,
} from "@/lib/security/headers";

const LEGACY_API_ROUTES = new Set([
  "/level5",
  "/level5/characters",
  "/level5/drblood",
]);

// Statically rendered (see next.config.ts's build output) - a per-request nonce can never be
// correct on a page whose HTML is fixed at build time, so these get 'unsafe-inline' on
// script-src instead (see headers.ts's module doc comment for why, and for the caching
// regression trying to force them dynamic caused).
const STATIC_PUBLIC_ROUTES = new Set([
  "/",
  "/level5",
  "/level5/characters",
  "/level5/drblood",
]);

export function middleware(request: NextRequest): NextResponse {
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
