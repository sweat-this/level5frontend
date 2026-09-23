import { describe, expect, it } from "vitest";
import { RedisWebSessionStore } from "./redis-web-session-store";
import { SessionStoreUnavailableError } from "./session-store-errors";
import { FakeRedisSessionClient } from "./test-support/fake-redis-session-client";
import type { Keyring } from "./session-crypto";
import type { WebSession } from "./web-session";

const NOW = 1_700_000_000_000;

function keyring(): Keyring {
  return { activeKeyId: "k1", keys: new Map([["k1", Buffer.alloc(32, 1)]]) };
}

function session(overrides: Partial<WebSession> = {}): WebSession {
  return {
    sessionIdHash: "hash-1",
    accessToken: "access-1",
    accessTokenExpiresAt: NOW + 900_000,
    refreshToken: "refresh-1",
    refreshTokenExpiresAt: NOW + 2_592_000_000,
    revision: 1,
    refreshState: "Ready",
    refreshLeaseExpiresAt: null,
    createdAt: NOW,
    absoluteExpiresAt: NOW + 2_592_000_000,
    ...overrides,
  };
}

function makeStore(client: FakeRedisSessionClient) {
  return new RedisWebSessionStore(client, keyring(), { now: () => NOW });
}

describe("RedisWebSessionStore", () => {
  it("creates, finds, and deletes a session", async () => {
    const client = new FakeRedisSessionClient();
    const store = makeStore(client);
    const original = session();

    await store.create(original);
    expect(await store.find(original.sessionIdHash)).toEqual(original);

    await store.delete(original.sessionIdHash);
    expect(await store.find(original.sessionIdHash)).toBeNull();
  });

  it("never writes the raw access/refresh tokens into the Redis value", async () => {
    const client = new FakeRedisSessionClient();
    const store = makeStore(client);
    const original = session();
    await store.create(original);

    const raw = client.rawValue("level5:web-session:hash-1");
    expect(raw).toBeDefined();
    expect(raw).not.toContain("access-1");
    expect(raw).not.toContain("refresh-1");
  });

  it("performs a winning compareAndSwap and a losing one against the same fake CAS semantics", async () => {
    const client = new FakeRedisSessionClient();
    const store = makeStore(client);
    const original = session({ revision: 1 });
    await store.create(original);

    const replacement = session({ revision: 2, accessToken: "access-2" });
    expect(
      await store.compareAndSwap(original.sessionIdHash, 1, replacement),
    ).toBe(true);
    expect(await store.find(original.sessionIdHash)).toEqual(replacement);

    const staleAttempt = session({ revision: 3 });
    expect(
      await store.compareAndSwap(original.sessionIdHash, 1, staleAttempt),
    ).toBe(false);
  });

  it("returns false, not throw, for a CAS against a missing key", async () => {
    const client = new FakeRedisSessionClient();
    const store = makeStore(client);
    expect(await store.compareAndSwap("missing", 1, session())).toBe(false);
  });

  it("throws SessionStoreUnavailableError, never returns false/null, for a GET failure", async () => {
    const client = new FakeRedisSessionClient();
    client.getFault = () => true;
    const store = makeStore(client);

    await expect(store.find("hash-1")).rejects.toBeInstanceOf(
      SessionStoreUnavailableError,
    );
  });

  it("throws SessionStoreUnavailableError for a SET failure on create", async () => {
    const client = new FakeRedisSessionClient();
    client.setFault = () => true;
    const store = makeStore(client);

    await expect(store.create(session())).rejects.toBeInstanceOf(
      SessionStoreUnavailableError,
    );
  });

  it("throws SessionStoreUnavailableError for an EVAL failure on compareAndSwap", async () => {
    const client = new FakeRedisSessionClient();
    const store = makeStore(client);
    await store.create(session());

    client.evalFault = () => true;
    await expect(
      store.compareAndSwap("hash-1", 1, session({ revision: 2 })),
    ).rejects.toBeInstanceOf(SessionStoreUnavailableError);
  });

  it("throws SessionStoreUnavailableError for a DEL failure", async () => {
    const client = new FakeRedisSessionClient();
    const store = makeStore(client);
    await store.create(session());

    client.delFault = () => true;
    await expect(store.delete("hash-1")).rejects.toBeInstanceOf(
      SessionStoreUnavailableError,
    );
  });

  it("fails closed and deletes the key on find() when the record is corrupt", async () => {
    const client = new FakeRedisSessionClient();
    const store = makeStore(client);
    // Bypass the store's own encode() to write a record that decode() cannot parse.
    await client.set("level5:web-session:hash-1", "not valid json{", {
      condition: "NX",
      expiration: { type: "PXAT", value: NOW + 60_000 },
    });

    const result = await store.find("hash-1");
    expect(result).toBeNull();
    expect(client.rawValue("level5:web-session:hash-1")).toBeUndefined();
  });

  it("rejects a duplicate create for the same session id without overwriting the existing record", async () => {
    const client = new FakeRedisSessionClient();
    const store = makeStore(client);
    const original = session();
    await store.create(original);

    await expect(
      store.create(session({ accessToken: "different-access-token" })),
    ).rejects.toThrow();
    expect(await store.find(original.sessionIdHash)).toEqual(original);
  });
});
