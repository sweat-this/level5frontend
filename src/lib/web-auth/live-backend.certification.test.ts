import { describe, expect, it } from "vitest";
import { BackendAuthClient } from "./backend-auth-client";
import { MemoryWebSessionStore } from "./memory-web-session-store";
import { hashSessionId } from "./session-id";
import { WebSessionCoordinator } from "./web-session-coordinator";

/**
 * Certifies the coordinator/adapter against a *real*, currently-running Backend V2 -
 * not the in-memory fakes the rest of this directory's tests use. Skipped unless
 * explicitly enabled, since it requires a live Backend V2 (see
 * v2/scripts/setup-local-dev.ps1) reachable at LEVEL5_LIVE_BACKEND_BASE_URL. Not part
 * of the default `npm test` run in CI.
 *
 * Run locally with:
 *   LEVEL5_LIVE_BACKEND_CERTIFICATION=true LEVEL5_LIVE_BACKEND_BASE_URL=https://localhost:7029 \
 *     NODE_TLS_REJECT_UNAUTHORIZED=0 npx vitest run src/lib/web-auth/live-backend.certification.test.ts
 * (NODE_TLS_REJECT_UNAUTHORIZED=0 is only needed locally, to accept the ASP.NET Core
 * dev-certs self-signed HTTPS certificate - never appropriate outside a throwaway local run.)
 */
const BACKEND_BASE_URL =
  process.env.LEVEL5_LIVE_BACKEND_BASE_URL ?? "https://localhost:7029";

class CountingBackendAuthClient extends BackendAuthClient {
  refreshCallCount = 0;

  override async refresh(...args: Parameters<BackendAuthClient["refresh"]>) {
    this.refreshCallCount += 1;
    return super.refresh(...args);
  }
}

async function forceAccessTokenExpiry(
  store: MemoryWebSessionStore,
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

describe.skipIf(!process.env.LEVEL5_LIVE_BACKEND_CERTIFICATION)(
  "Live Backend V2 certification",
  () => {
    it("certifies login, /me, one coordinated refresh (incl. under concurrency), and logout", async () => {
      const username = `authcert_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const password = "Str0ng!Passw0rd#Cert123";

      const registerResponse = await fetch(
        `${BACKEND_BASE_URL}/api/v2/auth/register`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            username,
            password,
            displayName: "Auth Cert",
          }),
        },
      );
      expect(registerResponse.status).toBe(200);

      const store = new MemoryWebSessionStore();
      const backend = new CountingBackendAuthClient(BACKEND_BASE_URL);
      const coordinator = new WebSessionCoordinator(store, backend);

      const loginResult = await coordinator.login(username, password);
      expect(loginResult.kind).toBe("success");
      if (loginResult.kind !== "success") {
        return;
      }
      const sessionIdHash = hashSessionId(loginResult.sessionId);

      const meBeforeRefresh = await coordinator.getMe(loginResult.sessionId);
      expect(meBeforeRefresh.kind).toBe("success");
      if (meBeforeRefresh.kind === "success") {
        expect(meBeforeRefresh.account.username).toBe(username);
      }
      expect(backend.refreshCallCount).toBe(0);

      // Force-expire only this test's in-memory session metadata - not Backend V2, and
      // not reachable via any browser-facing endpoint - to prove a real coordinated
      // refresh without waiting out the real 15-minute access-token lifetime.
      await forceAccessTokenExpiry(store, sessionIdHash);
      const meAfterForcedExpiry = await coordinator.getMe(
        loginResult.sessionId,
      );
      expect(meAfterForcedExpiry.kind).toBe("success");
      expect(backend.refreshCallCount).toBe(1);

      // Concurrency against the *real* backend: if the CAS algorithm let two concurrent
      // callers both call Backend V2 refresh, the loser would get a real
      // invalid_refresh_token 401 (one-time rotation), which would surface here as a
      // non-"ready" result. Asserting all callers succeed AND exactly one refresh call
      // happened is the strongest proof available that this isn't a fake-backend artifact.
      await forceAccessTokenExpiry(store, sessionIdHash);
      const refreshCallsBeforeConcurrency = backend.refreshCallCount;
      const coordinatorB = new WebSessionCoordinator(store, backend);
      const concurrentResults = await Promise.all([
        coordinator.getAccessToken(loginResult.sessionId),
        coordinatorB.getAccessToken(loginResult.sessionId),
        coordinator.getAccessToken(loginResult.sessionId),
      ]);
      expect(backend.refreshCallCount - refreshCallsBeforeConcurrency).toBe(1);
      for (const result of concurrentResults) {
        expect(result.kind).toBe("ready");
      }

      await coordinator.logout(loginResult.sessionId);
      const afterLogout = await coordinator.getAccessToken(
        loginResult.sessionId,
      );
      expect(afterLogout).toEqual({ kind: "not_found" });
    }, 30_000);
  },
);
