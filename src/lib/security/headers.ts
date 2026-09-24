/**
 * Security headers / CSP (issue #10). Plain functions with no "server-only" import - this needs
 * to be callable from middleware.ts (Edge runtime) as well as from Server Components, and must
 * stay clear of any Node-only API.
 *
 * script-src is nonce-based only for routes that are already dynamically rendered
 * (`/account/*` - force-dynamic, or otherwise reading a Dynamic API for session resolution).
 * Verified empirically (real `next start` + a headless browser collecting actual
 * securitypolicyviolation events) that Next's own per-request nonce-threading for its
 * framework-generated hydration <script> tags only works when the route is genuinely rendered
 * per-request - a *statically* rendered page has no per-request value to embed at all, so a
 * nonce can never be correct there regardless of what any Server Component does. Static public
 * routes (`/`, `/level5`, `/level5/characters`, `/level5/drblood`) therefore get `'unsafe-inline'`
 * on script-src instead (a narrower, documented exception - see CspOptions.allowInlineScript)
 * rather than being forced dynamic just to keep a nonce that can't work there anyway; forcing
 * them dynamic was tried first and found to also silently strip their Cache-Control down to the
 * same private/no-store treatment as account routes, which issue #10 explicitly calls out as the
 * wrong trade-off ("do not disable public caching globally merely to make account caching
 * safe" - caught by the production caching certification, e2e-production/caching.spec.ts).
 *
 * style-src is 'unsafe-inline' everywhere, not nonce-based at all: MUI's Paper-based components
 * (AppBar, Card, Dialog, ...) set elevation box-shadow via an inline `style="--Paper-shadow:..."`
 * *attribute*, which no nonce can ever cover (nonces only apply to <style>/<script> *elements*).
 * Keeping style-src nonce-free (rather than nonce-for-elements-plus-a-separate-style-src-attr-
 * exception) also means Emotion's SSR'd <style> tags need no nonce threading through
 * ThemeRegistry/AppRouterCacheProvider - which is itself part of why removing headers() from the
 * root layout does not break MUI styling. Inline-style CSS injection is a materially smaller
 * blast radius than inline-script XSS (it cannot execute arbitrary JS in a modern browser), which
 * is the standard justification for treating style-src 'unsafe-inline' as an acceptable trade-off
 * while keeping script-src as strict as each route can support.
 */

export interface CspOptions {
  /** Required only when the route actually uses it - static routes never receive one. */
  readonly nonce?: string;
  /** Static public routes only (see the module doc comment) - script-src becomes 'unsafe-inline'
   *  instead of nonce-based, since a nonce can never be correct on a statically rendered page. */
  readonly allowInlineScript?: boolean;
  /** Origin (scheme://host[:port], no path) of the legacy V1 public API - see ScoresTable's
   *  useHighscores(). Only /level5/* routes call the legacy API. */
  readonly legacyApiOrigin?: string;
  /** /level5/drblood only - react-youtube loads the IFrame API script and embeds a player iframe
   *  from youtube.com, and renders thumbnail images from img.youtube.com (see DrBlood.tsx). */
  readonly includeYouTube?: boolean;
}

/** Parses a "no trailing slash" base-URL env var down to a bare origin, or undefined if unset/blank. */
export function toOrigin(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }
  try {
    return new URL(value).origin;
  } catch {
    return undefined;
  }
}

export function buildContentSecurityPolicy(options: CspOptions): string {
  const connectSrc = [
    "'self'",
    ...(options.legacyApiOrigin ? [options.legacyApiOrigin] : []),
  ];
  const scriptSrc = [
    "'self'",
    options.allowInlineScript ? "'unsafe-inline'" : `'nonce-${options.nonce}'`,
    ...(options.includeYouTube ? ["https://www.youtube.com"] : []),
  ];
  const imgSrc = [
    "'self'",
    ...(options.includeYouTube ? ["https://img.youtube.com"] : []),
  ];
  const frameSrc = options.includeYouTube
    ? ["https://www.youtube.com"]
    : ["'none'"];

  const directives: readonly string[] = [
    `default-src 'self'`,
    `script-src ${scriptSrc.join(" ")}`,
    `style-src 'self' 'unsafe-inline'`,
    `img-src ${imgSrc.join(" ")}`,
    `font-src 'self'`,
    `connect-src ${connectSrc.join(" ")}`,
    `frame-src ${frameSrc.join(" ")}`,
    `frame-ancestors 'none'`,
    `object-src 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
  ];

  return directives.join("; ");
}

export interface SecurityHeader {
  readonly key: string;
  readonly value: string;
}

/** Path- and nonce-independent headers, applied to every route. */
export function buildBaseSecurityHeaders(): SecurityHeader[] {
  return [
    // No preload, no includeSubDomains - neither is verified safe for this deployment yet.
    { key: "Strict-Transport-Security", value: "max-age=31536000" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    {
      key: "Permissions-Policy",
      value: "camera=(), microphone=(), geolocation=()",
    },
  ];
}

const NONCE_BYTES = 16;

/** Edge-runtime-safe (Web Crypto, not node:crypto) random nonce, base64-encoded per the CSP spec. */
export function generateNonce(): string {
  const bytes = new Uint8Array(NONCE_BYTES);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCodePoint(...bytes));
}
