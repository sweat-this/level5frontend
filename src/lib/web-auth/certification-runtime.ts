import "server-only";
import {
  getWebSessionCoordinator,
  resetWebSessionCoordinatorForTests,
} from "./session-coordinator-runtime";
import { hashSessionId } from "./session-id";
import { getWebSessionStore } from "./session-store-runtime";
import type { WebSessionCoordinator } from "./web-session-coordinator";

// Backs the temporary /api/auth-cert/* certification routes (src/app/api/auth-cert/**), which
// remain gated off in production regardless of configuration (see config.ts). Delegates to the
// same production-neutral runtime entry point (issue #6) real account code uses, rather than
// composing a second, parallel authentication stack - see session-coordinator-runtime.ts.
export function getCertificationCoordinator(): Promise<WebSessionCoordinator> {
  return getWebSessionCoordinator();
}

/**
 * The one deliberate exception to every other certification route's "never returns Backend V2
 * access/refresh tokens" rule (see me/route.ts) - this exists specifically so
 * e2e/security-no-credential-leak.spec.ts can assert against the literal token value the browser
 * must never see, rather than guessing at what shape a leaked credential might take. Reading the
 * store directly (not through the coordinator) rather than adding a token-returning method to
 * WebSessionCoordinator itself, so that class's own public surface never grows a way to hand back
 * raw credentials outside this narrow, production-hard-gated certification path.
 */
export async function getSessionSecretsForCertification(
  sessionId: string,
): Promise<{ accessToken: string; refreshToken: string } | null> {
  const store = await getWebSessionStore();
  const session = await store.find(hashSessionId(sessionId));
  return session
    ? { accessToken: session.accessToken, refreshToken: session.refreshToken }
    : null;
}

/** Test-only: forces a fresh coordinator (and, via session-store-runtime, store) for the next call. */
export function resetCertificationCoordinatorForTests(): void {
  resetWebSessionCoordinatorForTests();
}
