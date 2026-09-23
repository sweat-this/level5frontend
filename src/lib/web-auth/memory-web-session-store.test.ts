import { describe, expect, it } from "vitest";
import { MemoryWebSessionStore } from "./memory-web-session-store";
import type { WebSession } from "./web-session";

function makeSession(overrides: Partial<WebSession> = {}): WebSession {
  return {
    sessionIdHash: "hash-1",
    accessToken: "access-1",
    accessTokenExpiresAt: Date.now() + 60_000,
    refreshToken: "refresh-1",
    refreshTokenExpiresAt: Date.now() + 3_600_000,
    revision: 1,
    refreshState: "Ready",
    refreshLeaseExpiresAt: null,
    ...overrides,
  };
}

describe("MemoryWebSessionStore", () => {
  it("creates and finds a session by hash", async () => {
    const store = new MemoryWebSessionStore();
    const session = makeSession();
    await store.create(session);

    const found = await store.find(session.sessionIdHash);
    expect(found).toEqual(session);
  });

  it("returns null for a session that was never created", async () => {
    const store = new MemoryWebSessionStore();
    expect(await store.find("missing")).toBeNull();
  });

  it("returns copies, not live references, so callers cannot bypass CAS by mutation", async () => {
    const store = new MemoryWebSessionStore();
    const session = makeSession();
    await store.create(session);

    const found = await store.find(session.sessionIdHash);
    // @ts-expect-error -- intentionally trying to mutate a supposedly-readonly copy
    found.revision = 999;

    const foundAgain = await store.find(session.sessionIdHash);
    expect(foundAgain?.revision).toBe(1);
  });

  it("deletes a session", async () => {
    const store = new MemoryWebSessionStore();
    const session = makeSession();
    await store.create(session);
    await store.delete(session.sessionIdHash);

    expect(await store.find(session.sessionIdHash)).toBeNull();
  });

  describe("compareAndSwap", () => {
    it("succeeds when the expected revision matches and applies the replacement", async () => {
      const store = new MemoryWebSessionStore();
      const session = makeSession({ revision: 1 });
      await store.create(session);

      const replacement = makeSession({ revision: 2, accessToken: "access-2" });
      const won = await store.compareAndSwap(
        session.sessionIdHash,
        1,
        replacement,
      );

      expect(won).toBe(true);
      expect(await store.find(session.sessionIdHash)).toEqual(replacement);
    });

    it("fails when the expected revision is stale", async () => {
      const store = new MemoryWebSessionStore();
      const session = makeSession({ revision: 1 });
      await store.create(session);
      await store.compareAndSwap(
        session.sessionIdHash,
        1,
        makeSession({ revision: 2 }),
      );

      const staleAttempt = await store.compareAndSwap(
        session.sessionIdHash,
        1,
        makeSession({ revision: 3 }),
      );

      expect(staleAttempt).toBe(false);
      expect((await store.find(session.sessionIdHash))?.revision).toBe(2);
    });

    it("fails when the session does not exist", async () => {
      const store = new MemoryWebSessionStore();
      const won = await store.compareAndSwap(
        "missing",
        1,
        makeSession({ revision: 2 }),
      );
      expect(won).toBe(false);
    });
  });
});
