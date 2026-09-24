import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const validateProductionRuntimeConfigMock = vi.fn();

vi.mock("@/lib/config/runtime-config", () => ({
  validateProductionRuntimeConfig: () => validateProductionRuntimeConfigMock(),
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
