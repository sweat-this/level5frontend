import { MemoryWebSessionStore } from "../memory-web-session-store";
import { SessionStoreUnavailableError } from "../session-store-errors";
import type { WebSession } from "../web-session";
import type { WebSessionStore } from "../web-session-store";

export type CasFaultMode = "none" | "unavailable" | "response_lost_after_apply";

/**
 * Wraps a real MemoryWebSessionStore so definite outcomes (found/not-found, CAS won/lost) behave
 * exactly like a real store, while each method's outcome can be independently forced to an
 * infrastructure failure - for testing WebSessionCoordinator's hardening against an
 * ambiguous/unavailable store (issue #5) without needing a real Redis instance.
 *
 * compareAndSwap's "response_lost_after_apply" mode mirrors
 * web-session-coordinator.lost-response.test.ts's LostResponseBackendAuthClient: the mutation is
 * applied for real, but reported as a failure - the exact "the write landed, we just don't know
 * it" scenario casWithConfirmation's reload-and-verify step exists to handle safely.
 */
export class FakeWebSessionStore implements WebSessionStore {
  private readonly inner = new MemoryWebSessionStore();

  createCallCount = 0;
  findCallCount = 0;
  compareAndSwapCallCount = 0;
  deleteCallCount = 0;

  createFault: () => boolean = () => false;
  findFault: () => boolean = () => false;
  compareAndSwapFaultMode: () => CasFaultMode = () => "none";
  deleteFault: () => boolean = () => false;

  // Issue #10: lets a test deterministically interleave two concurrent coordinator calls (e.g.
  // "logout while a getAccessToken() is still awaiting find()") by pausing a method until the
  // test's own gate promise resolves - a controlled stand-in for real store latency, not a timer.
  findGate: (() => Promise<void>) | undefined;
  compareAndSwapGate: (() => Promise<void>) | undefined;

  async create(session: WebSession): Promise<void> {
    this.createCallCount += 1;
    if (this.createFault()) {
      throw new SessionStoreUnavailableError("fake: create unavailable");
    }
    return this.inner.create(session);
  }

  async find(sessionIdHash: string): Promise<WebSession | null> {
    this.findCallCount += 1;
    // Reads the snapshot *before* gating (not after) - a real in-flight request has already
    // received its data off the wire by the time a concurrent logout() could delete it, so
    // pausing here-and-returning-the-already-read-value is what models "already in flight,
    // finishing after logout's delete" (issue #10), not a read that itself observes the delete.
    const result = await this.inner.find(sessionIdHash);
    if (this.findGate) {
      await this.findGate();
    }
    if (this.findFault()) {
      throw new SessionStoreUnavailableError("fake: find unavailable");
    }
    return result;
  }

  async compareAndSwap(
    sessionIdHash: string,
    expectedRevision: number,
    replacement: WebSession,
  ): Promise<boolean> {
    this.compareAndSwapCallCount += 1;
    if (this.compareAndSwapGate) {
      await this.compareAndSwapGate();
    }
    const mode = this.compareAndSwapFaultMode();
    if (mode === "unavailable") {
      throw new SessionStoreUnavailableError(
        "fake: compareAndSwap unavailable",
      );
    }
    if (mode === "response_lost_after_apply") {
      await this.inner.compareAndSwap(
        sessionIdHash,
        expectedRevision,
        replacement,
      );
      throw new SessionStoreUnavailableError(
        "fake: compareAndSwap response lost",
      );
    }
    return this.inner.compareAndSwap(
      sessionIdHash,
      expectedRevision,
      replacement,
    );
  }

  async delete(sessionIdHash: string): Promise<void> {
    this.deleteCallCount += 1;
    if (this.deleteFault()) {
      throw new SessionStoreUnavailableError("fake: delete unavailable");
    }
    return this.inner.delete(sessionIdHash);
  }
}
