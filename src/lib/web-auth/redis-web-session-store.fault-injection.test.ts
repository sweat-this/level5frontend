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

  // Issue #10: Redis *latency*, not an outright command failure - a command that outlives
  // commandTimeoutMs must fail closed the same way an immediate error does (SessionStoreUnavailableError),
  // never hang the caller past that budget.
  describe("latency (issue #10)", () => {
    it("find() fails closed with SessionStoreUnavailableError when GET exceeds commandTimeoutMs", async () => {
      const client = new FakeRedisSessionClient();
      const store = new RedisWebSessionStore(client, keyring(), {
        now: () => NOW,
        commandTimeoutMs: 20,
      });
      await store.create(session());
      client.delayMs = () => 200;

      await expect(store.find("hash-1")).rejects.toBeInstanceOf(
        SessionStoreUnavailableError,
      );
    });

    it("compareAndSwap() fails closed with SessionStoreUnavailableError when EVAL exceeds commandTimeoutMs", async () => {
      const client = new FakeRedisSessionClient();
      const store = new RedisWebSessionStore(client, keyring(), {
        now: () => NOW,
        commandTimeoutMs: 20,
      });
      await store.create(session());
      client.delayMs = () => 200;

      await expect(
        store.compareAndSwap("hash-1", 1, session({ revision: 2 })),
      ).rejects.toBeInstanceOf(SessionStoreUnavailableError);
    });

    it("a command well within commandTimeoutMs still succeeds normally", async () => {
      const client = new FakeRedisSessionClient();
      const store = new RedisWebSessionStore(client, keyring(), {
        now: () => NOW,
        commandTimeoutMs: 200,
      });
      const original = session();
      await store.create(original);
      client.delayMs = () => 5;

      expect(await store.find("hash-1")).toEqual(original);
    });

    // ping() is the /health/ready readiness-probe path (issue #38's "real readiness"), a
    // different command than the data ones above - it must fail closed under the same latency
    // budget rather than leaving readiness hanging past commandTimeoutMs.
    it("ping() fails closed with SessionStoreUnavailableError when PING exceeds commandTimeoutMs", async () => {
      const client = new FakeRedisSessionClient();
      const store = new RedisWebSessionStore(client, keyring(), {
        now: () => NOW,
        commandTimeoutMs: 20,
      });
      client.delayMs = () => 200;

      await expect(store.ping()).rejects.toBeInstanceOf(
        SessionStoreUnavailableError,
      );
    });

    it("ping() well within commandTimeoutMs still succeeds normally", async () => {
      const client = new FakeRedisSessionClient();
      const store = new RedisWebSessionStore(client, keyring(), {
        now: () => NOW,
        commandTimeoutMs: 200,
      });
      client.delayMs = () => 5;

      await expect(store.ping()).resolves.toBeUndefined();
    });
  });

  // Issue #10: RedisWebSessionStore.withTimeout() calls client.withAbortSignal(signal) fresh
  // immediately before every single command - a real @redis/client's equivalent returns a new,
  // independently-scoped command builder each time, never a shared mutable object. The fake must
  // match that: two views obtained from two different withAbortSignal() calls must never be the
  // same object (which would let a later call silently repoint an earlier one's abort signal).
  describe("withAbortSignal returns independently-scoped views (issue #10)", () => {
    it("two views from two different calls are distinct objects, each bound to its own signal", async () => {
      const client = new FakeRedisSessionClient();
      const controllerA = new AbortController();
      const controllerB = new AbortController();

      const viewA = client.withAbortSignal(controllerA.signal);
      const viewB = client.withAbortSignal(controllerB.signal);

      expect(viewA).not.toBe(viewB);
      expect(viewA).not.toBe(client);

      // Proves it's not just distinct-but-still-cross-wired: aborting B's controller must never
      // affect a command already in flight on A.
      client.delayMs = () => 50;
      const pendingOnA = viewA.get("some-key");
      controllerB.abort(new Error("B aborted"));

      await new Promise((resolve) => setTimeout(resolve, 100));
      await expect(pendingOnA).resolves.toBeNull();
    });
  });
});
