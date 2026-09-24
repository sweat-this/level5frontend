import { metrics, trace } from "@opentelemetry/api";

/**
 * Shared tracer/meter handles (issue #10). Safe to import and use unconditionally, in any
 * environment: @opentelemetry/api returns no-op implementations until an SDK is registered
 * (instrumentation.ts's register() -> registerOpenTelemetry()), so no collector or explicit
 * "is OTel enabled" check is ever needed at a call site.
 */
const INSTRUMENTATION_NAME = "level5frontend";

export const tracer = trace.getTracer(INSTRUMENTATION_NAME);
export const meter = metrics.getMeter(INSTRUMENTATION_NAME);
