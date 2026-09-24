import { metrics, trace } from "@opentelemetry/api";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { recordUnhandledRequestError, registerOpenTelemetry } from "./register";

describe("registerOpenTelemetry", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("does not throw with no OTLP endpoint configured (the local dev/test default)", () => {
    expect(() => registerOpenTelemetry()).not.toThrow();
  });

  it("is idempotent - a second call does not throw or re-register", () => {
    registerOpenTelemetry();
    expect(() => registerOpenTelemetry()).not.toThrow();
  });
});

describe("registerOpenTelemetry with an OTLP endpoint configured", () => {
  afterEach(async () => {
    // This block registers a real PeriodicExportingMetricReader (against an unreachable
    // localhost:4318) via the global @opentelemetry/api singleton, which vi.resetModules() does
    // NOT reset - it only clears the ES module cache, not OTel's process-global provider
    // registration. Without shutting it down, its export timer keeps firing for the rest of this
    // Vitest worker process, leaking connection-refused noise and an open handle across every
    // later test in the same worker.
    const meterProvider = metrics.getMeterProvider() as {
      shutdown?: () => Promise<void>;
    };
    await meterProvider.shutdown?.();
    metrics.disable();
    trace.disable();
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("does not throw when OTEL_EXPORTER_OTLP_ENDPOINT is set (no collector required to be reachable)", async () => {
    vi.resetModules();
    vi.stubEnv("OTEL_EXPORTER_OTLP_ENDPOINT", "http://localhost:4318");
    const mod = await import("./register");
    expect(() => mod.registerOpenTelemetry()).not.toThrow();
  });
});

describe("recordUnhandledRequestError", () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it("logs only safe, low-cardinality fields - never the error's message/stack", () => {
    const error = new Error("contains a secret token: sk-abc123");
    error.stack = "Error: contains a secret token\n    at somewhere.ts:42";

    recordUnhandledRequestError(
      error,
      { method: "POST" },
      {
        routerKind: "App Router",
        routeType: "action",
        routePath: "/account/profile",
      },
    );

    expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    const logged = JSON.parse(consoleErrorSpy.mock.calls[0][0] as string);
    expect(logged).toMatchObject({
      event: "unhandled_request_error",
      routerKind: "App Router",
      routeType: "action",
      routePath: "/account/profile",
      method: "POST",
    });
    const serialized = JSON.stringify(logged);
    expect(serialized).not.toContain("sk-abc123");
    expect(serialized).not.toContain("somewhere.ts");
  });

  it("includes the error's digest when present (Next's own opaque per-error id)", () => {
    const error = Object.assign(new Error("boom"), { digest: "abc123digest" });

    recordUnhandledRequestError(
      error,
      { method: "GET" },
      { routerKind: "App Router", routeType: "render", routePath: "/account" },
    );

    const logged = JSON.parse(consoleErrorSpy.mock.calls[0][0] as string);
    expect(logged.digest).toBe("abc123digest");
  });

  it("does not throw for a non-Error thrown value", () => {
    expect(() =>
      recordUnhandledRequestError(
        "a raw string throw",
        { method: "GET" },
        { routerKind: "App Router", routeType: "render", routePath: "/" },
      ),
    ).not.toThrow();
  });
});
