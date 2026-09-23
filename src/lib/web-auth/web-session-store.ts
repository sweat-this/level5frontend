import "server-only";
import type { WebSession } from "./web-session";

/**
 * Minimal session-persistence contract. compareAndSwap is the only coordination
 * primitive the refresh algorithm relies on - see web-session-coordinator.ts - so any
 * implementation that offers atomic optimistic-concurrency semantics on this shape can
 * replace MemoryWebSessionStore without touching the coordinator (issue #5).
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
