import { metrics, trace } from "@opentelemetry/api";

/**
 * Shared tracer/meter handles (issue #10). Safe to import and use unconditionally, in any
 * environment: @opentelemetry/api returns no-op implementations until an SDK is registered
 * (instrumentation.ts's register() -> registerOpenTelemetry()), so no collector or explicit
 * "is OTel enabled" check is ever needed at a call site.
 *
 * `tracer` is a value, not a function, because @opentelemetry/api's trace API returns a
 * `ProxyTracer` that late-binds to whatever provider is registered later - calling
 * `trace.getTracer()` once at module-import time is safe even if that happens before
 * instrumentation.ts's register() completes.
 *
 * The metrics API has no equivalent proxy: `metrics.getMeter()` returns whatever the
 * currently-registered provider gives *right now*, with nothing to re-resolve it later. Caching
 * that return value at module-import time would permanently bind to the no-op meter if this
 * module (or anything that imports it) is ever evaluated before register() runs - so `getMeter()`
 * is a function, re-resolved on every call, and every call site must create its instruments (e.g.
 * `getMeter().createCounter(...)`) inside the function that uses them, not once at module scope.
 */
const INSTRUMENTATION_NAME = "level5frontend";

export const tracer = trace.getTracer(INSTRUMENTATION_NAME);
export const getMeter = () => metrics.getMeter(INSTRUMENTATION_NAME);
