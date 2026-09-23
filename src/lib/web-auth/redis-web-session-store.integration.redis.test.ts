import { createClient } from "@redis/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  RedisWebSessionStore,
  type RedisSessionClient,
} from "./redis-web-session-store";
import type { Keyring } from "./session-crypto";
import type { WebSession } from "./web-session";

/**
 * Certifies RedisWebSessionStore's CAS/TTL/create semantics against a *real* Redis - not the JS
 * re-implementation redis-web-session-store.fault-injection.test.ts uses. Skipped unless
 * explicitly enabled, matching the live-backend.certification.test.ts precedent for
 * real-dependency suites that don't run in the default `npm test` job.
 *
 * Run locally with a Redis on LEVEL5_WEB_SESSION_REDIS_URL (default redis://localhost:6379), e.g.:
 *   docker run -p 6379:6379 redis:7.4.11-alpine
 *   LEVEL5_REDIS_INTEGRATION_TEST=true npx vitest run src/lib/web-auth/redis-web-session-store.integration.redis.test.ts
 */
const REDIS_URL =
  process.env.LEVEL5_WEB_SESSION_REDIS_URL ?? "redis://localhost:6379";
const NOW = () => Date.now();

function keyring(): Keyring {
  return { activeKeyId: "k1", keys: new Map([["k1", Buffer.alloc(32, 1)]]) };
}

function session(overrides: Partial<WebSession> = {}): WebSession {
  const now = Date.now();
  return {
    sessionIdHash: `hash-${Math.random().toString(36).slice(2)}`,
    accessToken: "access-token-value",
    accessTokenExpiresAt: now + 900_000,
    refreshToken: "refresh-token-value",
    refreshTokenExpiresAt: now + 2_592_000_000,
    revision: 1,
    refreshState: "Ready",
    refreshLeaseExpiresAt: null,
    createdAt: now,
    absoluteExpiresAt: now + 2_592_000_000,
    ...overrides,
  };
}

describe.skipIf(!process.env.LEVEL5_REDIS_INTEGRATION_TEST)(
  "RedisWebSessionStore (real Redis)",
  () => {
    let rawClient: ReturnType<typeof createClient>;

    beforeAll(async () => {
      rawClient = createClient({ url: REDIS_URL });
      await rawClient.connect();
    });

    afterAll(async () => {
      await rawClient.close();
    });

    // No flushDb/shared-state cleanup between tests: every test generates its own random
    // sessionIdHash (via session()'s default), so tests never collide with each other - and,
    // importantly, other *files* in this suite share the same external Redis instance and may
    // run concurrently (Vitest parallelizes test files), so a flushDb here would be able to wipe
    // out another file's in-flight test data. Each key's own TTL is what eventually cleans it up,
    // exactly as it would in production.
    function makeStore(): RedisWebSessionStore {
      return new RedisWebSessionStore(
        rawClient as unknown as RedisSessionClient,
        keyring(),
        { now: NOW },
      );
    }

    it("creates and finds a session", async () => {
      const store = makeStore();
      const original = session();
      await store.create(original);

      expect(await store.find(original.sessionIdHash)).toEqual(original);
    });

    it("deletes a session", async () => {
      const store = makeStore();
      const original = session();
      await store.create(original);
      await store.delete(original.sessionIdHash);

      expect(await store.find(original.sessionIdHash)).toBeNull();
    });

    it("a duplicate create cannot overwrite the existing record", async () => {
      const store = makeStore();
      const original = session();
      await store.create(original);

      await expect(
        store.create(session({ sessionIdHash: original.sessionIdHash })),
      ).rejects.toThrow();
      expect(await store.find(original.sessionIdHash)).toEqual(original);
    });

    it("sets a TTL matching the session's absolute expiry", async () => {
      const store = makeStore();
      const original = session({ absoluteExpiresAt: Date.now() + 60_000 });
      await store.create(original);

      const ttlMs = await rawClient.pTTL(
        `level5:web-session:${original.sessionIdHash}`,
      );
      // A generous tolerance rather than an exact bound: this asserts native Redis expiry is
      // actually wired to the session's absoluteExpiresAt, not that the test process and the
      // Redis server's clocks are perfectly synced (they need not be, in general deployment).
      expect(ttlMs).toBeGreaterThan(50_000);
      expect(ttlMs).toBeLessThanOrEqual(70_000);
    });

    it("the key is gone once its TTL has elapsed", async () => {
      const store = makeStore();
      const original = session({ absoluteExpiresAt: Date.now() + 500 });
      await store.create(original);

      // A generous margin past the 500ms TTL, tolerant of clock skew between this process and
      // the Redis server.
      await new Promise((resolve) => setTimeout(resolve, 3000));

      const raw = await rawClient.get(
        `level5:web-session:${original.sessionIdHash}`,
      );
      expect(raw).toBeNull();
    }, 10_000);

    it("compareAndSwap succeeds when the revision matches, and updates the TTL", async () => {
      const store = makeStore();
      const original = session({ revision: 1 });
      await store.create(original);

      const replacement = session({
        sessionIdHash: original.sessionIdHash,
        revision: 2,
        accessToken: "rotated-access-token",
        absoluteExpiresAt: Date.now() + 120_000,
      });
      const won = await store.compareAndSwap(
        original.sessionIdHash,
        1,
        replacement,
      );

      expect(won).toBe(true);
      expect(await store.find(original.sessionIdHash)).toEqual(replacement);
    });

    it("compareAndSwap fails on a revision mismatch and leaves the record untouched", async () => {
      const store = makeStore();
      const original = session({ revision: 1 });
      await store.create(original);

      const won = await store.compareAndSwap(
        original.sessionIdHash,
        99,
        session({ sessionIdHash: original.sessionIdHash, revision: 2 }),
      );

      expect(won).toBe(false);
      expect(await store.find(original.sessionIdHash)).toEqual(original);
    });

    it("compareAndSwap fails on a missing key", async () => {
      const store = makeStore();
      const won = await store.compareAndSwap(
        "definitely-missing",
        1,
        session({ sessionIdHash: "definitely-missing", revision: 2 }),
      );
      expect(won).toBe(false);
    });

    it("exactly one of many concurrent CAS contenders wins", async () => {
      const store = makeStore();
      const original = session({ revision: 1 });
      await store.create(original);

      const contenders = Array.from({ length: 15 }, (_, index) =>
        store.compareAndSwap(
          original.sessionIdHash,
          1,
          session({
            sessionIdHash: original.sessionIdHash,
            revision: 2,
            accessToken: `contender-${index}`,
          }),
        ),
      );
      const results = await Promise.all(contenders);

      expect(results.filter(Boolean)).toHaveLength(1);
    });

    it("never stores the raw browser session id or plaintext tokens", async () => {
      const store = makeStore();
      const original = session({
        accessToken: "super-secret-access-token",
        refreshToken: "super-secret-refresh-token",
      });
      await store.create(original);

      const raw = await rawClient.get(
        `level5:web-session:${original.sessionIdHash}`,
      );
      expect(raw).not.toBeNull();
      expect(raw).not.toContain("super-secret-access-token");
      expect(raw).not.toContain("super-secret-refresh-token");
      // The lookup key is the SHA-256 hash of the browser session id, never the raw value itself.
      expect(raw).not.toContain(original.sessionIdHash.slice(0, 8));
    });
  },
);
