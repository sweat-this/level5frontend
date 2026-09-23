import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// vi.mock factories are hoisted above ordinary top-level consts, so the fns they close over must
// come from vi.hoisted() - a plain `const x = vi.fn()` above would be undefined when the factory
// below actually runs.
const { getAccountRuntimeConfigMock, getWebSessionStoreMock } = vi.hoisted(
  () => ({
    getAccountRuntimeConfigMock: vi.fn(),
    getWebSessionStoreMock: vi.fn(),
  }),
);

vi.mock("./config", () => ({
  getAccountRuntimeConfig: () => getAccountRuntimeConfigMock(),
}));
vi.mock("./session-store-runtime", () => ({
  getWebSessionStore: () => getWebSessionStoreMock(),
}));

const { SessionStoreUnavailableError } = await import("./session-store-errors");
const {
  getWebSessionCoordinator,
  tryGetWebSessionCoordinator,
  resetWebSessionCoordinatorForTests,
} = await import("./session-coordinator-runtime");

// Regression coverage for issue #6 remediation: getWebSessionCoordinator() previously memoized a
// *rejected* Promise forever, so one transient store outage permanently broke every subsequent
// account request in the process until restart. See session-coordinator-runtime.ts.
describe("session-coordinator-runtime", () => {
  beforeEach(() => {
    resetWebSessionCoordinatorForTests();
    getAccountRuntimeConfigMock.mockReset();
    getWebSessionStoreMock.mockReset();
    getAccountRuntimeConfigMock.mockReturnValue({
      backendBaseUrl: "https://backend.example",
      appOrigin: "https://app.example",
    });
  });

  afterEach(() => {
    resetWebSessionCoordinatorForTests();
  });

  it("recovers on the next attempt after a store-unavailable failure, without a process restart", async () => {
    const fakeStore = {} as never;

    getWebSessionStoreMock.mockRejectedValueOnce(
      new SessionStoreUnavailableError("store unreachable"),
    );
    const first = await tryGetWebSessionCoordinator();
    expect(first).toBeNull();

    getWebSessionStoreMock.mockResolvedValueOnce(fakeStore);
    const second = await tryGetWebSessionCoordinator();
    expect(second).not.toBeNull();

    expect(getWebSessionStoreMock).toHaveBeenCalledTimes(2);
  });

  it("getWebSessionCoordinator itself still rethrows the store-unavailable failure (only tryGet swallows it)", async () => {
    getWebSessionStoreMock.mockRejectedValueOnce(
      new SessionStoreUnavailableError("store unreachable"),
    );
    await expect(getWebSessionCoordinator()).rejects.toBeInstanceOf(
      SessionStoreUnavailableError,
    );
  });

  it("does not clear a newer successful attempt when an older failed attempt's cleanup runs late", async () => {
    const fakeStore = {} as never;

    let rejectFirst!: (err: unknown) => void;
    const firstAttempt = new Promise<never>((_, reject) => {
      rejectFirst = reject;
    });
    getWebSessionStoreMock.mockReturnValueOnce(firstAttempt);

    const firstCall = getWebSessionCoordinator().catch(() => "failed" as const);

    // A second, independent cold start (simulated via a forced reset, since only a test can
    // observe this window - see the fix's comment in session-coordinator-runtime.ts) succeeds
    // before the first attempt's own rejection is ever observed.
    resetWebSessionCoordinatorForTests();
    getWebSessionStoreMock.mockResolvedValueOnce(fakeStore);
    const secondCoordinator = await getWebSessionCoordinator();
    expect(secondCoordinator).toBeDefined();

    rejectFirst(new SessionStoreUnavailableError("late failure"));
    expect(await firstCall).toBe("failed");

    // The now-stale first attempt's failure handler must not have cleared the slot the second,
    // successful attempt owns.
    const stillCached = await getWebSessionCoordinator();
    expect(stillCached).toBe(secondCoordinator);
    expect(getWebSessionStoreMock).toHaveBeenCalledTimes(2);
  });

  it("shares one initialization attempt across concurrent cold-start callers", async () => {
    const fakeStore = {} as never;
    getWebSessionStoreMock.mockResolvedValueOnce(fakeStore);

    const [a, b] = await Promise.all([
      getWebSessionCoordinator(),
      getWebSessionCoordinator(),
    ]);

    expect(a).toBe(b);
    expect(getWebSessionStoreMock).toHaveBeenCalledTimes(1);
  });
});
