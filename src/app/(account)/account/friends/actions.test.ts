import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const headersGetMock = vi.fn();
const resolveAuthenticatedBackendAccessMock = vi.fn();
const acceptMock = vi.fn();
const declineMock = vi.fn();
const cancelMock = vi.fn();
const removeMock = vi.fn();

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

vi.mock("@/lib/backend-v2/resources/friends", () => ({
  accept: (requestId: string, accessToken: string) =>
    acceptMock(requestId, accessToken),
  decline: (requestId: string, accessToken: string) =>
    declineMock(requestId, accessToken),
  cancel: (requestId: string, accessToken: string) =>
    cancelMock(requestId, accessToken),
  remove: (playerId: string, accessToken: string) =>
    removeMock(playerId, accessToken),
}));

const {
  acceptFriendRequestAction,
  declineFriendRequestAction,
  cancelFriendRequestAction,
  removeFriendAction,
} = await import("./actions");

function requestFormData(): FormData {
  const data = new FormData();
  data.set("requestId", "req-1");
  return data;
}

function playerFormData(): FormData {
  const data = new FormData();
  data.set("playerId", "player-1");
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
    name: "acceptFriendRequestAction",
    action: () => acceptFriendRequestAction,
    apiMock: () => acceptMock,
    formData: requestFormData,
    idParam: "req-1",
    successNotice: "request-accepted",
  },
  {
    name: "declineFriendRequestAction",
    action: () => declineFriendRequestAction,
    apiMock: () => declineMock,
    formData: requestFormData,
    idParam: "req-1",
    successNotice: "request-declined",
  },
  {
    name: "cancelFriendRequestAction",
    action: () => cancelFriendRequestAction,
    apiMock: () => cancelMock,
    formData: requestFormData,
    idParam: "req-1",
    successNotice: "request-cancelled",
  },
  {
    name: "removeFriendAction",
    action: () => removeFriendAction,
    apiMock: () => removeMock,
    formData: playerFormData,
    idParam: "player-1",
    successNotice: "friend-removed",
  },
])("$name", ({ action, apiMock, formData, idParam, successNotice }) => {
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
      "REDIRECT:/account/login?returnTo=/account/friends",
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

  it("succeeds and redirects with the fixed success notice", async () => {
    apiMock().mockResolvedValue({
      kind: "success",
      status: 204,
      data: undefined,
    });

    await expect(action()({ status: "idle" }, formData())).rejects.toThrow(
      `REDIRECT:/account/friends?notice=${successNotice}`,
    );
    expect(apiMock()).toHaveBeenCalledWith(idParam, "at-1");
  });

  it("redirects to login when Backend V2 itself returns 401", async () => {
    apiMock().mockResolvedValue({
      kind: "error",
      error: { kind: "http", httpStatus: 401, safeMessage: "Unauthorized" },
    });

    await expect(action()({ status: "idle" }, formData())).rejects.toThrow(
      "REDIRECT:/account/login?returnTo=/account/friends",
    );
  });

  it.each([403, 404, 409])(
    "redirects to the state-changed notice on a %s (stale state)",
    async (httpStatus) => {
      apiMock().mockResolvedValue({
        kind: "error",
        error: { kind: "http", httpStatus, safeMessage: "Stale" },
      });

      await expect(action()({ status: "idle" }, formData())).rejects.toThrow(
        "REDIRECT:/account/friends?notice=state-changed",
      );
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
        safeMessage: "A player cannot send a friend request to themselves.",
        traceId: "trace-1",
      },
    });

    const state = await action()({ status: "idle" }, formData());

    expect(state).toEqual({
      status: "error",
      message:
        "A player cannot send a friend request to themselves. (Reference: trace-1)",
    });
  });

  it("reports a temporary failure inline on a 5xx", async () => {
    apiMock().mockResolvedValue({
      kind: "error",
      error: {
        kind: "http",
        httpStatus: 503,
        safeMessage: "Service Unavailable",
      },
    });

    const state = await action()({ status: "idle" }, formData());

    expect(state.status).toBe("error");
    expect(state.message).toMatch(/try again shortly/i);
  });

  it.each(["timeout", "network"] as const)(
    "reports a temporary failure inline on a %s error",
    async (kind) => {
      apiMock().mockResolvedValue({ kind: "error", error: { kind } });

      const state = await action()({ status: "idle" }, formData());

      expect(state.status).toBe("error");
      expect(state.message).toMatch(/try again shortly/i);
    },
  );
});
