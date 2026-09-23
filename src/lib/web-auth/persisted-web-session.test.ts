import { describe, expect, it } from "vitest";
import {
  CURRENT_SCHEMA_VERSION,
  decode,
  encode,
  type PersistedWebSessionV1,
} from "./persisted-web-session";
import type { Keyring } from "./session-crypto";
import type { WebSession } from "./web-session";

const SESSION_ID_HASH = "abc123hash";
const NOW = 1_700_000_000_000;

function keyOf(byte: number): Buffer {
  return Buffer.alloc(32, byte);
}

function keyring(activeKeyId: string, keys: Record<string, Buffer>): Keyring {
  return { activeKeyId, keys: new Map(Object.entries(keys)) };
}

function session(overrides: Partial<WebSession> = {}): WebSession {
  return {
    sessionIdHash: SESSION_ID_HASH,
    accessToken: "access-token",
    accessTokenExpiresAt: NOW + 900_000,
    refreshToken: "refresh-token",
    refreshTokenExpiresAt: NOW + 2_592_000_000,
    revision: 1,
    refreshState: "Ready",
    refreshLeaseExpiresAt: null,
    createdAt: NOW,
    absoluteExpiresAt: NOW + 2_592_000_000,
    ...overrides,
  };
}

describe("persisted-web-session", () => {
  it("round-trips a WebSession through encode/decode", () => {
    const ring = keyring("k1", { k1: keyOf(1) });
    const original = session();
    const raw = encode(original, SESSION_ID_HASH, ring);
    const result = decode(raw, SESSION_ID_HASH, ring, NOW);

    expect(result).toEqual({ kind: "ok", session: original });
  });

  it("never writes the access/refresh tokens outside the encrypted envelope", () => {
    const ring = keyring("k1", { k1: keyOf(1) });
    const raw = encode(session(), SESSION_ID_HASH, ring);
    expect(raw).not.toContain("access-token");
    expect(raw).not.toContain("refresh-token");
  });

  it("fails closed on malformed JSON", () => {
    const ring = keyring("k1", { k1: keyOf(1) });
    const result = decode("not json{", SESSION_ID_HASH, ring, NOW);
    expect(result).toEqual({ kind: "corrupt", reason: "malformed_json" });
  });

  it("fails closed on an unsupported schema version", () => {
    const ring = keyring("k1", { k1: keyOf(1) });
    const raw = encode(session(), SESSION_ID_HASH, ring);
    const parsed = JSON.parse(raw) as PersistedWebSessionV1;
    const tampered = JSON.stringify({ ...parsed, schemaVersion: 2 });

    const result = decode(tampered, SESSION_ID_HASH, ring, NOW);
    expect(result).toEqual({
      kind: "corrupt",
      reason: "unsupported_schema_version",
    });
  });

  it("fails closed on structurally invalid fields", () => {
    const ring = keyring("k1", { k1: keyOf(1) });
    const raw = encode(session(), SESSION_ID_HASH, ring);
    const parsed = JSON.parse(raw) as PersistedWebSessionV1;
    const tampered = JSON.stringify({ ...parsed, refreshState: "NotAState" });

    const result = decode(tampered, SESSION_ID_HASH, ring, NOW);
    expect(result).toEqual({ kind: "corrupt", reason: "invalid_fields" });
  });

  it("fails closed on an already-past absoluteExpiresAt", () => {
    const ring = keyring("k1", { k1: keyOf(1) });
    const raw = encode(
      session({ absoluteExpiresAt: NOW - 1 }),
      SESSION_ID_HASH,
      ring,
    );

    const result = decode(raw, SESSION_ID_HASH, ring, NOW);
    expect(result).toEqual({ kind: "corrupt", reason: "expired" });
  });

  it("fails closed on an unknown encryption keyId", () => {
    const writer = keyring("k1", { k1: keyOf(1) });
    const raw = encode(session(), SESSION_ID_HASH, writer);

    const reader = keyring("k2-only", { "k2-only": keyOf(2) });
    const result = decode(raw, SESSION_ID_HASH, reader, NOW);
    expect(result).toEqual({ kind: "corrupt", reason: "decryption_failed" });
  });

  it("fails closed on a corrupt encryption envelope (tampered ciphertext)", () => {
    const ring = keyring("k1", { k1: keyOf(1) });
    const raw = encode(session(), SESSION_ID_HASH, ring);
    const parsed = JSON.parse(raw) as PersistedWebSessionV1;
    const tampered = JSON.stringify({
      ...parsed,
      encryptedCredentials: {
        ...parsed.encryptedCredentials,
        ciphertext: Buffer.from("tampered-bytes-not-real").toString("base64"),
      },
    });

    const result = decode(tampered, SESSION_ID_HASH, ring, NOW);
    expect(result).toEqual({ kind: "corrupt", reason: "decryption_failed" });
  });

  it("fails closed when decoded under a different sessionIdHash (AAD binding)", () => {
    const ring = keyring("k1", { k1: keyOf(1) });
    const raw = encode(session(), SESSION_ID_HASH, ring);

    const result = decode(raw, "a-different-session-hash", ring, NOW);
    expect(result).toEqual({ kind: "corrupt", reason: "decryption_failed" });
  });

  describe("key rotation", () => {
    it("reads a record written with an old key once both keys are in the keyring, and new writes use the active key", () => {
      const stageOldActive = keyring("old", { old: keyOf(1) });
      const rawFromOld = encode(session(), SESSION_ID_HASH, stageOldActive);

      // Deploy stage: both keys present, "old" still active.
      const stageBoth = keyring("old", { old: keyOf(1), new: keyOf(2) });
      expect(decode(rawFromOld, SESSION_ID_HASH, stageBoth, NOW)).toEqual({
        kind: "ok",
        session: session(),
      });

      // Switch active key to "new": old records stay readable, new writes use "new".
      const stageNewActive = keyring("new", { old: keyOf(1), new: keyOf(2) });
      expect(decode(rawFromOld, SESSION_ID_HASH, stageNewActive, NOW)).toEqual({
        kind: "ok",
        session: session(),
      });

      const rawFromNew = encode(session(), SESSION_ID_HASH, stageNewActive);
      const parsedNew = JSON.parse(rawFromNew) as PersistedWebSessionV1;
      expect(parsedNew.encryptedCredentials.keyId).toBe("new");

      // Once "old" is finally removed from the keyring, the old record can no longer be read.
      const stageOldRemoved = keyring("new", { new: keyOf(2) });
      expect(decode(rawFromOld, SESSION_ID_HASH, stageOldRemoved, NOW)).toEqual(
        {
          kind: "corrupt",
          reason: "decryption_failed",
        },
      );
    });
  });

  it("exposes CURRENT_SCHEMA_VERSION as 1", () => {
    expect(CURRENT_SCHEMA_VERSION).toBe(1);
  });
});
