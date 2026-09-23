import "server-only";
import { SESSION_ENCRYPTION_KEY_BYTES } from "./session-crypto";

export type WebSessionStoreConfig =
  | { readonly mode: "memory" }
  | {
      readonly mode: "redis";
      readonly redisUrl: string;
      readonly activeKeyId: string;
      readonly keys: ReadonlyMap<string, Buffer>;
    };

let cached: WebSessionStoreConfig | null = null;

function parseKeyring(json: string): ReadonlyMap<string, Buffer> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error("LEVEL5_WEB_SESSION_KEYRING_JSON is not valid JSON");
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error(
      "LEVEL5_WEB_SESSION_KEYRING_JSON must be a JSON object of keyId to base64 key",
    );
  }

  const keys = new Map<string, Buffer>();
  for (const [keyId, value] of Object.entries(
    parsed as Record<string, unknown>,
  )) {
    if (typeof value !== "string") {
      throw new Error(
        `LEVEL5_WEB_SESSION_KEYRING_JSON entry "${keyId}" is not a string`,
      );
    }
    let decoded: Buffer;
    try {
      decoded = Buffer.from(value, "base64");
    } catch {
      throw new Error(
        `LEVEL5_WEB_SESSION_KEYRING_JSON entry "${keyId}" is not valid base64`,
      );
    }
    if (decoded.length !== SESSION_ENCRYPTION_KEY_BYTES) {
      throw new Error(
        `LEVEL5_WEB_SESSION_KEYRING_JSON entry "${keyId}" does not decode to ${SESSION_ENCRYPTION_KEY_BYTES} bytes`,
      );
    }
    keys.set(keyId, decoded);
  }
  if (keys.size === 0) {
    throw new Error(
      "LEVEL5_WEB_SESSION_KEYRING_JSON must contain at least one key",
    );
  }
  return keys;
}

function parseRedisUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("LEVEL5_WEB_SESSION_REDIS_URL is not a valid URL");
  }
  if (url.protocol !== "redis:" && url.protocol !== "rediss:") {
    throw new Error(
      "LEVEL5_WEB_SESSION_REDIS_URL must use the redis:// or rediss:// scheme",
    );
  }
  return value;
}

/**
 * Central, once-validated, fail-closed read of the web-session store configuration (issue #5).
 * Mirrors getWebAuthConfig()'s lazy-cache-with-test-reset shape (config.ts) as an independent
 * sibling module - store/encryption configuration is a separate concern from the existing
 * backend-base-URL/origin/certification config it doesn't need to share a cache with.
 *
 * Fails closed - throws rather than silently defaulting - whenever:
 *   - NODE_ENV is "production" and the store isn't explicitly "redis" (memory must never back
 *     production, even by omission);
 *   - "redis" mode is selected but the URL, active key id, or keyring is missing/malformed, or
 *     any keyring key doesn't decode to exactly a 32-byte AES-256 key.
 * Error messages name which environment variable is wrong, never its value - see the "never log
 * secrets" requirement in docs/architecture/web-authentication.md.
 */
export function getWebSessionStoreConfig(): WebSessionStoreConfig {
  if (cached) {
    return cached;
  }

  const isProduction = process.env.NODE_ENV === "production";
  const rawMode = process.env.LEVEL5_WEB_SESSION_STORE;

  if (rawMode !== undefined && rawMode !== "memory" && rawMode !== "redis") {
    throw new Error(
      'LEVEL5_WEB_SESSION_STORE must be "memory" or "redis" when set',
    );
  }

  if (isProduction && rawMode !== "redis") {
    throw new Error(
      'LEVEL5_WEB_SESSION_STORE must be "redis" in production - a shared session store is mandatory and production never falls back to memory',
    );
  }

  const mode = rawMode ?? "memory";
  if (mode === "memory") {
    cached = { mode: "memory" };
    return cached;
  }

  const redisUrlEnv = process.env.LEVEL5_WEB_SESSION_REDIS_URL;
  if (!redisUrlEnv) {
    throw new Error(
      "LEVEL5_WEB_SESSION_REDIS_URL is required when LEVEL5_WEB_SESSION_STORE=redis",
    );
  }
  const redisUrl = parseRedisUrl(redisUrlEnv);

  const activeKeyId = process.env.LEVEL5_WEB_SESSION_ACTIVE_KEY_ID;
  if (!activeKeyId) {
    throw new Error(
      "LEVEL5_WEB_SESSION_ACTIVE_KEY_ID is required when LEVEL5_WEB_SESSION_STORE=redis",
    );
  }

  const keyringJson = process.env.LEVEL5_WEB_SESSION_KEYRING_JSON;
  if (!keyringJson) {
    throw new Error(
      "LEVEL5_WEB_SESSION_KEYRING_JSON is required when LEVEL5_WEB_SESSION_STORE=redis",
    );
  }
  const keys = parseKeyring(keyringJson);
  if (!keys.has(activeKeyId)) {
    throw new Error(
      "LEVEL5_WEB_SESSION_ACTIVE_KEY_ID is not present in LEVEL5_WEB_SESSION_KEYRING_JSON",
    );
  }

  cached = { mode: "redis", redisUrl, activeKeyId, keys };
  return cached;
}

/** Test-only: clears the cached config so a test can change process.env and re-read it. */
export function resetWebSessionStoreConfigForTests(): void {
  cached = null;
}
