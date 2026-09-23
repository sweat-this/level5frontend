import { describe, expect, it } from "vitest";
import {
  fakeCredentials,
  FakeBackendAuthClient,
} from "./test-support/fake-backend-auth-client";
import { FakeWebSessionStore } from "./test-support/fake-web-session-store";
import { WebSessionCoordinator } from "./web-session-coordinator";

async function loginWithExpiredCredentials(
  coordinator: WebSessionCoordinator,
  backend: FakeBackendAuthClient,
): Promise<string> {
  backend.loginImpl = () => ({
    kind: "success",
    credentials: fakeCredentials({
      expiresAt: new Date(Date.now() - 1000).toISOString(),
    }),
  });
  const result = await coordinator.login("user", "pass");
  if (result.kind !== "success") {
    throw new Error(`expected login success, got ${result.kind}`);
  }
  return result.sessionId;
}

describe("WebSessionCoordinator against an ambiguous/unavailable store", () => {
  describe("refresh claim", () => {
    it("returns unavailable and never calls Backend V2 refresh when the claim CAS is ambiguous", async () => {
      const store = new FakeWebSessionStore();
      const backend = new FakeBackendAuthClient();
      const coordinator = new WebSessionCoordinator(store, backend);

      const sessionId = await loginWithExpiredCredentials(coordinator, backend);

      // The claim CAS is the *next* compareAndSwap call after login (which doesn't call CAS).
      store.compareAndSwapFaultMode = () => "unavailable";

      const result = await coordinator.getAccessToken(sessionId);

      expect(result).toEqual({ kind: "unavailable" });
      expect(backend.refreshCallCount).toBe(0);
    });
  });

  describe("refresh finalization", () => {
    it("still reports ready when the finalize CAS response is lost but the write actually landed", async () => {
      const store = new FakeWebSessionStore();
      const backend = new FakeBackendAuthClient();
      backend.refreshImpl = () => ({
        kind: "success",
        credentials: fakeCredentials({ accessToken: "rotated-access-token" }),
      });
      const coordinator = new WebSessionCoordinator(store, backend);

      const sessionId = await loginWithExpiredCredentials(coordinator, backend);

      // First CAS = claim (must succeed normally); second CAS = finalize (response lost, but
      // applied server-side).
      store.compareAndSwapFaultMode = () =>
        store.compareAndSwapCallCount === 1
          ? "none"
          : "response_lost_after_apply";

      const result = await coordinator.getAccessToken(sessionId);

      expect(result).toEqual({
        kind: "ready",
        accessToken: "rotated-access-token",
      });
      expect(backend.refreshCallCount).toBe(1);
    });

    it("never reports a rotated credential as ready when finalization cannot be confirmed", async () => {
      const store = new FakeWebSessionStore();
      const backend = new FakeBackendAuthClient();
      backend.refreshImpl = () => ({
        kind: "success",
        credentials: fakeCredentials({ accessToken: "should-never-surface" }),
      });
      const coordinator = new WebSessionCoordinator(store, backend);

      const sessionId = await loginWithExpiredCredentials(coordinator, backend);

      // Finalize CAS (2nd call) is ambiguous and NOT applied; the confirmation reload (2nd find
      // call) also fails - so there is no way to confirm the rotated credential landed.
      store.compareAndSwapFaultMode = () =>
        store.compareAndSwapCallCount === 1 ? "none" : "unavailable";
      store.findFault = () => store.findCallCount >= 2;

      const result = await coordinator.getAccessToken(sessionId);

      expect(result).toEqual({ kind: "unavailable" });
      expect(backend.refreshCallCount).toBe(1);
    });
  });

  describe("429 rollback", () => {
    it("reports throttled when the rollback CAS response is lost but the write actually landed", async () => {
      const store = new FakeWebSessionStore();
      const backend = new FakeBackendAuthClient();
      backend.refreshImpl = () => ({ kind: "rate_limited" });
      const coordinator = new WebSessionCoordinator(store, backend);

      const sessionId = await loginWithExpiredCredentials(coordinator, backend);

      store.compareAndSwapFaultMode = () =>
        store.compareAndSwapCallCount === 1
          ? "none"
          : "response_lost_after_apply";

      const result = await coordinator.getAccessToken(sessionId);

      expect(result).toEqual({ kind: "throttled" });
    });

    it("never reports throttled when the rollback cannot be confirmed", async () => {
      const store = new FakeWebSessionStore();
      const backend = new FakeBackendAuthClient();
      backend.refreshImpl = () => ({ kind: "rate_limited" });
      const coordinator = new WebSessionCoordinator(store, backend);

      const sessionId = await loginWithExpiredCredentials(coordinator, backend);

      store.compareAndSwapFaultMode = () =>
        store.compareAndSwapCallCount === 1 ? "none" : "unavailable";
      store.findFault = () => store.findCallCount >= 2;

      const result = await coordinator.getAccessToken(sessionId);

      expect(result).toEqual({ kind: "unavailable" });
    });
  });

  describe("plain reads", () => {
    it("getAccessToken reports unavailable, not not_found, when the store can't be reached", async () => {
      const store = new FakeWebSessionStore();
      const backend = new FakeBackendAuthClient();
      const coordinator = new WebSessionCoordinator(store, backend);

      store.findFault = () => true;

      const result = await coordinator.getAccessToken("some-session-id");
      expect(result).toEqual({ kind: "unavailable" });
    });

    it("getMe reports unavailable, not reauthentication_required, when the store can't be reached", async () => {
      const store = new FakeWebSessionStore();
      const backend = new FakeBackendAuthClient();
      const coordinator = new WebSessionCoordinator(store, backend);

      store.findFault = () => true;

      const result = await coordinator.getMe("some-session-id");
      expect(result).toEqual({ kind: "unavailable" });
    });
  });

  describe("logout", () => {
    it("never throws when the store can't be reached to look up the session", async () => {
      const store = new FakeWebSessionStore();
      const backend = new FakeBackendAuthClient();
      const coordinator = new WebSessionCoordinator(store, backend);
      store.findFault = () => true;

      await expect(
        coordinator.logout("some-session-id"),
      ).resolves.toBeUndefined();
      expect(backend.logoutCallCount).toBe(0);
    });

    it("never throws when the store can't be reached to delete the session, after a successful Backend revoke", async () => {
      const store = new FakeWebSessionStore();
      const backend = new FakeBackendAuthClient();
      const coordinator = new WebSessionCoordinator(store, backend);

      const sessionId = await loginWithExpiredCredentials(coordinator, backend);
      store.deleteFault = () => true;

      await expect(coordinator.logout(sessionId)).resolves.toBeUndefined();
      expect(backend.logoutCallCount).toBe(1);
    });

    it("still deletes the local session even when Backend V2 revocation fails", async () => {
      const store = new FakeWebSessionStore();
      const backend = new FakeBackendAuthClient();
      backend.logoutImpl = () => false;
      const coordinator = new WebSessionCoordinator(store, backend);

      const sessionId = await loginWithExpiredCredentials(coordinator, backend);
      await coordinator.logout(sessionId);

      expect(await coordinator.getAccessToken(sessionId)).toEqual({
        kind: "not_found",
      });
    });
  });
});
