import type { Instrumentation } from "next";

/**
 * Next.js server startup + error hooks (issue #10). Runs once per server instance, before the
 * first request is served, gated to the Node runtime - the OTel Node SDK isn't Edge-compatible,
 * and production config validation only needs to happen once per process, not per Edge isolate.
 *
 * Config validation is production-only: dev/test keep the existing lazy, per-call-site
 * validation (getAccountRuntimeConfig / getWebSessionStoreConfig), so `next build` and local
 * development never require production secrets to be present. OpenTelemetry registration runs
 * in every environment (with export itself gated on whether an OTLP endpoint is configured) so
 * dev/test spans exist for local debugging even though nothing is exported.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") {
    return;
  }

  const { registerOpenTelemetry } = await import("@/lib/otel/register");
  registerOpenTelemetry();

  if (process.env.NODE_ENV === "production") {
    const { validateProductionRuntimeConfig } =
      await import("@/lib/config/runtime-config");
    validateProductionRuntimeConfig();
  }
}

/**
 * Next's unhandled-server-error hook (App Router). Logs only safe, low-cardinality fields - the
 * request/error objects themselves are never passed through: no request body, no headers, no
 * stack trace/raw exception message, no session/player/account identifiers. The active span's
 * trace id (if OTel is configured) is what a support reference in the UI pairs with - see
 * ErrorMessage.tsx.
 */
export const onRequestError: Instrumentation.onRequestError = async (
  error,
  request,
  context,
) => {
  if (process.env.NEXT_RUNTIME !== "nodejs") {
    return;
  }

  const { recordUnhandledRequestError } = await import("@/lib/otel/register");
  recordUnhandledRequestError(error, request, context);
};
