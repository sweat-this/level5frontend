import { describe, expect, it, vi } from "vitest";
import { hashSessionId } from "./session-id";
import {
  fakeCredentials,
  FakeBackendAuthClient,
} from "./test-support/fake-backend-auth-client";
import { FakeWebSessionStore } from "./test-support/fake-web-session-store";
import { WebSessionCoordinator } from "./web-session-coordinator";

describe("WebSessionCoordinator.register", () => {
  it("establishes a fresh web session through the same shared path login() uses, without a second login request", async () => {
    const store = new FakeWebSessionStore();
    const backend = new FakeBackendAuthClient();
    backend.registerImpl = () => ({
      kind: "success",
      credentials: fakeCredentials(),
    });

    const coordinator = new WebSessionCoordinator(store, backend);
    const result = await coordinator.register("user", "password123", "Display");

    expect(result.kind).toBe("success");
    if (result.kind !== "success") {
      return;
    }
    expect(result.sessionId).toEqual(expect.any(String));
    expect(result.absoluteExpiresAt).toEqual(expect.any(Number));
    expect(store.createCallCount).toBe(1);
    expect(backend.loginCallCount).toBe(0);
    expect(backend.registerCallCount).toBe(1);
  });

  it("best-effort revokes the Backend V2 refresh token and never issues a session when the store create fails (orphan-session guard)", async () => {
    const store = new FakeWebSessionStore();
    const backend = new FakeBackendAuthClient();
    backend.registerImpl = () => ({
      kind: "success",
      credentials: fakeCredentials({ refreshToken: "orphaned-refresh-token" }),
    });
    store.createFault = () => true;

    const coordinator = new WebSessionCoordinator(store, backend);
    const result = await coordinator.register("user", "password123", "Display");

    expect(result).toEqual({ kind: "unavailable" });
    expect(backend.logoutCallCount).toBe(1);
  });

  it("labels its diagnostic event register_create, never login_create, on an orphaned registration", async () => {
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    const store = new FakeWebSessionStore();
    const backend = new FakeBackendAuthClient();
    backend.registerImpl = () => ({
      kind: "success",
      credentials: fakeCredentials(),
    });
    store.createFault = () => true;

    const coordinator = new WebSessionCoordinator(store, backend);
    await coordinator.register("user", "password123", "Display");

    const events = infoSpy.mock.calls.map(
      ([line]) => JSON.parse(line as string) as Record<string, unknown>,
    );
    const storeUnavailableEvent = events.find(
      (event) => event.event === "session_store_unavailable",
    );
    expect(storeUnavailableEvent?.operation).toBe("register_create");

    infoSpy.mockRestore();
  });

  it("passes through validation_failed without touching the store", async () => {
    const store = new FakeWebSessionStore();
    const backend = new FakeBackendAuthClient();
    backend.registerImpl = () => ({
      kind: "validation_failed",
      message: "Password must be at least 8 characters.",
    });

    const coordinator = new WebSessionCoordinator(store, backend);
    const result = await coordinator.register("user", "short", "Display");

    expect(result).toEqual({
      kind: "validation_failed",
      message: "Password must be at least 8 characters.",
    });
    expect(store.createCallCount).toBe(0);
  });

  it("passes through conflict without touching the store", async () => {
    const store = new FakeWebSessionStore();
    const backend = new FakeBackendAuthClient();
    backend.registerImpl = () => ({
      kind: "conflict",
      message: "Username is already taken.",
    });

    const coordinator = new WebSessionCoordinator(store, backend);
    const result = await coordinator.register(
      "taken",
      "password123",
      "Display",
    );

    expect(result).toEqual({
      kind: "conflict",
      message: "Username is already taken.",
    });
    expect(store.createCallCount).toBe(0);
  });

  it("passes through rate_limited without touching the store", async () => {
    const store = new FakeWebSessionStore();
    const backend = new FakeBackendAuthClient();
    backend.registerImpl = () => ({ kind: "rate_limited" });

    const coordinator = new WebSessionCoordinator(store, backend);
    const result = await coordinator.register("user", "password123", "Display");

    expect(result).toEqual({ kind: "rate_limited" });
    expect(store.createCallCount).toBe(0);
  });

  it("does not create a lingering session record once the store recovers after an orphaned registration", async () => {
    const store = new FakeWebSessionStore();
    const backend = new FakeBackendAuthClient();
    backend.registerImpl = () => ({
      kind: "success",
      credentials: fakeCredentials(),
    });
    store.createFault = () => true;

    const coordinator = new WebSessionCoordinator(store, backend);
    const result = await coordinator.register("user", "password123", "Display");
    expect(result.kind).toBe("unavailable");

    store.createFault = () => false;
    const probe = await store.find(hashSessionId("anything"));
    expect(probe).toBeNull();
  });
});
