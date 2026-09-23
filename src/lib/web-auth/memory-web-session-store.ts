import "server-only";
import type { WebSession } from "./web-session";
import type { WebSessionStore } from "./web-session-store";

/**
 * Development/test only. A process-local Map: does not survive restarts and is not
 * shared across horizontally scaled instances, so it must never back production
 * authentication (see src/lib/web-auth/config.ts, which forces certification routes
 * off in production regardless of configuration). Issue #5 owns the shared,
 * persistent, encrypted-at-rest replacement.
 */
export class MemoryWebSessionStore implements WebSessionStore {
  private readonly sessions = new Map<string, WebSession>();

  async create(session: WebSession): Promise<void> {
    this.sessions.set(session.sessionIdHash, { ...session });
  }

  async find(sessionIdHash: string): Promise<WebSession | null> {
    const session = this.sessions.get(sessionIdHash);
    return session ? { ...session } : null;
  }

  async compareAndSwap(
    sessionIdHash: string,
    expectedRevision: number,
    replacement: WebSession,
  ): Promise<boolean> {
    const current = this.sessions.get(sessionIdHash);
    if (!current || current.revision !== expectedRevision) {
      return false;
    }
    this.sessions.set(sessionIdHash, { ...replacement });
    return true;
  }

  async delete(sessionIdHash: string): Promise<void> {
    this.sessions.delete(sessionIdHash);
  }
}
