import type { MetadataRoute } from "next";
import { STATIC_PUBLIC_ROUTES } from "@/lib/platform/static-public-routes";

// Derived from STATIC_PUBLIC_ROUTES (audit finding F-08), not a separately hand-maintained list -
// that Set is already drift-tested against Next's real build output
// (proxy.static-routes.build.test.ts), so a future public route added there is automatically
// picked up here too, and this file can't independently drift from reality the way it would if it
// duplicated the list. Excluded from it: /level5/leaderboards (statically rendered, but
// deliberately unadvertised - no link path anywhere in the UI yet, pending a hosted results
// pipeline) and /sitemap.xml itself. Also never included here: everything under /account/**
// (authenticated), /api/** (certification/internal routes, force-disabled in production), and
// /health/** (liveness/readiness probes) - none of those are in STATIC_PUBLIC_ROUTES to begin
// with, since they're not statically rendered.
const EXCLUDED_FROM_SITEMAP = new Set(["/level5/leaderboards", "/sitemap.xml"]);

export default function sitemap(): MetadataRoute.Sitemap {
  // Same fallback as layout.tsx's metadataBase - no real deployed domain exists yet (see
  // .env.production's own comments). Set NEXT_PUBLIC_SITE_URL before a real deployment's build,
  // or this sitemap ships localhost URLs.
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

  return [...STATIC_PUBLIC_ROUTES]
    .filter((route) => !EXCLUDED_FROM_SITEMAP.has(route))
    .map((route) => ({ url: `${baseUrl}${route}` }));
}
