import "server-only";

/**
 * Thrown by WebSessionStore implementations when an operation's outcome is genuinely unknown -
 * a connection error, command timeout, or other infrastructure failure - as opposed to a
 * definite result (found/not-found, CAS won/lost). Callers (WebSessionCoordinator) must never
 * treat this the same as a definite `false`/`null`: a Redis timeout does not mean a CAS lost or
 * a session doesn't exist, it means the store couldn't answer (issue #5 audit: "never convert a
 * store timeout into false"). Deliberately a single narrow class, not a hierarchy - every
 * infrastructure failure collapses to the same "unknown, try again later" signal.
 */
export class SessionStoreUnavailableError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "SessionStoreUnavailableError";
  }
}
