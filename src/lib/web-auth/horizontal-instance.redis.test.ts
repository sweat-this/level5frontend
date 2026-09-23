import { createClient } from "@redis/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  RedisWebSessionStore,
  type RedisSessionClient,
} from "./redis-web-session-store";
import type { Keyring } from "./session-crypto";
import {
  fakeCredentials,
  FakeBackendAuthClient,
} from "./test-support/fake-backend-auth-client";
import { WebSessionCoordinator } from "./web-session-coordinator";

/**
 * Proves the CAS-based refresh algorithm against a *real* shared Redis, with two fully
 * independent client/store/coordinator instances - exactly as two horizontally-scaled Next.js
 * instances would share one Redis in production. Mirrors
 * web-session-coordinator.concurrency.test.ts (which proves the same thing against
 * MemoryWebSessionStore, i.e. within one process) - this is the issue #5 upgrade of that proof to
 * an actual network boundary.
 *
 * Run locally with a Redis on LEVEL5_WEB_SESSION_REDIS_URL (default redis://localhost:6379):
 *   docker run -p 6379:6379 redis:7.4.11-alpine
 *   LEVEL5_REDIS_INTEGRATION_TEST=true npx vitest run src/lib/web-auth/horizontal-instance.redis.test.ts
 */
const REDIS_URL =
  process.env.LEVEL5_WEB_SESSION_REDIS_URL ?? "redis://localhost:6379";

function keyring(): Keyring {
  return { activeKeyId: "k1", keys: new Map([["k1", Buffer.alloc(32, 1)]]) };
}

describe.skipIf(!process.env.LEVEL5_REDIS_INTEGRATION_TEST)(
  "WebSessionCoordinator horizontal-instance concurrency (real Redis)",
  () => {
    let clientA: ReturnType<typeof createClient>;
    let clientB: ReturnType<typeof createClient>;

    beforeAll(async () => {
      clientA = createClient({ url: REDIS_URL });
      clientB = createClient({ url: REDIS_URL });
      await Promise.all([clientA.connect(), clientB.connect()]);
    });

    afterAll(async () => {
      await Promise.all([clientA.close(), clientB.close()]);
    });

    // No flushDb between tests - login() generates a fresh cryptographically random session id
    // every run, and other *files* in this suite may run concurrently against the same external
    // Redis instance (Vitest parallelizes test files), so a shared flushDb here could wipe out
    // another file's in-flight test data.
    it("makes exactly one Backend V2 refresh call for 20 concurrent requests against one expired session, with no old-refresh-token replay", async () => {
      // Independent client -> independent store -> independent coordinator, per instance A/B -
      // nothing shared in-process except the real Redis they both point at.
      const storeA = new RedisWebSessionStore(
        clientA as unknown as RedisSessionClient,
        keyring(),
      );
      const storeB = new RedisWebSessionStore(
        clientB as unknown as RedisSessionClient,
        keyring(),
      );

      const backend = new FakeBackendAuthClient();
      backend.refreshImpl = () => ({
        kind: "success",
        credentials: fakeCredentials({
          accessToken: "winner-access-token",
          refreshToken: "winner-refresh-token",
        }),
      });
      backend.loginImpl = () => ({
        kind: "success",
        credentials: fakeCredentials({
          expiresAt: new Date(Date.now() - 1000).toISOString(),
        }),
      });

      const coordinatorA = new WebSessionCoordinator(storeA, backend, {
        waitDelayMs: 20,
        maxWaitRetries: 50,
      });
      const coordinatorB = new WebSessionCoordinator(storeB, backend, {
        waitDelayMs: 20,
        maxWaitRetries: 50,
      });

      const loginResult = await coordinatorA.login("user", "pass");
      if (loginResult.kind !== "success") {
        throw new Error(`expected login success, got ${loginResult.kind}`);
      }
      const { sessionId } = loginResult;

      const callers = Array.from({ length: 20 }, (_, index) =>
        (index % 2 === 0 ? coordinatorA : coordinatorB).getAccessToken(
          sessionId,
        ),
      );
      const results = await Promise.all(callers);

      expect(backend.refreshCallCount).toBe(1);
      for (const result of results) {
        expect(result).toEqual({
          kind: "ready",
          accessToken: "winner-access-token",
        });
      }
    }, 20_000);
  },
);
