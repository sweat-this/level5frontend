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

export function middleware(request: NextRequest): NextResponse {
  const nonce = generateNonce();
  const { pathname } = request.nextUrl;

  const csp = buildContentSecurityPolicy({
    nonce,
    legacyApiOrigin: LEGACY_API_ROUTES.has(pathname)
      ? toOrigin(process.env.NEXT_PUBLIC_LEGACY_API_BASE_URL)
      : undefined,
    includeYouTube: pathname === "/level5/drblood",
  });

  // Forwarded as a request header so the root layout can read it via headers() and thread it
  // into AppRouterCacheProvider (Emotion's <style> tags) - see ThemeRegistry.tsx.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  for (const header of buildBaseSecurityHeaders()) {
    response.headers.set(header.key, header.value);
  }
  return response;
}

export const config = {
  matcher: [
    // Every page and Server Action, skipping static assets and image optimization output -
    // those aren't rendered HTML and don't need a nonce or a CSP header.
    "/((?!_next/static|_next/image|favicon.ico|images/).*)",
  ],
};
