import { createClient } from "@redis/client";
import { afterAll, describe, expect, it } from "vitest";
import { BackendAuthClient } from "./backend-auth-client";
import { hashSessionId } from "./session-id";
import {
  RedisWebSessionStore,
  type RedisSessionClient,
} from "./redis-web-session-store";
import type { Keyring } from "./session-crypto";
import { WebSessionCoordinator } from "./web-session-coordinator";

/**
 * Certifies the full stack - WebSessionCoordinator + RedisWebSessionStore - against a *real*,
 * currently-running Backend V2 and a *real* Redis. The non-Redis counterpart,
 * live-backend.certification.test.ts, certifies the coordinator/adapter alone against real
 * Backend V2 using MemoryWebSessionStore; this file is issue #5's upgrade of that same proof to
 * the production store. Skipped unless both a live Backend V2 and Redis are explicitly enabled.
 *
 * Run locally with a live Backend V2 (see v2/scripts/setup-local-dev.ps1) and a Redis:
 *   docker run -p 6379:6379 redis:7.4.11-alpine
 *   LEVEL5_LIVE_BACKEND_CERTIFICATION=true LEVEL5_REDIS_INTEGRATION_TEST=true \
 *     LEVEL5_LIVE_BACKEND_BASE_URL=https://localhost:7029 NODE_TLS_REJECT_UNAUTHORIZED=0 \
 *     npx vitest run src/lib/web-auth/live-backend-redis.certification.redis.test.ts
 */
const BACKEND_BASE_URL =
  process.env.LEVEL5_LIVE_BACKEND_BASE_URL ?? "https://localhost:7029";
const REDIS_URL =
  process.env.LEVEL5_WEB_SESSION_REDIS_URL ?? "redis://localhost:6379";

function keyring(): Keyring {
  return { activeKeyId: "k1", keys: new Map([["k1", Buffer.alloc(32, 1)]]) };
}

class CountingBackendAuthClient extends BackendAuthClient {
  refreshCallCount = 0;

  override async refresh(...args: Parameters<BackendAuthClient["refresh"]>) {
    this.refreshCallCount += 1;
    return super.refresh(...args);
  }
}

async function forceAccessTokenExpiry(
  store: RedisWebSessionStore,
  sessionIdHash: string,
): Promise<void> {
  const session = await store.find(sessionIdHash);
  if (!session) {
    throw new Error("expected a session to force-expire");
  }
  const won = await store.compareAndSwap(sessionIdHash, session.revision, {
    ...session,
    accessTokenExpiresAt: Date.now() - 1000,
  });
  if (!won) {
    throw new Error(
      "failed to force-expire the test session (unexpected concurrent mutation)",
    );
  }
}

describe.skipIf(
  !process.env.LEVEL5_LIVE_BACKEND_CERTIFICATION ||
    !process.env.LEVEL5_REDIS_INTEGRATION_TEST,
)("Live Backend V2 certification (Redis-backed)", () => {
  let rawClient: ReturnType<typeof createClient>;

  afterAll(async () => {
    if (rawClient) {
      await rawClient.close();
    }
  });

  it("certifies login, /me, one coordinated refresh, and logout, with the Redis key removed afterwards", async () => {
    rawClient = createClient({ url: REDIS_URL });
    await rawClient.connect();

    const username = `authcert_redis_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const password = "Str0ng!Passw0rd#Cert123";

    const registerResponse = await fetch(
      `${BACKEND_BASE_URL}/api/v2/auth/register`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          username,
          password,
          displayName: "Auth Cert Redis",
        }),
      },
    );
    expect(registerResponse.status).toBe(200);

    const store = new RedisWebSessionStore(
      rawClient as unknown as RedisSessionClient,
      keyring(),
    );
    const backend = new CountingBackendAuthClient(BACKEND_BASE_URL);
    const coordinator = new WebSessionCoordinator(store, backend);

    const loginResult = await coordinator.login(username, password);
    expect(loginResult.kind).toBe("success");
    if (loginResult.kind !== "success") {
      return;
    }
    const sessionIdHash = hashSessionId(loginResult.sessionId);
    const redisKey = `level5:web-session:${sessionIdHash}`;

    expect(await rawClient.get(redisKey)).not.toBeNull();

    const meBeforeRefresh = await coordinator.getMe(loginResult.sessionId);
    expect(meBeforeRefresh.kind).toBe("success");
    if (meBeforeRefresh.kind === "success") {
      expect(meBeforeRefresh.account.username).toBe(username);
    }
    expect(backend.refreshCallCount).toBe(0);

    // Force-expire only this test's Redis-persisted access-token metadata - not Backend V2, and
    // not reachable via any browser-facing endpoint - to prove a real coordinated refresh without
    // waiting out the real 15-minute access-token lifetime.
    await forceAccessTokenExpiry(store, sessionIdHash);
    const meAfterForcedExpiry = await coordinator.getMe(loginResult.sessionId);
    expect(meAfterForcedExpiry.kind).toBe("success");
    expect(backend.refreshCallCount).toBe(1);

    await coordinator.logout(loginResult.sessionId);
    const afterLogout = await coordinator.getAccessToken(loginResult.sessionId);
    expect(afterLogout).toEqual({ kind: "not_found" });
    expect(await rawClient.get(redisKey)).toBeNull();
  }, 30_000);
});
