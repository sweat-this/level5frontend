import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const headersGetMock = vi.fn();
const resolveAuthenticatedBackendAccessMock = vi.fn();
const acceptMock = vi.fn();
const declineMock = vi.fn();
const cancelMock = vi.fn();

vi.mock("next/headers", () => ({
  headers: vi.fn(async () => ({ get: headersGetMock })),
}));

vi.mock("next/navigation", () => ({
  redirect: vi.fn((path: string) => {
    throw new Error(`REDIRECT:${path}`);
  }),
}));

vi.mock("@/lib/web-auth/config", () => ({
  getAccountRuntimeConfig: vi.fn(() => ({
    backendBaseUrl: "http://backend.test",
    appOrigin: "http://localhost:3000",
  })),
}));

vi.mock("@/lib/account/backend-access", () => ({
  resolveAuthenticatedBackendAccess: () =>
    resolveAuthenticatedBackendAccessMock(),
}));

vi.mock("@/lib/backend-v2/resources/series", () => ({
  accept: (seriesId: string, accessToken: string) =>
    acceptMock(seriesId, accessToken),
  decline: (seriesId: string, accessToken: string) =>
    declineMock(seriesId, accessToken),
  cancel: (seriesId: string, accessToken: string) =>
    cancelMock(seriesId, accessToken),
}));

const { acceptChallengeAction, declineChallengeAction, cancelChallengeAction } =
  await import("./actions");

function formData(): FormData {
  const data = new FormData();
  data.set("seriesId", "series-1");
  return data;
}

beforeEach(() => {
  headersGetMock.mockReturnValue("http://localhost:3000");
  resolveAuthenticatedBackendAccessMock.mockResolvedValue({
    kind: "ready",
    accessToken: "at-1",
  });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe.each([
  {
    name: "acceptChallengeAction",
    action: () => acceptChallengeAction,
    apiMock: () => acceptMock,
    successRedirect:
      "/account/games/level5/challenges?view=active&notice=accepted",
    staleFirstPage: "/account/games/level5/challenges?view=incoming",
  },
  {
    name: "declineChallengeAction",
    action: () => declineChallengeAction,
    apiMock: () => declineMock,
    successRedirect:
      "/account/games/level5/challenges?view=incoming&notice=declined",
    staleFirstPage: "/account/games/level5/challenges?view=incoming",
  },
  {
    name: "cancelChallengeAction",
    action: () => cancelChallengeAction,
    apiMock: () => cancelMock,
    successRedirect:
      "/account/games/level5/challenges?view=outgoing&notice=cancelled",
    staleFirstPage: "/account/games/level5/challenges?view=outgoing",
  },
])("$name", ({ action, apiMock, successRedirect, staleFirstPage }) => {
  it("rejects a mismatched Origin without calling Backend V2", async () => {
    headersGetMock.mockReturnValue("http://evil.example");

    const state = await action()({ status: "idle" }, formData());

    expect(state).toEqual({
      status: "error",
      message:
        "Your request could not be verified. Please reload the page and try again.",
    });
    expect(apiMock()).not.toHaveBeenCalled();
  });

  it("redirects to login when the session is unauthenticated", async () => {
    resolveAuthenticatedBackendAccessMock.mockResolvedValue({
      kind: "unauthenticated",
    });

    await expect(action()({ status: "idle" }, formData())).rejects.toThrow(
      "REDIRECT:/account/login?returnTo=/account/games/level5/challenges",
    );
    expect(apiMock()).not.toHaveBeenCalled();
  });

  it("reports throttled session resolution without calling Backend V2", async () => {
    resolveAuthenticatedBackendAccessMock.mockResolvedValue({
      kind: "throttled",
    });

    const state = await action()({ status: "idle" }, formData());

    expect(state.status).toBe("error");
    expect(apiMock()).not.toHaveBeenCalled();
  });

  it("reports a transient failure when the session store is unavailable", async () => {
    resolveAuthenticatedBackendAccessMock.mockResolvedValue({
      kind: "unavailable",
    });

    const state = await action()({ status: "idle" }, formData());

    expect(state.status).toBe("error");
    expect(apiMock()).not.toHaveBeenCalled();
  });

  it("succeeds, calls Backend exactly once, and redirects with the fixed success notice", async () => {
    apiMock().mockResolvedValue({
      kind: "success",
      status: 200,
      data: { id: "series-1" },
    });

    await expect(action()({ status: "idle" }, formData())).rejects.toThrow(
      `REDIRECT:${successRedirect}`,
    );
    expect(apiMock()).toHaveBeenCalledTimes(1);
    expect(apiMock()).toHaveBeenCalledWith("series-1", "at-1");
  });

  it("redirects to login when Backend V2 itself returns 401", async () => {
    apiMock().mockResolvedValue({
      kind: "error",
      error: { kind: "http", httpStatus: 401, safeMessage: "Unauthorized" },
    });

    await expect(action()({ status: "idle" }, formData())).rejects.toThrow(
      "REDIRECT:/account/login?returnTo=/account/games/level5/challenges",
    );
  });

  it.each([403, 404, 409])(
    "redirects to the current category's first page with state-changed on a %s (stale state)",
    async (httpStatus) => {
      apiMock().mockResolvedValue({
        kind: "error",
        error: { kind: "http", httpStatus, safeMessage: "Stale" },
      });

      await expect(action()({ status: "idle" }, formData())).rejects.toThrow(
        `REDIRECT:${staleFirstPage}&notice=state-changed`,
      );
      expect(apiMock()).toHaveBeenCalledTimes(1);
    },
  );

  it("reports throttled inline on a 429, without redirecting", async () => {
    apiMock().mockResolvedValue({
      kind: "error",
      error: {
        kind: "http",
        httpStatus: 429,
        safeMessage: "Too Many Requests",
      },
    });

    const state = await action()({ status: "idle" }, formData());

    expect(state.status).toBe("error");
    expect(state.message).toMatch(/wait a moment/i);
  });

  it("surfaces Backend V2's safe message inline on a 400, with a trace reference", async () => {
    apiMock().mockResolvedValue({
      kind: "error",
      error: {
        kind: "http",
        httpStatus: 400,
        safeMessage: "The series is not in a state that allows this.",
        traceId: "trace-1",
      },
    });

    const state = await action()({ status: "idle" }, formData());

    expect(state).toEqual({
      status: "error",
      message:
        "The series is not in a state that allows this. (Reference: trace-1)",
    });
  });

  it("converges through an outcome-unknown redirect on a 5xx, rather than assuming failure", async () => {
    apiMock().mockResolvedValue({
      kind: "error",
      error: {
        kind: "http",
        httpStatus: 503,
        safeMessage: "Service Unavailable",
      },
    });

    await expect(action()({ status: "idle" }, formData())).rejects.toThrow(
      `REDIRECT:${staleFirstPage}&notice=outcome-unknown`,
    );
    expect(apiMock()).toHaveBeenCalledTimes(1);
  });

  it.each(["timeout", "network"] as const)(
    "converges through an outcome-unknown redirect on a %s, never retrying automatically",
    async (kind) => {
      apiMock().mockResolvedValue({ kind: "error", error: { kind } });

      await expect(action()({ status: "idle" }, formData())).rejects.toThrow(
        `REDIRECT:${staleFirstPage}&notice=outcome-unknown`,
      );
      expect(apiMock()).toHaveBeenCalledTimes(1);
    },
  );

  it("reports a generic inline failure on an invalid response, without redirecting", async () => {
    apiMock().mockResolvedValue({
      kind: "error",
      error: { kind: "invalid_response", httpStatus: 200 },
    });

    const state = await action()({ status: "idle" }, formData());

    expect(state.status).toBe("error");
    expect(apiMock()).toHaveBeenCalledTimes(1);
  });

  it("returns a missing-fields error without calling Backend V2 when seriesId is absent", async () => {
    const state = await action()({ status: "idle" }, new FormData());

    expect(state.status).toBe("error");
    expect(apiMock()).not.toHaveBeenCalled();
  });
});
