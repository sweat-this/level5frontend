import { trace } from "@opentelemetry/api";
import { registerOTel } from "@vercel/otel";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-http";
import { PeriodicExportingMetricReader } from "@opentelemetry/sdk-metrics";

const SERVICE_NAME = "level5frontend";

let registered = false;

/**
 * OpenTelemetry SDK setup (issue #10), called once from instrumentation.ts's register() hook.
 * Uses @vercel/otel - the Next-recommended integration - rather than a hand-rolled Node SDK
 * setup: it auto-instruments the global fetch() (so Backend V2 calls in transport.ts get traced
 * and, per-call, W3C-trace-context-propagated - see transport.ts's `opentelemetry` fetch option)
 * and auto-detects a configured OTLP trace endpoint with zero extra code.
 *
 * OTLP export is entirely optional and driven by the standard OTEL_EXPORTER_OTLP_* environment
 * variables - unset (the default), nothing is exported and no collector is required, which is
 * what keeps local dev/tests collector-free. Traces use @vercel/otel's own "auto" OTLP detection;
 * metrics need an explicit reader, only added when an OTLP endpoint is actually configured, so no
 * connection-refused retries happen against a collector nobody set up.
 */
export function registerOpenTelemetry(): void {
  if (registered) {
    return;
  }
  registered = true;

  const hasOtlpEndpoint = Boolean(
    process.env.OTEL_EXPORTER_OTLP_ENDPOINT ||
    process.env.OTEL_EXPORTER_OTLP_METRICS_ENDPOINT,
  );

  registerOTel({
    serviceName: SERVICE_NAME,
    metricReaders: hasOtlpEndpoint
      ? [
          new PeriodicExportingMetricReader({
            exporter: new OTLPMetricExporter(),
          }),
        ]
      : [],
  });
}

/**
 * Next's onRequestError hook (instrumentation.ts) - logs only safe, low-cardinality fields.
 * Never the request/error objects themselves: no body, no headers, no stack trace or raw
 * exception message, no session/player/account identifiers, and never `request.path` (the
 * concrete URL, which can carry a dynamic segment's real value) - only `context.routePath`, the
 * route *template* (e.g. "/account/challenges/[seriesId]"). The active span's trace id (present
 * whenever this fires during a traced request) is what a support reference in the UI pairs with.
 */
export function recordUnhandledRequestError(
  error: unknown,
  request: Readonly<{ method: string }>,
  context: Readonly<{
    routerKind: string;
    routeType: string;
    routePath: string;
  }>,
): void {
  const traceId = trace.getActiveSpan()?.spanContext().traceId;
  const digest =
    error instanceof Error &&
    "digest" in error &&
    typeof error.digest === "string"
      ? error.digest
      : undefined;

  console.error(
    JSON.stringify({
      event: "unhandled_request_error",
      traceId,
      digest,
      routerKind: context.routerKind,
      routeType: context.routeType,
      routePath: context.routePath,
      method: request.method,
      ts: new Date().toISOString(),
    }),
  );
}
