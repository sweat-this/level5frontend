import "server-only";
import { BackendAuthClient } from "./backend-auth-client";
import { getWebSessionStore } from "./session-store-runtime";
import { WebSessionCoordinator } from "./web-session-coordinator";

// Process-local singleton backing the temporary /api/auth-cert/* certification routes
// (src/app/api/auth-cert/**). The store is whatever LEVEL5_WEB_SESSION_STORE selects
// (session-store-runtime.ts) - MemoryWebSessionStore in ordinary dev/test, or
// RedisWebSessionStore when a developer explicitly opts into it locally for certification.
// These routes are gated off in production regardless of configuration (see config.ts).
let coordinatorPromise: Promise<WebSessionCoordinator> | null = null;

export function getCertificationCoordinator(): Promise<WebSessionCoordinator> {
  if (!coordinatorPromise) {
    coordinatorPromise = getWebSessionStore().then(
      (store) => new WebSessionCoordinator(store, new BackendAuthClient()),
    );
  }
  return coordinatorPromise;
}

/** Test-only: forces a fresh coordinator (and, via session-store-runtime, store) for the next call. */
export function resetCertificationCoordinatorForTests(): void {
  coordinatorPromise = null;
}
