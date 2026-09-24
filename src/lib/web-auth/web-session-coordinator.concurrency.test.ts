import { describe, expect, it } from "vitest";
import { MemoryWebSessionStore } from "./memory-web-session-store";
import {
  fakeCredentials,
  FakeBackendAuthClient,
} from "./test-support/fake-backend-auth-client";
import { FakeWebSessionStore } from "./test-support/fake-web-session-store";
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

  // Issue #10: multiple browser tabs sharing one session cookie hit the same server process
  // concurrently, but not always with the *same* operation - one tab's account page calls
  // getMe() while another's calls getAccessToken() for a players/friends action. Distinct from
  // the test above (which fans out N copies of the identical call): this fans out two different
  // methods over one coordinator, still against one expired session, still exactly one refresh.
  it("multi-tab equivalent: mixed getAccessToken/getMe calls against one expired session still cause exactly one refresh", async () => {
    const store = new MemoryWebSessionStore();
    const backend = new FakeBackendAuthClient();
    backend.refreshImpl = () => ({
      kind: "success",
      credentials: fakeCredentials({
        accessToken: "winner-access-token",
        refreshToken: "winner-refresh-token",
      }),
    });
    backend.getMeImpl = () => ({
      kind: "success",
      account: {
        accountId: "11111111-1111-1111-1111-111111111111",
        username: "user",
        status: "Active",
        playerId: "22222222-2222-2222-2222-222222222222",
        createdAt: new Date().toISOString(),
      },
    });
    backend.loginImpl = () => ({
      kind: "success",
      credentials: fakeCredentials({
        expiresAt: new Date(Date.now() - 1000).toISOString(),
      }),
    });

    const coordinator = new WebSessionCoordinator(store, backend, {
      waitDelayMs: 5,
      maxWaitRetries: 20,
    });
    const loginResult = await coordinator.login("user", "pass");
    if (loginResult.kind !== "success") {
      throw new Error(`expected login success, got ${loginResult.kind}`);
    }
    const { sessionId } = loginResult;

    const tabs = [
      coordinator.getAccessToken(sessionId),
      coordinator.getMe(sessionId),
      coordinator.getAccessToken(sessionId),
      coordinator.getMe(sessionId),
    ];
    const results = await Promise.all(tabs);

    expect(backend.refreshCallCount).toBe(1);
    expect(results[0]).toEqual({
      kind: "ready",
      accessToken: "winner-access-token",
    });
    expect(results[1]).toMatchObject({ kind: "success" });
    expect(results[2]).toEqual({
      kind: "ready",
      accessToken: "winner-access-token",
    });
    expect(results[3]).toMatchObject({ kind: "success" });
  });

  // Issue #10's expected logout-race semantics: an already-issued/in-flight access-token request
  // may finish; the shared web session is removed; a subsequent request cannot acquire a new
  // token; no session corruption.
  it("logout while another getAccessToken() is still in flight: the in-flight call may still finish, the session is gone afterward", async () => {
    const store = new FakeWebSessionStore();
    const backend = new FakeBackendAuthClient();
    backend.loginImpl = () => ({
      kind: "success",
      // Not expired - getAccessToken's fast path, no refresh involved, isolates this test to
      // the logout/find race itself rather than also exercising the refresh algorithm.
      credentials: fakeCredentials({
        expiresAt: new Date(Date.now() + 900_000).toISOString(),
      }),
    });

    const coordinator = new WebSessionCoordinator(store, backend);
    const loginResult = await coordinator.login("user", "pass");
    if (loginResult.kind !== "success") {
      throw new Error(`expected login success, got ${loginResult.kind}`);
    }
    const { sessionId } = loginResult;

    let releaseInFlightFind: (() => void) | undefined;
    let findCalls = 0;
    store.findGate = () => {
      findCalls += 1;
      // Only the first find() (the in-flight getAccessToken's own read, already issued before
      // logout runs) pauses - logout's own find()/delete() must proceed normally, exactly as it
      // would if the in-flight request had already read its data off the wire.
      if (findCalls === 1) {
        return new Promise<void>((resolve) => {
          releaseInFlightFind = resolve;
        });
      }
      return Promise.resolve();
    };

    const inFlight = coordinator.getAccessToken(sessionId);
    // Give getAccessToken's find() a turn to run and engage the gate before logout starts.
    await Promise.resolve();
    await Promise.resolve();

    await coordinator.logout(sessionId);
    expect(releaseInFlightFind).toBeDefined();
    releaseInFlightFind!();

    const inFlightResult = await inFlight;
    expect(inFlightResult.kind).toBe("ready");

    // No session corruption: a fresh request against the now-deleted session cannot acquire a
    // new token.
    const afterLogout = await coordinator.getAccessToken(sessionId);
    expect(afterLogout).toEqual({ kind: "not_found" });
  });
});
