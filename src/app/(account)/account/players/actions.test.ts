import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const headersGetMock = vi.fn();
const resolveAuthenticatedBackendAccessMock = vi.fn();
const getByTagMock = vi.fn();
const sendRequestMock = vi.fn();

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

vi.mock("@/lib/backend-v2/resources/players", () => ({
  getByTag: (tag: string, accessToken: string) =>
    getByTagMock(tag, accessToken),
}));

vi.mock("@/lib/backend-v2/resources/friends", () => ({
  sendRequest: (toPlayerId: string, accessToken: string) =>
    sendRequestMock(toPlayerId, accessToken),
}));

const { sendFriendRequestAction } = await import("./actions");

function formData(tag: string): FormData {
  const data = new FormData();
  data.set("tag", tag);
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

describe("sendFriendRequestAction", () => {
  it("rejects a mismatched Origin without calling Backend V2", async () => {
    headersGetMock.mockReturnValue("http://evil.example");

    const state = await sendFriendRequestAction(
      { status: "idle" },
      formData("Patrick#4827"),
    );

    expect(state).toEqual({
      status: "error",
      message:
        "Your request could not be verified. Please reload the page and try again.",
    });
    expect(getByTagMock).not.toHaveBeenCalled();
    expect(sendRequestMock).not.toHaveBeenCalled();
  });

  it("rejects a missing tag without calling Backend V2", async () => {
    const state = await sendFriendRequestAction(
      { status: "idle" },
      formData("   "),
    );

    expect(state.status).toBe("error");
    expect(getByTagMock).not.toHaveBeenCalled();
  });

  it("redirects to login when unauthenticated, preserving the searched tag", async () => {
    resolveAuthenticatedBackendAccessMock.mockResolvedValue({
      kind: "unauthenticated",
    });

    await expect(
      sendFriendRequestAction({ status: "idle" }, formData("Patrick#4827")),
    ).rejects.toThrow(
      "REDIRECT:/account/login?returnTo=%2Faccount%2Fplayers%3Ftag%3DPatrick%25234827",
    );
    expect(getByTagMock).not.toHaveBeenCalled();
  });

  it("re-resolves the PlayerId from Backend V2's own tag lookup rather than trusting one from the form", async () => {
    getByTagMock.mockResolvedValue({
      kind: "success",
      status: 200,
      data: {
        playerId: "server-resolved-id",
        displayName: "Patrick",
        tag: "Patrick#4827",
      },
    });
    sendRequestMock.mockResolvedValue({
      kind: "success",
      status: 200,
      data: {
        id: "req-1",
        fromPlayerId: "me",
        toPlayerId: "server-resolved-id",
        status: "Pending",
      },
    });

    // Even if a caller somehow forged a playerId/toPlayerId field, the action never reads one -
    // formData only ever supplies "tag" (see SendFriendRequestForm.tsx).
    const submitted = formData("Patrick#4827");
    submitted.set("playerId", "attacker-supplied-id");
    submitted.set("toPlayerId", "attacker-supplied-id");

    await expect(
      sendFriendRequestAction({ status: "idle" }, submitted),
    ).rejects.toThrow("REDIRECT:/account/friends?notice=request-sent");

    expect(getByTagMock).toHaveBeenCalledWith("Patrick#4827", "at-1");
    expect(sendRequestMock).toHaveBeenCalledWith("server-resolved-id", "at-1");
  });

  it("maps the tag lookup's 404 to a not-found message without sending a request", async () => {
    getByTagMock.mockResolvedValue({
      kind: "error",
      error: { kind: "http", httpStatus: 404, safeMessage: "Not found" },
    });

    const state = await sendFriendRequestAction(
      { status: "idle" },
      formData("Nobody#9999"),
    );

    expect(state).toEqual({
      status: "error",
      message: "No player was found with that tag.",
    });
    expect(sendRequestMock).not.toHaveBeenCalled();
  });

  it("redirects to login when the tag lookup itself returns 401", async () => {
    getByTagMock.mockResolvedValue({
      kind: "error",
      error: { kind: "http", httpStatus: 401, safeMessage: "Unauthorized" },
    });

    await expect(
      sendFriendRequestAction({ status: "idle" }, formData("Patrick#4827")),
    ).rejects.toThrow(/^REDIRECT:\/account\/login/);
    expect(sendRequestMock).not.toHaveBeenCalled();
  });

  it("maps send's 404 (player no longer available) to a safe message", async () => {
    getByTagMock.mockResolvedValue({
      kind: "success",
      status: 200,
      data: { playerId: "p1", displayName: "Patrick", tag: "Patrick#4827" },
    });
    sendRequestMock.mockResolvedValue({
      kind: "error",
      error: {
        kind: "http",
        httpStatus: 404,
        safeMessage: "No player with that id was found.",
      },
    });

    const state = await sendFriendRequestAction(
      { status: "idle" },
      formData("Patrick#4827"),
    );

    expect(state).toEqual({
      status: "error",
      message: "That player is no longer available.",
    });
  });

  it("surfaces Backend V2's safe conflict message on a 409", async () => {
    getByTagMock.mockResolvedValue({
      kind: "success",
      status: 200,
      data: { playerId: "p1", displayName: "Patrick", tag: "Patrick#4827" },
    });
    sendRequestMock.mockResolvedValue({
      kind: "error",
      error: {
        kind: "http",
        httpStatus: 409,
        safeMessage: "You are already friends with this player.",
        traceId: "trace-9",
      },
    });

    const state = await sendFriendRequestAction(
      { status: "idle" },
      formData("Patrick#4827"),
    );

    expect(state).toEqual({
      status: "error",
      message: "You are already friends with this player. (Reference: trace-9)",
    });
  });

  it("surfaces Backend V2's safe validation message on a 400 (e.g. self-friend)", async () => {
    getByTagMock.mockResolvedValue({
      kind: "success",
      status: 200,
      data: { playerId: "p1", displayName: "Patrick", tag: "Patrick#4827" },
    });
    sendRequestMock.mockResolvedValue({
      kind: "error",
      error: {
        kind: "http",
        httpStatus: 400,
        safeMessage: "A player cannot send a friend request to themselves.",
      },
    });

    const state = await sendFriendRequestAction(
      { status: "idle" },
      formData("Patrick#4827"),
    );

    expect(state.status).toBe("error");
    expect(state.message).toMatch(/cannot send a friend request to themselves/);
  });

  it("reports throttled on a 429 from send", async () => {
    getByTagMock.mockResolvedValue({
      kind: "success",
      status: 200,
      data: { playerId: "p1", displayName: "Patrick", tag: "Patrick#4827" },
    });
    sendRequestMock.mockResolvedValue({
      kind: "error",
      error: {
        kind: "http",
        httpStatus: 429,
        safeMessage: "Too Many Requests",
      },
    });

    const state = await sendFriendRequestAction(
      { status: "idle" },
      formData("Patrick#4827"),
    );

    expect(state.status).toBe("error");
    expect(state.message).toMatch(/wait a moment/i);
  });

  it("redirects to login when send itself returns 401", async () => {
    getByTagMock.mockResolvedValue({
      kind: "success",
      status: 200,
      data: { playerId: "p1", displayName: "Patrick", tag: "Patrick#4827" },
    });
    sendRequestMock.mockResolvedValue({
      kind: "error",
      error: { kind: "http", httpStatus: 401, safeMessage: "Unauthorized" },
    });

    await expect(
      sendFriendRequestAction({ status: "idle" }, formData("Patrick#4827")),
    ).rejects.toThrow(/^REDIRECT:\/account\/login/);
  });

  it.each(["timeout", "network"] as const)(
    "reports a temporary failure on a %s error from send",
    async (kind) => {
      getByTagMock.mockResolvedValue({
        kind: "success",
        status: 200,
        data: { playerId: "p1", displayName: "Patrick", tag: "Patrick#4827" },
      });
      sendRequestMock.mockResolvedValue({ kind: "error", error: { kind } });

      const state = await sendFriendRequestAction(
        { status: "idle" },
        formData("Patrick#4827"),
      );

      expect(state.status).toBe("error");
      expect(state.message).toMatch(/try again shortly/i);
    },
  );

  it("succeeds and redirects to /account/friends with the request-sent notice", async () => {
    getByTagMock.mockResolvedValue({
      kind: "success",
      status: 200,
      data: { playerId: "p1", displayName: "Patrick", tag: "Patrick#4827" },
    });
    sendRequestMock.mockResolvedValue({
      kind: "success",
      status: 200,
      data: {
        id: "req-1",
        fromPlayerId: "me",
        toPlayerId: "p1",
        status: "Pending",
      },
    });

    await expect(
      sendFriendRequestAction({ status: "idle" }, formData("Patrick#4827")),
    ).rejects.toThrow("REDIRECT:/account/friends?notice=request-sent");
  });
});
