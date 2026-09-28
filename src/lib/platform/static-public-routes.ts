// The single source of truth for "which routes Next renders statically" (see next.config.ts's
// build output) - shared by two independent consumers that each need it for a different reason:
//
// - src/proxy.ts: a per-request CSP nonce can never be correct on a page whose HTML is fixed at
//   build time, so these get 'unsafe-inline' on script-src instead (see
//   src/lib/security/headers.ts's module doc comment for why, and for the caching regression
//   trying to force them dynamic caused).
// - src/app/sitemap.ts: the public marketing/game routes search engines should be told about.
//
// This list is hand-maintained and must stay in sync with which routes Next actually renders
// statically - it has already drifted twice (a caching regression, then a CSP/hydration break on
// /_not-found). src/proxy.static-routes.build.test.ts guards against silent drift going forward:
// it reads .next/prerender-manifest.json after a real `next build` and fails if this Set and
// Next's own static-route list ever disagree - keeping both consumers above honest, not just one.
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
  "/sitemap.xml",
]);
