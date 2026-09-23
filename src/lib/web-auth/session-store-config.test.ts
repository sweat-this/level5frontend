import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getWebSessionStoreConfig,
  resetWebSessionStoreConfigForTests,
} from "./session-store-config";

function validKeyringJson(): string {
  return JSON.stringify({
    k1: Buffer.alloc(32, 1).toString("base64"),
  });
}

beforeEach(() => {
  vi.unstubAllEnvs();
  resetWebSessionStoreConfigForTests();
});

afterEach(() => {
  vi.unstubAllEnvs();
  resetWebSessionStoreConfigForTests();
});

describe("session-store-config", () => {
  it("defaults to memory outside production when unset", () => {
    vi.stubEnv("NODE_ENV", "test");
    expect(getWebSessionStoreConfig()).toEqual({ mode: "memory" });
  });

  it("fails closed when production doesn't explicitly select redis", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(() => getWebSessionStoreConfig()).toThrow(
      /LEVEL5_WEB_SESSION_STORE/,
    );
  });

  it("fails closed when production explicitly selects memory", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("LEVEL5_WEB_SESSION_STORE", "memory");
    expect(() => getWebSessionStoreConfig()).toThrow(
      /LEVEL5_WEB_SESSION_STORE/,
    );
  });

  it("rejects an unrecognized store mode", () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("LEVEL5_WEB_SESSION_STORE", "postgres");
    expect(() => getWebSessionStoreConfig()).toThrow(
      /LEVEL5_WEB_SESSION_STORE/,
    );
  });

  describe("redis mode", () => {
    beforeEach(() => {
      vi.stubEnv("NODE_ENV", "test");
      vi.stubEnv("LEVEL5_WEB_SESSION_STORE", "redis");
      vi.stubEnv("LEVEL5_WEB_SESSION_REDIS_URL", "redis://localhost:6379");
      vi.stubEnv("LEVEL5_WEB_SESSION_ACTIVE_KEY_ID", "k1");
      vi.stubEnv("LEVEL5_WEB_SESSION_KEYRING_JSON", validKeyringJson());
    });

    it("resolves a valid configuration", () => {
      const config = getWebSessionStoreConfig();
      expect(config.mode).toBe("redis");
      if (config.mode !== "redis") return;
      expect(config.redisUrl).toBe("redis://localhost:6379");
      expect(config.activeKeyId).toBe("k1");
      expect(config.keys.get("k1")).toEqual(Buffer.alloc(32, 1));
    });

    it("accepts rediss:// (TLS) URLs", () => {
      vi.stubEnv("LEVEL5_WEB_SESSION_REDIS_URL", "rediss://localhost:6380");
      expect(() => getWebSessionStoreConfig()).not.toThrow();
    });

    it("fails closed on a missing redis URL", () => {
      vi.stubEnv("LEVEL5_WEB_SESSION_REDIS_URL", "");
      expect(() => getWebSessionStoreConfig()).toThrow(
        /LEVEL5_WEB_SESSION_REDIS_URL/,
      );
    });

    it("fails closed on a malformed redis URL", () => {
      vi.stubEnv("LEVEL5_WEB_SESSION_REDIS_URL", "not-a-url");
      expect(() => getWebSessionStoreConfig()).toThrow(
        /LEVEL5_WEB_SESSION_REDIS_URL/,
      );
    });

    it("fails closed on a non-redis URL scheme", () => {
      vi.stubEnv("LEVEL5_WEB_SESSION_REDIS_URL", "http://localhost:6379");
      expect(() => getWebSessionStoreConfig()).toThrow(
        /LEVEL5_WEB_SESSION_REDIS_URL/,
      );
    });

    it("fails closed on missing keyring JSON", () => {
      vi.stubEnv("LEVEL5_WEB_SESSION_KEYRING_JSON", "");
      expect(() => getWebSessionStoreConfig()).toThrow(
        /LEVEL5_WEB_SESSION_KEYRING_JSON/,
      );
    });

    it("fails closed on malformed keyring JSON", () => {
      vi.stubEnv("LEVEL5_WEB_SESSION_KEYRING_JSON", "{not json");
      expect(() => getWebSessionStoreConfig()).toThrow(
        /LEVEL5_WEB_SESSION_KEYRING_JSON/,
      );
    });

    it("fails closed on a keyring value that isn't exactly 32 bytes", () => {
      vi.stubEnv(
        "LEVEL5_WEB_SESSION_KEYRING_JSON",
        JSON.stringify({ k1: Buffer.alloc(16, 1).toString("base64") }),
      );
      expect(() => getWebSessionStoreConfig()).toThrow(
        /LEVEL5_WEB_SESSION_KEYRING_JSON/,
      );
    });

    it("fails closed when the active key id is missing from the keyring", () => {
      vi.stubEnv("LEVEL5_WEB_SESSION_ACTIVE_KEY_ID", "not-in-keyring");
      expect(() => getWebSessionStoreConfig()).toThrow(
        /LEVEL5_WEB_SESSION_ACTIVE_KEY_ID/,
      );
    });

    it("fails closed on a missing active key id", () => {
      vi.stubEnv("LEVEL5_WEB_SESSION_ACTIVE_KEY_ID", "");
      expect(() => getWebSessionStoreConfig()).toThrow(
        /LEVEL5_WEB_SESSION_ACTIVE_KEY_ID/,
      );
    });

    it("supports multiple readable keys in the keyring", () => {
      vi.stubEnv(
        "LEVEL5_WEB_SESSION_KEYRING_JSON",
        JSON.stringify({
          k1: Buffer.alloc(32, 1).toString("base64"),
          k2: Buffer.alloc(32, 2).toString("base64"),
        }),
      );
      const config = getWebSessionStoreConfig();
      if (config.mode !== "redis") throw new Error("expected redis mode");
      expect(config.keys.size).toBe(2);
    });

    it("resolves redis mode in production too, once explicitly selected and fully configured", () => {
      vi.stubEnv("NODE_ENV", "production");
      expect(() => getWebSessionStoreConfig()).not.toThrow();
    });
  });

  it("caches the resolved config until reset", () => {
    vi.stubEnv("NODE_ENV", "test");
    const first = getWebSessionStoreConfig();
    vi.stubEnv("LEVEL5_WEB_SESSION_STORE", "redis"); // ignored - cached
    const second = getWebSessionStoreConfig();
    expect(second).toBe(first);

    resetWebSessionStoreConfigForTests();
    vi.stubEnv("LEVEL5_WEB_SESSION_REDIS_URL", "redis://localhost:6379");
    vi.stubEnv("LEVEL5_WEB_SESSION_ACTIVE_KEY_ID", "k1");
    vi.stubEnv("LEVEL5_WEB_SESSION_KEYRING_JSON", validKeyringJson());
    expect(getWebSessionStoreConfig().mode).toBe("redis");
  });
});
