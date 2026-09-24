import { metrics } from "@opentelemetry/api";
import {
  InMemoryMetricExporter,
  MeterProvider,
  PeriodicExportingMetricReader,
  AggregationTemporality,
} from "@opentelemetry/sdk-metrics";
import { afterEach, describe, expect, it } from "vitest";
import { getMeter } from "./telemetry";

describe("getMeter", () => {
  afterEach(() => {
    // metrics.disable() removes the global provider so later test files (and the no-op-meter
    // assertions elsewhere in this suite) aren't affected by what this file registers.
    metrics.disable();
  });

  it("resolves the currently-registered provider even when called before registration - unlike a cached module-scope meter, which would be stuck on the no-op meter forever", async () => {
    // Simulates the exact scenario the getMeter()-as-a-function design exists for: some caller
    // resolves a meter/counter before instrumentation.ts's register() has run.
    const counterCreatedBeforeRegistration = getMeter().createCounter(
      "level5.test_counter_before_registration",
    );

    const exporter = new InMemoryMetricExporter(
      AggregationTemporality.CUMULATIVE,
    );
    const reader = new PeriodicExportingMetricReader({
      exporter,
      exportIntervalMillis: 100000,
    });
    const provider = new MeterProvider({ readers: [reader] });
    metrics.setGlobalMeterProvider(provider);

    // The counter obtained *before* setGlobalMeterProvider ran is permanently bound to the no-op
    // meter (the metrics API has no ProxyMeter, unlike traces' ProxyTracer) - recording through it
    // now must be silently swallowed, not throw and not reach the exporter.
    expect(() => counterCreatedBeforeRegistration.add(1)).not.toThrow();

    // A counter obtained via getMeter() *after* registration must be the real one and its
    // recording must actually reach the exporter - this is the property the fix exists to
    // preserve for every call site that (correctly) calls getMeter() at the point of use rather
    // than caching its result at module-import time.
    const counterCreatedAfterRegistration = getMeter().createCounter(
      "level5.test_counter_after_registration",
    );
    counterCreatedAfterRegistration.add(1);

    await reader.forceFlush();
    const exported = exporter.getMetrics();
    const metricNames = exported.flatMap((batch) =>
      batch.scopeMetrics.flatMap((sm) =>
        sm.metrics.map((m) => m.descriptor.name),
      ),
    );
    expect(metricNames).toContain("level5.test_counter_after_registration");
    expect(metricNames).not.toContain(
      "level5.test_counter_before_registration",
    );

    await provider.shutdown();
  });
});
