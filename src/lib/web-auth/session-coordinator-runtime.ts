import "server-only";
import { BackendAuthClient } from "./backend-auth-client";
import { getAccountRuntimeConfig } from "./config";
import { recordSessionEvent } from "./session-observability";
import { getWebSessionStore } from "./session-store-runtime";
import { SessionStoreUnavailableError } from "./session-store-errors";
import { WebSessionCoordinator } from "./web-session-coordinator";

// The single production-neutral composition point for web-session authentication (issue #6):
// getAccountRuntimeConfig() + getWebSessionStore() + BackendAuthClient + WebSessionCoordinator.
// Both real account code (src/lib/account/**, src/app/(auth)/**, src/app/(account)/**) and the
// temporary /api/auth-cert/* certification routes (via certification-runtime.ts) share this one
// entry point - there is no separate/parallel authentication stack.
let coordinatorPromise: Promise<WebSessionCoordinator> | null = null;

/**
 * A failed first construction (e.g. Redis unreachable at cold start) must not permanently poison
 * this process - the next caller needs to retry, not inherit a cached rejected Promise forever
 * (issue #6 remediation: coordinator recovery). Concurrent cold-start callers still share exactly
 * one in-flight attempt, since `coordinatorPromise` is assigned before anything is awaited here;
 * only a *failed* attempt is cleared, and only by the attempt that actually owns the slot - so a
 * slower, now-stale failure can never clobber a newer attempt that already succeeded.
 */
export function getWebSessionCoordinator(): Promise<WebSessionCoordinator> {
  if (!coordinatorPromise) {
    // Validated eagerly, before composition, so misconfiguration fails clearly right here
    // rather than surfacing later as an opaque transport/origin failure.
    getAccountRuntimeConfig();
    const attempt = getWebSessionStore().then(
      (store) => new WebSessionCoordinator(store, new BackendAuthClient()),
    );
    coordinatorPromise = attempt;
    attempt.catch(() => {
      if (coordinatorPromise === attempt) {
        coordinatorPromise = null;
      }
    });
  }
  return coordinatorPromise;
}

/**
 * Same as getWebSessionCoordinator(), but for callers that must degrade to a safe `null`
 * ("unavailable") instead of letting a cold-start/outage construction failure (e.g. Redis
 * unreachable) propagate as an uncaught rejection - see issue #6 review: resolveCurrentAccountSession()
 * and the login/register actions must reach their own purpose-built "unavailable" state, not a
 * generic error boundary. Only ever swallows SessionStoreUnavailableError, the one error class
 * WebSessionStore construction is allowed to throw for an unknown-outcome failure (see
 * session-store-errors.ts) - a misconfiguration error (missing env var) still propagates and
 * fails loudly, since that is a deployment problem, not a transient infrastructure outage.
 */
export async function tryGetWebSessionCoordinator(): Promise<WebSessionCoordinator | null> {
  try {
    return await getWebSessionCoordinator();
  } catch (err) {
    if (!(err instanceof SessionStoreUnavailableError)) {
      throw err;
    }
    recordSessionEvent("session_store_unavailable", {
      operation: "coordinator_construct",
    });
    return null;
  }
}

/** Test-only: forces a fresh coordinator for the next call. */
export function resetWebSessionCoordinatorForTests(): void {
  coordinatorPromise = null;
}
