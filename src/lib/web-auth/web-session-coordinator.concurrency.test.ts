import { describe, expect, it } from "vitest";
import { MemoryWebSessionStore } from "./memory-web-session-store";
import {
  fakeCredentials,
  FakeBackendAuthClient,
} from "./test-support/fake-backend-auth-client";
import { WebSessionCoordinator } from "./web-session-coordinator";

// Proves the CAS-based refresh algorithm, not any coordinator-local lock: two
// independent WebSessionCoordinator instances share one MemoryWebSessionStore, exactly
// as two horizontally-scaled Next.js instances would share a real distributed store in
// production (issue #5). If this passes without any process-local mutex, the algorithm
// is sound for horizontal scaling.
describe("WebSessionCoordinator concurrency", () => {
  it("makes exactly one Backend V2 refresh call for many concurrent requests against one expired session", async () => {
    const store = new MemoryWebSessionStore();
    const backend = new FakeBackendAuthClient();
    backend.refreshImpl = () => ({
      kind: "success",
      credentials: fakeCredentials({
        accessToken: "winner-access-token",
        refreshToken: "winner-refresh-token",
      }),
    });

    const coordinatorA = new WebSessionCoordinator(store, backend, {
      waitDelayMs: 5,
      maxWaitRetries: 20,
    });
    const coordinatorB = new WebSessionCoordinator(store, backend, {
      waitDelayMs: 5,
      maxWaitRetries: 20,
    });

    backend.loginImpl = () => ({
      kind: "success",
      credentials: fakeCredentials({
        expiresAt: new Date(Date.now() - 1000).toISOString(),
      }),
    });
    const loginResult = await coordinatorA.login("user", "pass");
    if (loginResult.kind !== "success") {
      throw new Error(`expected login success, got ${loginResult.kind}`);
    }
    const { sessionId } = loginResult;

    const callers = Array.from({ length: 20 }, (_, index) =>
      (index % 2 === 0 ? coordinatorA : coordinatorB).getAccessToken(sessionId),
    );
    const results = await Promise.all(callers);

    expect(backend.refreshCallCount).toBe(1);
    for (const result of results) {
      expect(result).toEqual({
        kind: "ready",
        accessToken: "winner-access-token",
      });
    }
  });
});
