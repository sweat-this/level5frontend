import type { Instrumentation } from "next";

/**
 * Next.js server startup + error hooks (issue #10). Runs once per server instance, before the
 * first request is served, gated to the Node runtime - the OTel Node SDK isn't Edge-compatible,
 * and this only needs to run once per process, not per Edge isolate.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") {
    return;
  }

  const { registerOpenTelemetry } = await import("@/lib/otel/register");
  registerOpenTelemetry();
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
