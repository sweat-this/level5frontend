import "server-only";
import {
  decrypt,
  encrypt,
  type EncryptedEnvelope,
  type Keyring,
} from "./session-crypto";
import type { RefreshState, WebSession } from "./web-session";

export const CURRENT_SCHEMA_VERSION = 1;

/**
 * The Redis-persisted shape of a web session. Only accessToken/refreshToken are secret, so only
 * they live inside `encryptedCredentials` - everything else here is bookkeeping the atomic CAS
 * Lua script (redis-web-session-store.ts) must be able to read without decrypting anything.
 */
export interface PersistedWebSessionV1 {
  readonly schemaVersion: 1;
  readonly revision: number;
  readonly createdAt: number;
  readonly absoluteExpiresAt: number;
  readonly accessTokenExpiresAt: number;
  readonly refreshTokenExpiresAt: number;
  readonly refreshState: RefreshState;
  readonly refreshLeaseExpiresAt: number | null;
  readonly encryptedCredentials: EncryptedEnvelope;
}

interface CredentialPlaintext {
  readonly accessToken: string;
  readonly refreshToken: string;
}

export type DecodeResult =
  | { readonly kind: "ok"; readonly session: WebSession }
  | { readonly kind: "corrupt"; readonly reason: string };

const REFRESH_STATES: ReadonlySet<RefreshState> = new Set([
  "Ready",
  "Refreshing",
  "ReauthenticationRequired",
]);

function additionalData(schemaVersion: number, sessionIdHash: string): Buffer {
  // Binds the ciphertext to this exact session and schema version, so a decrypted envelope
  // can never be replayed under a different session's key or after a schema bump silently
  // changed what the bytes mean.
  return Buffer.from(`${schemaVersion}:${sessionIdHash}`, "utf8");
}

/** Always encrypts under the keyring's active key - see session-crypto.ts's rotation model. */
export function encode(
  session: WebSession,
  sessionIdHash: string,
  keyring: Keyring,
): string {
  const plaintext: CredentialPlaintext = {
    accessToken: session.accessToken,
    refreshToken: session.refreshToken,
  };
  const encryptedCredentials = encrypt(
    JSON.stringify(plaintext),
    keyring,
    additionalData(CURRENT_SCHEMA_VERSION, sessionIdHash),
  );

  const record: PersistedWebSessionV1 = {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    revision: session.revision,
    createdAt: session.createdAt,
    absoluteExpiresAt: session.absoluteExpiresAt,
    accessTokenExpiresAt: session.accessTokenExpiresAt,
    refreshTokenExpiresAt: session.refreshTokenExpiresAt,
    refreshState: session.refreshState,
    refreshLeaseExpiresAt: session.refreshLeaseExpiresAt,
    encryptedCredentials,
  };
  return JSON.stringify(record);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isValidEnvelope(value: unknown): value is EncryptedEnvelope {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const envelope = value as Record<string, unknown>;
  return (
    typeof envelope.keyId === "string" &&
    typeof envelope.iv === "string" &&
    typeof envelope.ciphertext === "string" &&
    typeof envelope.authTag === "string"
  );
}

/** Structural validation only - does not touch keyring/crypto. Fail closed on any mismatch. */
function isStructurallyValidRecord(raw: unknown): raw is PersistedWebSessionV1 {
  if (typeof raw !== "object" || raw === null) {
    return false;
  }
  const record = raw as Record<string, unknown>;
  return (
    record.schemaVersion === CURRENT_SCHEMA_VERSION &&
    isFiniteNumber(record.revision) &&
    isFiniteNumber(record.createdAt) &&
    isFiniteNumber(record.absoluteExpiresAt) &&
    isFiniteNumber(record.accessTokenExpiresAt) &&
    isFiniteNumber(record.refreshTokenExpiresAt) &&
    typeof record.refreshState === "string" &&
    REFRESH_STATES.has(record.refreshState as RefreshState) &&
    (record.refreshLeaseExpiresAt === null ||
      isFiniteNumber(record.refreshLeaseExpiresAt)) &&
    isValidEnvelope(record.encryptedCredentials)
  );
}

/**
 * The single place that turns a raw Redis string back into a usable WebSession, or fails closed.
 * A pure classifier: no telemetry, no deletion - RedisWebSessionStore.find is the caller that
 * decides what to do with a "corrupt" result (emit the diagnostic event, best-effort delete the
 * key). Treated as unusable/corrupt: malformed JSON, unsupported schemaVersion, structurally
 * invalid fields, unknown encryption keyId, decrypt/auth-tag failure, and an already-past
 * absoluteExpiresAt (defensive - Redis's own TTL should have already evicted it).
 */
export function decode(
  raw: string,
  sessionIdHash: string,
  keyring: Keyring,
  now: number,
): DecodeResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { kind: "corrupt", reason: "malformed_json" };
  }

  if (typeof parsed === "object" && parsed !== null) {
    const schemaVersion = (parsed as Record<string, unknown>).schemaVersion;
    if (schemaVersion !== CURRENT_SCHEMA_VERSION) {
      return { kind: "corrupt", reason: "unsupported_schema_version" };
    }
  }

  if (!isStructurallyValidRecord(parsed)) {
    return { kind: "corrupt", reason: "invalid_fields" };
  }

  if (parsed.absoluteExpiresAt <= now) {
    return { kind: "corrupt", reason: "expired" };
  }

  let credentials: CredentialPlaintext;
  try {
    const decrypted = decrypt(
      parsed.encryptedCredentials,
      keyring,
      additionalData(parsed.schemaVersion, sessionIdHash),
    );
    credentials = JSON.parse(decrypted) as CredentialPlaintext;
  } catch {
    // Covers SessionCryptoError (unknown keyId / auth failure / invalid key config) and a
    // corrupt plaintext JSON payload alike - all mean the same thing here: unusable.
    return { kind: "corrupt", reason: "decryption_failed" };
  }
  if (
    typeof credentials.accessToken !== "string" ||
    typeof credentials.refreshToken !== "string"
  ) {
    return { kind: "corrupt", reason: "decryption_failed" };
  }

  return {
    kind: "ok",
    session: {
      sessionIdHash,
      accessToken: credentials.accessToken,
      accessTokenExpiresAt: parsed.accessTokenExpiresAt,
      refreshToken: credentials.refreshToken,
      refreshTokenExpiresAt: parsed.refreshTokenExpiresAt,
      revision: parsed.revision,
      refreshState: parsed.refreshState,
      refreshLeaseExpiresAt: parsed.refreshLeaseExpiresAt,
      createdAt: parsed.createdAt,
      absoluteExpiresAt: parsed.absoluteExpiresAt,
    },
  };
}
