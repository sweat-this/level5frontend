import { describe, expect, it } from "vitest";
import type {
  AuthBackendPort,
  LoginOutcome,
  MeOutcome,
  RefreshOutcome,
  RegisterOutcome,
} from "./backend-auth-client";
import {
  fakeAccount,
  fakeCredentials,
} from "./test-support/fake-backend-auth-client";
import { MemoryWebSessionStore } from "./memory-web-session-store";
import { WebSessionCoordinator } from "./web-session-coordinator";

/**
 * Simulates Backend V2 successfully rotating the refresh token while the BFF never
 * receives the response (Problem 4: lost response after successful rotation). Unlike
 * a simple canned-outcome fake, this double actually mutates server-side state on the
 * first refresh call - the same "the backend did the work, we just don't know it"
 * scenario a real network partition produces - then reports it as classified transport
 * failure, exactly as the real BackendAuthClient does when fetch throws (it always
 * catches and returns { kind: "unknown_failure" } - see backend-auth-client.ts -
 * because AuthBackendPort implementations must never let the coordinator observe a
 * rejected promise).
 */
class LostResponseBackendAuthClient implements AuthBackendPort {
  refreshCallCount = 0;
  private rotatedServerSide = false;

  async register(): Promise<RegisterOutcome> {
    return { kind: "unknown_failure" };
  }

  async login(): Promise<LoginOutcome> {
    return {
      kind: "success",
      credentials: fakeCredentials({
        expiresAt: new Date(Date.now() - 1000).toISOString(),
      }),
    };
  }

  async refresh(): Promise<RefreshOutcome> {
    this.refreshCallCount += 1;
    if (!this.rotatedServerSide) {
      this.rotatedServerSide = true;
      return { kind: "unknown_failure" };
    }
    // If the coordinator ever retried using the old (now-rotated) refresh token, this
    // branch proves it by returning a distinguishable success - it must never be hit.
    return {
      kind: "success",
      credentials: fakeCredentials({ accessToken: "should-never-be-used" }),
    };
  }

  async logout(): Promise<boolean> {
    return true;
  }

  async getMe(): Promise<MeOutcome> {
    return { kind: "success", account: fakeAccount() };
  }
}

describe("WebSessionCoordinator lost refresh response", () => {
  it("never retries the old refresh token and requires reauthentication instead", async () => {
    const store = new MemoryWebSessionStore();
    const backend = new LostResponseBackendAuthClient();
    const coordinator = new WebSessionCoordinator(store, backend);

    const loginResult = await coordinator.login("user", "pass");
    if (loginResult.kind !== "success") {
      throw new Error(`expected login success, got ${loginResult.kind}`);
    }

    // The seeded credentials are already expired, so this forces the refresh path.
    const first = await coordinator.getAccessToken(loginResult.sessionId);
    expect(first).toEqual({ kind: "reauthentication_required" });

    // A subsequent call must not retry the old refresh token either.
    const second = await coordinator.getAccessToken(loginResult.sessionId);
    expect(second).toEqual({ kind: "reauthentication_required" });

    expect(backend.refreshCallCount).toBe(1);
  });
});
