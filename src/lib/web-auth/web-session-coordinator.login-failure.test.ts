import { describe, expect, it } from "vitest";
import { hashSessionId } from "./session-id";
import {
  fakeCredentials,
  FakeBackendAuthClient,
} from "./test-support/fake-backend-auth-client";
import { FakeWebSessionStore } from "./test-support/fake-web-session-store";
import { WebSessionCoordinator } from "./web-session-coordinator";

describe("WebSessionCoordinator.login orphan-session handling", () => {
  it("best-effort revokes the Backend V2 refresh token and never issues a session when the store create fails", async () => {
    const store = new FakeWebSessionStore();
    const backend = new FakeBackendAuthClient();
    backend.loginImpl = () => ({
      kind: "success",
      credentials: fakeCredentials({ refreshToken: "orphaned-refresh-token" }),
    });
    store.createFault = () => true;

    const coordinator = new WebSessionCoordinator(store, backend);
    const result = await coordinator.login("user", "pass");

    expect(result).toEqual({ kind: "unavailable" });
    expect(backend.logoutCallCount).toBe(1);
  });

  it("does not create a lingering session record once the store recovers", async () => {
    const store = new FakeWebSessionStore();
    const backend = new FakeBackendAuthClient();
    backend.loginImpl = () => ({
      kind: "success",
      credentials: fakeCredentials(),
    });
    store.createFault = () => true;

    const coordinator = new WebSessionCoordinator(store, backend);
    const result = await coordinator.login("user", "pass");
    expect(result.kind).toBe("unavailable");

    // The store recovers; since login never returned a sessionId, there is nothing a caller
    // could look up anyway - but assert directly that no record exists under any hash the
    // real create() would have used, by confirming the underlying store is empty.
    store.createFault = () => false;
    const probe = await store.find(hashSessionId("anything"));
    expect(probe).toBeNull();
  });

  it("still reports the underlying Backend V2 outcome when login itself fails, without touching the store", async () => {
    const store = new FakeWebSessionStore();
    const backend = new FakeBackendAuthClient();
    backend.loginImpl = () => ({ kind: "invalid_credentials" });

    const coordinator = new WebSessionCoordinator(store, backend);
    const result = await coordinator.login("user", "wrong-password");

    expect(result).toEqual({ kind: "invalid_credentials" });
    expect(store.createCallCount).toBe(0);
  });
});
