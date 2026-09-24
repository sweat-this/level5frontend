import type { NextConfig } from "next";

// Deliberately NOT output: 'export' — this app must stay server-capable for later BFF/account work.
// Security headers (CSP, HSTS, etc.) live in src/middleware.ts, not here - CSP needs a fresh
// per-request nonce (see headers.ts), which a statically-computed next.config.ts headers()
// entry can't provide.
const nextConfig: NextConfig = {
  poweredByHeader: false,
};

export default nextConfig;
