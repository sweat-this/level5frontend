import "server-only";
import type { WebSession } from "./web-session";

/**
 * Minimal session-persistence contract. compareAndSwap is the only coordination
 * primitive the refresh algorithm relies on - see web-session-coordinator.ts - so any
 * implementation that offers atomic optimistic-concurrency semantics on this shape can
 * replace MemoryWebSessionStore without touching the coordinator.
 *
 * Outcome contract (issue #5, once a real networked implementation - RedisWebSessionStore -
 * exists alongside MemoryWebSessionStore): every method below returns only for a *definite*
 * outcome (found/not-found, CAS won/lost). Any implementation MUST throw
 * `SessionStoreUnavailableError` (session-store-errors.ts) rather than return `false`/`null` when
 * the outcome is genuinely unknown - a connection error, a command timeout, or any other
 * infrastructure failure. A store must never let an ambiguous failure look like a definite miss;
 * WebSessionCoordinator relies on that distinction to decide whether it's safe to call Backend V2
 * refresh or hand back a newly rotated credential. MemoryWebSessionStore never throws it (its
 * "store" can't fail independently of the process it runs in).
 */
export interface WebSessionStore {
  create(session: WebSession): Promise<void>;
  find(sessionIdHash: string): Promise<WebSession | null>;
  compareAndSwap(
    sessionIdHash: string,
    expectedRevision: number,
    replacement: WebSession,
  ): Promise<boolean>;
  delete(sessionIdHash: string): Promise<void>;
}
