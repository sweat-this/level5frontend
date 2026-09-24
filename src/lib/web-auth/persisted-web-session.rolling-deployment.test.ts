import { describe, expect, it } from "vitest";
import { decode, encode } from "./persisted-web-session";
import type { Keyring } from "./session-crypto";
import type { RefreshState } from "./web-session";

/**
 * Rolling-deployment / schema-compatibility certification (issue #10). schemaVersion is
 * currently 1 with no V2 in existence - so "version A / version B" here means "an older running
 * instance's already-persisted record" vs "the current build's decode()/encode()", which is
 * exactly what a rolling deploy actually requires to stay compatible. If a future schema bump
 * ever needs the record shape to change, decode() must keep accepting this exact frozen string
 * (or fail this test loudly) until the rollout rule documented below has been followed.
 */

// Captured once from a real encode() call (see the PR that added this file) - deliberately
// never regenerated. If this ever fails to decode, either decode() broke real backward
// compatibility, or a schema change shipped without a compatibility rule - both are the failure
// this test exists to catch before a rolling deploy does.
const FROZEN_V1_RECORD =
  '{"schemaVersion":1,"revision":1,"createdAt":1700000000000,"absoluteExpiresAt":1702592000000,"accessTokenExpiresAt":1700000900000,"refreshTokenExpiresAt":1702592000000,"refreshState":"Ready","refreshLeaseExpiresAt":null,"encryptedCredentials":{"keyId":"fixture-key-1","iv":"+WMhxDnkqSbLIiDc","ciphertext":"ljl/y6llP9RS4VtCaKwg0guppWxHpYQ8xE5Tq/ng97QHI00Tt7oAN4UB4v5etjNckF9nn9+y7P4PuXq0yboTpDUegVY7hkQXGbW35UI=","authTag":"nKgj1/fGmzecH1YkuLVEYA=="}}';
const FROZEN_FIXTURE_SESSION_ID_HASH = "fixture-session-hash";

function fixtureKeyring(): Keyring {
  return {
    activeKeyId: "fixture-key-1",
    keys: new Map([["fixture-key-1", Buffer.alloc(32, 7)]]),
  };
}

describe("rolling deployment: frozen V1 record compatibility", () => {
  it("the current decode() still reads a frozen record captured from an earlier build", () => {
    const result = decode(
      FROZEN_V1_RECORD,
      FROZEN_FIXTURE_SESSION_ID_HASH,
      fixtureKeyring(),
      1_700_000_500_000, // before absoluteExpiresAt
    );

    expect(result).toEqual({
      kind: "ok",
      session: {
        sessionIdHash: FROZEN_FIXTURE_SESSION_ID_HASH,
        accessToken: "fixture-access-token",
        accessTokenExpiresAt: 1_700_000_900_000,
        refreshToken: "fixture-refresh-token",
        refreshTokenExpiresAt: 1_702_592_000_000,
        revision: 1,
        refreshState: "Ready",
        refreshLeaseExpiresAt: null,
        createdAt: 1_700_000_000_000,
        absoluteExpiresAt: 1_702_592_000_000,
      },
    });
  });

  it("a 'new build' write, then a normal read, stays stable - the compatibility loop this proves for real deploys", () => {
    const keyring = fixtureKeyring();
    const decoded = decode(
      FROZEN_V1_RECORD,
      FROZEN_FIXTURE_SESSION_ID_HASH,
      keyring,
      1_700_000_500_000,
    );
    if (decoded.kind !== "ok") {
      throw new Error("expected the frozen fixture to decode");
    }

    // Simulates the new build performing an ordinary refresh: bump revision, rotate tokens -
    // exactly what performRefresh() does, without depending on the coordinator here.
    const refreshed = {
      ...decoded.session,
      revision: decoded.session.revision + 1,
      accessToken: "new-access-token",
      refreshToken: "new-refresh-token",
      refreshState: "Ready" as RefreshState,
    };
    const reEncoded = encode(
      refreshed,
      FROZEN_FIXTURE_SESSION_ID_HASH,
      keyring,
    );

    // A compatible reader (still decode() - no schema bump has actually happened) can consume
    // what the new build wrote.
    const redecoded = decode(
      reEncoded,
      FROZEN_FIXTURE_SESSION_ID_HASH,
      keyring,
      1_700_000_500_000,
    );
    expect(redecoded).toEqual({ kind: "ok", session: refreshed });
  });
});

describe("staged key rotation certification", () => {
  const OLD_KEY_ID = "k-old";
  const NEW_KEY_ID = "k-new";
  const oldKey = Buffer.alloc(32, 1);
  const newKey = Buffer.alloc(32, 2);
  const sessionIdHash = "rotation-session-hash";
  const now = 1_700_000_000_000;

  function baseSession() {
    return {
      sessionIdHash,
      accessToken: "at-1",
      accessTokenExpiresAt: now + 900_000,
      refreshToken: "rt-1",
      refreshTokenExpiresAt: now + 2_592_000_000,
      revision: 1,
      refreshState: "Ready" as RefreshState,
      refreshLeaseExpiresAt: null,
      createdAt: now,
      absoluteExpiresAt: now + 2_592_000_000,
    };
  }

  it("stage 1: old-writer record stays readable once the new key is added but not yet active", () => {
    const oldOnly: Keyring = {
      activeKeyId: OLD_KEY_ID,
      keys: new Map([[OLD_KEY_ID, oldKey]]),
    };
    const encoded = encode(baseSession(), sessionIdHash, oldOnly);

    const bothKeysStillOldActive: Keyring = {
      activeKeyId: OLD_KEY_ID,
      keys: new Map([
        [OLD_KEY_ID, oldKey],
        [NEW_KEY_ID, newKey],
      ]),
    };
    expect(
      decode(encoded, sessionIdHash, bothKeysStillOldActive, now).kind,
    ).toBe("ok");
  });

  it("stage 2: switching the active writer key to the new one - old records and new records are both still readable", () => {
    const oldOnly: Keyring = {
      activeKeyId: OLD_KEY_ID,
      keys: new Map([[OLD_KEY_ID, oldKey]]),
    };
    const oldEncoded = encode(baseSession(), sessionIdHash, oldOnly);

    const newActiveBothPresent: Keyring = {
      activeKeyId: NEW_KEY_ID,
      keys: new Map([
        [OLD_KEY_ID, oldKey],
        [NEW_KEY_ID, newKey],
      ]),
    };
    // The old (already-persisted) record is still readable...
    expect(
      decode(oldEncoded, sessionIdHash, newActiveBothPresent, now).kind,
    ).toBe("ok");

    // ...and a fresh write under the new active key round-trips too, and is now actually
    // encrypted under the new key (not silently still using the old one).
    const newEncoded = encode(
      baseSession(),
      sessionIdHash,
      newActiveBothPresent,
    );
    expect(JSON.parse(newEncoded).encryptedCredentials.keyId).toBe(NEW_KEY_ID);
    expect(
      decode(newEncoded, sessionIdHash, newActiveBothPresent, now).kind,
    ).toBe("ok");
  });

  it("retiring the old key before every old-written record has rotated or expired makes those records unreadable - this is why retirement must wait for a safe window", () => {
    const oldOnly: Keyring = {
      activeKeyId: OLD_KEY_ID,
      keys: new Map([[OLD_KEY_ID, oldKey]]),
    };
    const oldEncoded = encode(baseSession(), sessionIdHash, oldOnly);

    const retiredOldKey: Keyring = {
      activeKeyId: NEW_KEY_ID,
      keys: new Map([[NEW_KEY_ID, newKey]]),
    };
    // decode() fails closed exactly like any other undecryptable record - not a crash, but a
    // real access loss for that session. This is precisely why the old key must stay in every
    // instance's keyring until every record written under it has either been rotated (rewritten
    // under the new key on its next refresh) or naturally expired - see
    // docs/architecture/web-authentication.md's "Encryption at rest and key rotation" section.
    expect(decode(oldEncoded, sessionIdHash, retiredOldKey, now)).toEqual({
      kind: "corrupt",
      reason: "decryption_failed",
    });
  });
});
