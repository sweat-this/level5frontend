import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetAccountRuntimeConfigForTests } from "@/lib/web-auth/config";
import { resetWebSessionStoreConfigForTests } from "@/lib/web-auth/session-store-config";
import {
  assertValidAppOrigin,
  assertValidBackendBaseUrl,
  validateProductionRuntimeConfig,
} from "./runtime-config";

beforeEach(() => {
  vi.unstubAllEnvs();
  resetAccountRuntimeConfigForTests();
  resetWebSessionStoreConfigForTests();
});

afterEach(() => {
  vi.unstubAllEnvs();
  resetAccountRuntimeConfigForTests();
  resetWebSessionStoreConfigForTests();
});

describe("assertValidBackendBaseUrl", () => {
  it("accepts a plain https origin", () => {
    expect(() =>
      assertValidBackendBaseUrl("https://backend.example.com"),
    ).not.toThrow();
  });

  it("accepts http (e.g. local dev)", () => {
    expect(() =>
      assertValidBackendBaseUrl("http://localhost:5000"),
    ).not.toThrow();
  });

  it("rejects a relative value", () => {
    expect(() => assertValidBackendBaseUrl("/api")).toThrow(/absolute URL/);
  });

  it("rejects a non-http(s) scheme", () => {
    expect(() =>
      assertValidBackendBaseUrl("ftp://backend.example.com"),
    ).toThrow(/http: or https:/);
  });

  it("rejects an embedded username/password", () => {
    expect(() =>
      assertValidBackendBaseUrl("https://user:pass@backend.example.com"),
    ).toThrow(/username or password/);
  });
});

describe("assertValidAppOrigin", () => {
  it("accepts a bare origin", () => {
    expect(() => assertValidAppOrigin("https://app.example.com")).not.toThrow();
  });

  it("accepts a bare origin with a trailing slash (root path)", () => {
    expect(() =>
      assertValidAppOrigin("https://app.example.com/"),
    ).not.toThrow();
  });

  it("rejects a relative value", () => {
    expect(() => assertValidAppOrigin("app.example.com")).toThrow(
      /absolute URL/,
    );
  });

  it("rejects a non-http(s) scheme", () => {
    expect(() => assertValidAppOrigin("ws://app.example.com")).toThrow(
      /http: or https:/,
    );
  });

  it("rejects a path", () => {
    expect(() =>
      assertValidAppOrigin("https://app.example.com/account"),
    ).toThrow(/must not include a path/);
  });

  it("rejects a query string", () => {
    expect(() => assertValidAppOrigin("https://app.example.com?x=1")).toThrow(
      /query string/,
    );
  });

  it("rejects a fragment", () => {
    expect(() => assertValidAppOrigin("https://app.example.com#x")).toThrow(
      /fragment/,
    );
  });

  it("rejects an embedded username/password", () => {
    expect(() =>
      assertValidAppOrigin("https://user:pass@app.example.com"),
    ).toThrow(/username or password/);
  });
});

function stubWellFormedRedisEnv(): void {
  vi.stubEnv("LEVEL5_WEB_SESSION_STORE", "redis");
  vi.stubEnv("LEVEL5_WEB_SESSION_REDIS_URL", "redis://localhost:6379");
  vi.stubEnv("LEVEL5_WEB_SESSION_ACTIVE_KEY_ID", "k1");
  vi.stubEnv(
    "LEVEL5_WEB_SESSION_KEYRING_JSON",
    JSON.stringify({ k1: Buffer.alloc(32, 1).toString("base64") }),
  );
}

describe("validateProductionRuntimeConfig", () => {
  it("throws when the backend base URL is malformed, even if presence checks pass", () => {
    vi.stubEnv("LEVEL5_V2_API_BASE_URL", "not-a-url");
    vi.stubEnv("LEVEL5_APP_ORIGIN", "https://app.example.com");
    stubWellFormedRedisEnv();

    expect(() => validateProductionRuntimeConfig()).toThrow(/absolute URL/);
  });

  it("throws when the app origin includes a path, even if the backend URL is valid", () => {
    vi.stubEnv("LEVEL5_V2_API_BASE_URL", "https://backend.example.com");
    vi.stubEnv("LEVEL5_APP_ORIGIN", "https://app.example.com/account");
    stubWellFormedRedisEnv();

    expect(() => validateProductionRuntimeConfig()).toThrow(
      /must not include a path/,
    );
  });

  it("throws when the session store config is invalid", () => {
    vi.stubEnv("LEVEL5_V2_API_BASE_URL", "https://backend.example.com");
    vi.stubEnv("LEVEL5_APP_ORIGIN", "https://app.example.com");
    vi.stubEnv("LEVEL5_WEB_SESSION_STORE", "redis");
    vi.stubEnv("LEVEL5_WEB_SESSION_REDIS_URL", "");

    expect(() => validateProductionRuntimeConfig()).toThrow(
      /LEVEL5_WEB_SESSION_REDIS_URL/,
    );
  });

  it("succeeds when everything is well-formed", () => {
    vi.stubEnv("LEVEL5_V2_API_BASE_URL", "https://backend.example.com");
    vi.stubEnv("LEVEL5_APP_ORIGIN", "https://app.example.com");
    stubWellFormedRedisEnv();

    expect(() => validateProductionRuntimeConfig()).not.toThrow();
  });
});
