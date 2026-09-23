import "server-only";
import {
  getWebSessionCoordinator,
  resetWebSessionCoordinatorForTests,
} from "./session-coordinator-runtime";
import type { WebSessionCoordinator } from "./web-session-coordinator";

// Backs the temporary /api/auth-cert/* certification routes (src/app/api/auth-cert/**), which
// remain gated off in production regardless of configuration (see config.ts). Delegates to the
// same production-neutral runtime entry point (issue #6) real account code uses, rather than
// composing a second, parallel authentication stack - see session-coordinator-runtime.ts.
export function getCertificationCoordinator(): Promise<WebSessionCoordinator> {
  return getWebSessionCoordinator();
}

/** Test-only: forces a fresh coordinator (and, via session-store-runtime, store) for the next call. */
export function resetCertificationCoordinatorForTests(): void {
  resetWebSessionCoordinatorForTests();
}
