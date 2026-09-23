import { beforeEach, describe, expect, it } from "vitest";
import { hashSessionId } from "./session-id";
import { MemoryWebSessionStore } from "./memory-web-session-store";
import {
  fakeAccount,
  fakeCredentials,
  FakeBackendAuthClient,
} from "./test-support/fake-backend-auth-client";
import type { WebSession } from "./web-session";
import { WebSessionCoordinator } from "./web-session-coordinator";

/** A fixed, known session id so a test can seed the store directly by its real hash. */
const SEEDED_SESSION_ID = "seeded-session-id-for-tests";
const SEEDED_SESSION_ID_HASH = hashSessionId(SEEDED_SESSION_ID);

function seedSession(overrides: Partial<WebSession> = {}): WebSession {
  return {
    sessionIdHash: SEEDED_SESSION_ID_HASH,
    accessToken: "old-access-token",
    accessTokenExpiresAt: Date.now() + 900_000,
    refreshToken: "old-refresh-token",
    refreshTokenExpiresAt: Date.now() + 2_592_000_000,
    revision: 1,
    refreshState: "Ready",
    refreshLeaseExpiresAt: null,
    createdAt: Date.now(),
    absoluteExpiresAt: Date.now() + 2_592_000_000,
    ...overrides,
  };
}

describe("WebSessionCoordinator", () => {
  let store: MemoryWebSessionStore;
  let backend: FakeBackendAuthClient;
  let coordinator: WebSessionCoordinator;

  beforeEach(() => {
    store = new MemoryWebSessionStore();
    backend = new FakeBackendAuthClient();
    coordinator = new WebSessionCoordinator(store, backend, {
      waitDelayMs: 5,
      maxWaitRetries: 5,
    });
  });

  async function loginAndGetSessionId(
    credentials = fakeCredentials(),
    using: WebSessionCoordinator = coordinator,
  ): Promise<string> {
    backend.loginImpl = () => ({ kind: "success", credentials });
    const result = await using.login("user", "pass");
    if (result.kind !== "success") {
      throw new Error(`expected login success, got ${result.kind}`);
    }
    return result.sessionId;
  }

  it("returns the cached access token without calling refresh when it is still valid", async () => {
    const sessionId = await loginAndGetSessionId(
      fakeCredentials({
        expiresAt: new Date(Date.now() + 900_000).toISOString(),
      }),
    );

    const result = await coordinator.getAccessToken(sessionId);

    expect(result).toEqual({ kind: "ready", accessToken: "access-token-1" });
    expect(backend.refreshCallCount).toBe(0);
  });

  it("refreshes exactly once when the access token is locally expired, and rotates credentials", async () => {
    const sessionId = await loginAndGetSessionId(
      fakeCredentials({ expiresAt: new Date(Date.now() - 1000).toISOString() }),
    );
    backend.refreshImpl = () => ({
      kind: "success",
      credentials: fakeCredentials({
        accessToken: "access-token-2",
        refreshToken: "refresh-token-2",
      }),
    });

    const result = await coordinator.getAccessToken(sessionId);

    expect(result).toEqual({ kind: "ready", accessToken: "access-token-2" });
    expect(backend.refreshCallCount).toBe(1);
  });

  it("performs one coordinated refresh and retries /me once after a 401", async () => {
    const sessionId = await loginAndGetSessionId();
    let meCalls = 0;
    backend.getMeImpl = () => {
      meCalls += 1;
      return meCalls === 1
        ? { kind: "unauthorized" }
        : { kind: "success", account: fakeAccount() };
    };
    backend.refreshImpl = () => ({
      kind: "success",
      credentials: fakeCredentials({ accessToken: "access-token-2" }),
    });

    const result = await coordinator.getMe(sessionId);

    expect(result).toEqual({ kind: "success", account: fakeAccount() });
    expect(backend.refreshCallCount).toBe(1);
    expect(backend.getMeCallCount).toBe(2);
  });

  it("never loops past one refresh + one retry when /me keeps rejecting", async () => {
    const sessionId = await loginAndGetSessionId();
    backend.getMeImpl = () => ({ kind: "unauthorized" });
    backend.refreshImpl = () => ({
      kind: "success",
      credentials: fakeCredentials({ accessToken: "access-token-2" }),
    });

    const result = await coordinator.getMe(sessionId);

    expect(result).toEqual({ kind: "reauthentication_required" });
    expect(backend.refreshCallCount).toBe(1);
    expect(backend.getMeCallCount).toBe(2);
  });

  it("does not perform a second refresh when /me still rejects a token already refreshed for this call", async () => {
    // The session starts out locally expired, so getMe refreshes once *before* ever
    // calling /me. If /me still says unauthorized after that, a second refresh must
    // not be attempted - refreshing again cannot change what Backend V2 just said.
    const sessionId = await loginAndGetSessionId(
      fakeCredentials({ expiresAt: new Date(Date.now() - 1000).toISOString() }),
    );
    backend.refreshImpl = () => ({
      kind: "success",
      credentials: fakeCredentials({ accessToken: "access-token-2" }),
    });
    backend.getMeImpl = () => ({ kind: "unauthorized" });

    const result = await coordinator.getMe(sessionId);

    expect(result).toEqual({ kind: "reauthentication_required" });
    expect(backend.refreshCallCount).toBe(1);
    expect(backend.getMeCallCount).toBe(1);
  });

  it("preserves the session when /me is transiently unavailable (not an auth failure)", async () => {
    const sessionId = await loginAndGetSessionId();
    backend.getMeImpl = () => ({ kind: "unavailable" });

    const result = await coordinator.getMe(sessionId);

    expect(result).toEqual({ kind: "unavailable" });
    expect(backend.refreshCallCount).toBe(0);

    // The session must still be usable afterwards - not silently destroyed.
    backend.getMeImpl = () => ({ kind: "success", account: fakeAccount() });
    const retry = await coordinator.getMe(sessionId);
    expect(retry).toEqual({ kind: "success", account: fakeAccount() });
  });

  it("moves to reauthentication_required when the backend reports the refresh token invalid", async () => {
    const sessionId = await loginAndGetSessionId(
      fakeCredentials({ expiresAt: new Date(Date.now() - 1000).toISOString() }),
    );
    backend.refreshImpl = () => ({ kind: "invalid" });

    const result = await coordinator.getAccessToken(sessionId);
    expect(result).toEqual({ kind: "reauthentication_required" });

    // A second call must not attempt another backend refresh - the session is dead.
    const second = await coordinator.getAccessToken(sessionId);
    expect(second).toEqual({ kind: "reauthentication_required" });
    expect(backend.refreshCallCount).toBe(1);
  });

  it("preserves the refresh credential and reports throttled on 429, without touching state", async () => {
    const sessionId = await loginAndGetSessionId(
      fakeCredentials({ expiresAt: new Date(Date.now() - 1000).toISOString() }),
    );
    backend.refreshImpl = () => ({ kind: "rate_limited" });

    const result = await coordinator.getAccessToken(sessionId);
    expect(result).toEqual({ kind: "throttled" });
    expect(backend.refreshCallCount).toBe(1);

    // The refresh token was never rotated, so a later attempt can still try again.
    backend.refreshImpl = () => ({
      kind: "success",
      credentials: fakeCredentials({ accessToken: "access-token-2" }),
    });
    const retry = await coordinator.getAccessToken(sessionId);
    expect(retry).toEqual({ kind: "ready", accessToken: "access-token-2" });
    expect(backend.refreshCallCount).toBe(2);
  });

  it("moves to reauthentication_required on an ambiguous/unknown refresh outcome and never retries the old token", async () => {
    const sessionId = await loginAndGetSessionId(
      fakeCredentials({ expiresAt: new Date(Date.now() - 1000).toISOString() }),
    );
    backend.refreshImpl = () => ({ kind: "unknown_failure" });

    const result = await coordinator.getAccessToken(sessionId);
    expect(result).toEqual({ kind: "reauthentication_required" });
    expect(backend.refreshCallCount).toBe(1);
  });

  it("treats an expired refresh lease as claim abandonment, without retrying the old refresh token", async () => {
    const now = Date.now();
    coordinator = new WebSessionCoordinator(store, backend, {
      now: () => now,
      waitDelayMs: 5,
      maxWaitRetries: 5,
    });
    await store.create(
      seedSession({
        refreshState: "Refreshing",
        revision: 5,
        refreshLeaseExpiresAt: now - 1,
        accessTokenExpiresAt: now - 1,
      }),
    );

    const result = await coordinator.getAccessToken(SEEDED_SESSION_ID);

    expect(result).toEqual({ kind: "reauthentication_required" });
    expect(backend.refreshCallCount).toBe(0);
  });

  it("waits for another caller's in-flight refresh instead of racing it", async () => {
    const now = Date.now();
    coordinator = new WebSessionCoordinator(store, backend, {
      now: () => now,
      waitDelayMs: 5,
      maxWaitRetries: 5,
    });
    await store.create(
      seedSession({
        refreshState: "Refreshing",
        revision: 5,
        refreshLeaseExpiresAt: now + 60_000,
        accessTokenExpiresAt: now - 1,
      }),
    );

    // Resolve the in-flight refresh shortly after the waiter starts polling.
    setTimeout(() => {
      void store.compareAndSwap(
        SEEDED_SESSION_ID_HASH,
        5,
        seedSession({
          revision: 6,
          refreshState: "Ready",
          accessToken: "winner-access-token",
          refreshLeaseExpiresAt: null,
          accessTokenExpiresAt: now + 900_000,
        }),
      );
    }, 10);

    const result = await coordinator.getAccessToken(SEEDED_SESSION_ID);

    expect(result).toEqual({
      kind: "ready",
      accessToken: "winner-access-token",
    });
    expect(backend.refreshCallCount).toBe(0);
  });

  it("does not report reauthentication_required while another caller's slower-than-instant refresh is still validly in flight", async () => {
    // waitDelayMs/refreshLeaseMs are small only to keep the test fast; maxWaitRetries
    // is left to its default so it derives from refreshLeaseMs/waitDelayMs, exactly as
    // it would in production - a waiter must poll for as long as the lease is valid,
    // not give up after a small fixed number of attempts.
    const coordinatorA = new WebSessionCoordinator(store, backend, {
      waitDelayMs: 10,
      refreshLeaseMs: 2000,
    });
    const coordinatorB = new WebSessionCoordinator(store, backend, {
      waitDelayMs: 10,
      refreshLeaseMs: 2000,
    });
    const sessionId = await loginAndGetSessionId(
      fakeCredentials({ expiresAt: new Date(Date.now() - 1000).toISOString() }),
      coordinatorA,
    );

    // Slower than the old fixed ~5-attempt/50ms wait budget, but well inside the lease.
    backend.refreshImpl = async () => {
      await new Promise((resolve) => setTimeout(resolve, 300));
      return {
        kind: "success",
        credentials: fakeCredentials({
          accessToken: "slow-winner-access-token",
        }),
      };
    };

    const [resultA, resultB] = await Promise.all([
      coordinatorA.getAccessToken(sessionId),
      coordinatorB.getAccessToken(sessionId),
    ]);

    expect(resultA).toEqual({
      kind: "ready",
      accessToken: "slow-winner-access-token",
    });
    expect(resultB).toEqual({
      kind: "ready",
      accessToken: "slow-winner-access-token",
    });
    expect(backend.refreshCallCount).toBe(1);
  });

  it("returns not_found for a session that does not exist", async () => {
    const result = await coordinator.getAccessToken("nonexistent-session-id");
    expect(result).toEqual({ kind: "not_found" });
  });

  it("logout always deletes the local session even when Backend V2 logout fails", async () => {
    const sessionId = await loginAndGetSessionId();
    backend.logoutImpl = () => false;

    await coordinator.logout(sessionId);

    const result = await coordinator.getAccessToken(sessionId);
    expect(result).toEqual({ kind: "not_found" });
    expect(backend.logoutCallCount).toBe(1);
  });
});
