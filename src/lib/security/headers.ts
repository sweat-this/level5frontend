/**
 * Security headers / CSP (issue #10). Plain functions with no "server-only" import - this needs
 * to be callable from middleware.ts (Edge runtime) as well as from Server Components, and must
 * stay clear of any Node-only API.
 *
 * CSP uses a per-request nonce (middleware.ts generates it and sets it as both the request's
 * `x-nonce` header - read by the root layout and threaded into MUI's AppRouterCacheProvider for
 * Emotion's injected <style> tags - and inside the CSP's own script-src/style-src). Next.js's App
 * Router renders inline bootstrap/hydration <script> tags on every page; verified empirically
 * (real `next start` + a headless browser) that a static `script-src 'self'` with no nonce blocks
 * those scripts and breaks hydration entirely. A nonce is the only approach that keeps script-src
 * meaningfully restrictive (no 'unsafe-inline') while working with the framework, matching Next's
 * own documented CSP pattern - see docs/operations/frontend-production.md for the trade-off this
 * requires (every route becomes dynamically rendered; see PR10's bundle/perf review for the
 * measured cost).
 */

export interface CspOptions {
  readonly nonce: string;
  /** Origin (scheme://host[:port], no path) of the legacy V1 public API - see MainNavBar's
   *  useServerHealth() and ScoresTable's use of it. Only /level5/* routes render that component. */
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
  const nonceSource = `'nonce-${options.nonce}'`;
  const connectSrc = [
    "'self'",
    ...(options.legacyApiOrigin ? [options.legacyApiOrigin] : []),
  ];
  const scriptSrc = [
    "'self'",
    nonceSource,
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
    // Emotion's injected <style> tags carry the same nonce via AppRouterCacheProvider's
    // `options.nonce` (ThemeRegistry.tsx) - no 'unsafe-inline' needed here either.
    `style-src 'self' ${nonceSource}`,
    // Separate from style-src: MUI's Paper-based components (AppBar, Card, Dialog, ...) set
    // elevation box-shadow via an inline `style="--Paper-shadow:...'"` attribute, not an Emotion
    // class - verified empirically (real `next start` + a headless browser + CSP violation
    // events) that this is the only actual inline-style-attribute usage on any route, and a
    // nonce can never cover the `style` HTML attribute (only <style>/<script> elements). Scoped
    // to style-src-attr only, so style-src itself (and therefore <style> element / CSSOM
    // insertion) stays nonce-only with no 'unsafe-inline'.
    `style-src-attr 'unsafe-inline'`,
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
