import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetWebSessionStoreConfigForTests } from "@/lib/web-auth/session-store-config";
import { resetSessionStoreRuntimeForTests } from "@/lib/web-auth/session-store-runtime";
import { GET } from "./route";

beforeEach(() => {
  vi.unstubAllEnvs();
  resetWebSessionStoreConfigForTests();
  resetSessionStoreRuntimeForTests();
});

afterEach(() => {
  vi.unstubAllEnvs();
  resetWebSessionStoreConfigForTests();
  resetSessionStoreRuntimeForTests();
});

describe("GET /health/ready", () => {
  it("returns 200 when memory mode is configured", async () => {
    vi.stubEnv("NODE_ENV", "test");
    const response = await GET();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ok" });
  });

  it("returns 503 without leaking error detail when the session-store configuration is invalid", async () => {
    vi.stubEnv("NODE_ENV", "production");
    // Production requires LEVEL5_WEB_SESSION_STORE=redis - left unset here to fail closed.
    const response = await GET();
    expect(response.status).toBe(503);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body).toEqual({ status: "unavailable" });
    expect(JSON.stringify(body)).not.toMatch(/LEVEL5_WEB_SESSION/);
  });

  it("returns 503 when redis is selected but unreachable", async () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("LEVEL5_WEB_SESSION_STORE", "redis");
    // Loopback with nothing listening - a fast, deterministic connection failure.
    vi.stubEnv("LEVEL5_WEB_SESSION_REDIS_URL", "redis://127.0.0.1:1");
    vi.stubEnv("LEVEL5_WEB_SESSION_ACTIVE_KEY_ID", "k1");
    vi.stubEnv(
      "LEVEL5_WEB_SESSION_KEYRING_JSON",
      JSON.stringify({ k1: Buffer.alloc(32, 1).toString("base64") }),
    );

    const response = await GET();
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ status: "unavailable" });
  }, 10_000);
});
