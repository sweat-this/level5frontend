/**
 * Next.js server startup hook (issue #10). Runs once per server instance, before the first
 * request is served, in both the Node.js and Edge runtimes - gated to Node here because the
 * config this validates (session-crypto.ts's AES-256-GCM keyring) uses node:crypto, and because
 * validation only needs to happen once per process, not per edge isolate.
 *
 * Production only: dev/test keep the existing lazy, per-call-site validation
 * (getAccountRuntimeConfig / getWebSessionStoreConfig), so `next build` and local development
 * never require production secrets to be present.
 */
export async function register(): Promise<void> {
  if (
    process.env.NEXT_RUNTIME !== "nodejs" ||
    process.env.NODE_ENV !== "production"
  ) {
    return;
  }

  const { validateProductionRuntimeConfig } =
    await import("@/lib/config/runtime-config");
  validateProductionRuntimeConfig();
}
