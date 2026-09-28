import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const validateProductionRuntimeConfigMock = vi.fn();
const registerOpenTelemetryMock = vi.fn();

vi.mock("@/lib/config/runtime-config", () => ({
  validateProductionRuntimeConfig: () => validateProductionRuntimeConfigMock(),
}));

// register() unconditionally calls registerOpenTelemetry() before the production-only branch
// this suite actually exercises. Left unmocked, that ran the real @vercel/otel SDK registration
// in every test - which, per register.test.ts's own comments, has process-global side effects
// (a metrics provider/timer that module-cache resets don't undo) - intermittently blowing past
// this file's test timeout. This suite only needs to prove register() calls it; the real
// registration behavior is register.test.ts's job.
vi.mock("@/lib/otel/register", () => ({
  registerOpenTelemetry: () => registerOpenTelemetryMock(),
}));

const { register } = await import("./instrumentation");

beforeEach(() => {
  vi.unstubAllEnvs();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("instrumentation.register", () => {
  it("validates production runtime config in the Node runtime in production", async () => {
    vi.stubEnv("NEXT_RUNTIME", "nodejs");
    vi.stubEnv("NODE_ENV", "production");

    await register();

    expect(validateProductionRuntimeConfigMock).toHaveBeenCalledTimes(1);
  });

  it("does nothing outside production", async () => {
    vi.stubEnv("NEXT_RUNTIME", "nodejs");
    vi.stubEnv("NODE_ENV", "development");

    await register();

    expect(validateProductionRuntimeConfigMock).not.toHaveBeenCalled();
  });

  it("does nothing in the Edge runtime, even in production", async () => {
    vi.stubEnv("NEXT_RUNTIME", "edge");
    vi.stubEnv("NODE_ENV", "production");

    await register();

    expect(validateProductionRuntimeConfigMock).not.toHaveBeenCalled();
  });
});
