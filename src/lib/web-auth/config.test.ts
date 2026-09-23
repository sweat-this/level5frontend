import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getWebAuthConfig, resetWebAuthConfigForTests } from "./config";

beforeEach(() => {
  vi.unstubAllEnvs();
  resetWebAuthConfigForTests();
});

afterEach(() => {
  vi.unstubAllEnvs();
  resetWebAuthConfigForTests();
});

describe("getWebAuthConfig", () => {
  it("is disabled by default", () => {
    vi.stubEnv("LEVEL5_AUTH_CERTIFICATION_ENABLED", "");
    vi.stubEnv("NODE_ENV", "test");

    expect(getWebAuthConfig().certificationEnabled).toBe(false);
  });

  it("enables certification when explicitly requested outside production", () => {
    vi.stubEnv("LEVEL5_AUTH_CERTIFICATION_ENABLED", "true");
    vi.stubEnv("LEVEL5_V2_API_BASE_URL", "http://localhost:5053");
    vi.stubEnv("LEVEL5_APP_ORIGIN", "http://localhost:3000");
    vi.stubEnv("NODE_ENV", "development");

    expect(getWebAuthConfig().certificationEnabled).toBe(true);
  });

  it("stays disabled in production even when the flag is set - never falls back to the memory store", () => {
    vi.stubEnv("LEVEL5_AUTH_CERTIFICATION_ENABLED", "true");
    vi.stubEnv("LEVEL5_V2_API_BASE_URL", "http://localhost:5053");
    vi.stubEnv("LEVEL5_APP_ORIGIN", "http://localhost:3000");
    vi.stubEnv("NODE_ENV", "production");

    expect(getWebAuthConfig().certificationEnabled).toBe(false);
  });

  it("throws loudly when certification is enabled but the backend base URL is missing", () => {
    vi.stubEnv("LEVEL5_AUTH_CERTIFICATION_ENABLED", "true");
    vi.stubEnv("LEVEL5_V2_API_BASE_URL", "");
    vi.stubEnv("LEVEL5_APP_ORIGIN", "http://localhost:3000");
    vi.stubEnv("NODE_ENV", "development");

    expect(() => getWebAuthConfig()).toThrow(/LEVEL5_V2_API_BASE_URL/);
  });

  it("throws loudly when certification is enabled but the app origin is missing", () => {
    vi.stubEnv("LEVEL5_AUTH_CERTIFICATION_ENABLED", "true");
    vi.stubEnv("LEVEL5_V2_API_BASE_URL", "http://localhost:5053");
    vi.stubEnv("LEVEL5_APP_ORIGIN", "");
    vi.stubEnv("NODE_ENV", "development");

    expect(() => getWebAuthConfig()).toThrow(/LEVEL5_APP_ORIGIN/);
  });
});
