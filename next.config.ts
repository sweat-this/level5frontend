import type { NextConfig } from "next";

// Deliberately NOT output: 'export' — this app must stay server-capable for later BFF/account work.
// Security headers (CSP, HSTS, etc.) live in src/proxy.ts, not here - CSP needs a fresh
// per-request nonce (see headers.ts), which a statically-computed next.config.ts headers()
// entry can't provide.
const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Compatibility redirects for issue #26's route migration - the Level 5 challenges portal
  // moved from the generic account namespace to /account/games/level5/challenges. These exist
  // only for bookmarks/old links/browser history; no current application UI navigates through
  // them. Next passes through the incoming query string (e.g. ?view=active&cursor=...) and
  // matched path params (:seriesId) automatically, so neither is parsed or reconstructed here.
  // `permanent: false` (a 307) avoids caching this migration state indefinitely during rollout.
  async redirects() {
    return [
      {
        source: "/account/challenges",
        destination: "/account/games/level5/challenges",
        permanent: false,
      },
      {
        source: "/account/challenges/:seriesId",
        destination: "/account/games/level5/challenges/:seriesId",
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
