import "server-only";
import { BackendAuthClient } from "./backend-auth-client";
import { MemoryWebSessionStore } from "./memory-web-session-store";
import { WebSessionCoordinator } from "./web-session-coordinator";

// Process-local singleton backing the temporary /api/auth-cert/* certification routes
// (src/app/api/auth-cert/**). MemoryWebSessionStore is development/test only - see
// memory-web-session-store.ts - and these routes are gated off in production
// regardless of configuration (see config.ts). Nothing here is production session
// infrastructure; issue #5 replaces the store and issue #10 owns the production
// ingress this singleton doesn't model.
let coordinator: WebSessionCoordinator | null = null;

export function getCertificationCoordinator(): WebSessionCoordinator {
  if (!coordinator) {
    coordinator = new WebSessionCoordinator(
      new MemoryWebSessionStore(),
      new BackendAuthClient(),
    );
  }
  return coordinator;
}

/** Test-only: forces a fresh in-memory store/coordinator for the next call. */
export function resetCertificationCoordinatorForTests(): void {
  coordinator = null;
}
