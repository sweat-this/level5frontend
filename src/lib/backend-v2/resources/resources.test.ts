import { beforeEach, describe, expect, it, vi } from "vitest";

const requestMock = vi
  .fn()
  .mockResolvedValue({ kind: "success", status: 200, data: {} });

vi.mock("../transport", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../transport")>();
  return { ...actual, request: requestMock };
});

// Imported after the mock so every resource client picks up the mocked `request`.
const auth = await import("./auth");
const account = await import("./account");
const players = await import("./players");
const friends = await import("./friends");
const series = await import("./series");
const { SAFE_READ_RETRY_POLICY } = await import("../transport");

// `expect.objectContaining` requires the key to actually be present on the received object
// (even as `undefined`) to match, which mutation calls deliberately don't set at all - so "no
// retry" is asserted by reading the property directly instead of folding it into the matcher.
function lastCallOptions(): Record<string, unknown> {
  return requestMock.mock.calls.at(-1)![0] as Record<string, unknown>;
}

describe("backend-v2 resource clients", () => {
  beforeEach(() => {
    requestMock.mockClear();
  });

  describe("auth (no automatic retry on any operation)", () => {
    it("register", async () => {
      await auth.register("u", "p", "Display");
      expect(requestMock).toHaveBeenCalledWith(
        expect.objectContaining({
          method: "POST",
          path: "/api/v2/auth/register",
          body: { username: "u", password: "p", displayName: "Display" },
        }),
      );
      expect(lastCallOptions().retry).toBeUndefined();
    });

    it("login forwards the client-IP override and no retry", async () => {
      await auth.login("u", "p", { testOnlyForwardedFor: "203.0.113.7" });
      expect(requestMock).toHaveBeenCalledWith(
        expect.objectContaining({
          method: "POST",
          path: "/api/v2/auth/login",
          ip: { testOnlyForwardedFor: "203.0.113.7" },
        }),
      );
      expect(lastCallOptions().retry).toBeUndefined();
    });

    it("refresh", async () => {
      await auth.refresh("rt");
      expect(requestMock).toHaveBeenCalledWith(
        expect.objectContaining({
          method: "POST",
          path: "/api/v2/auth/refresh",
          body: { refreshToken: "rt" },
        }),
      );
      expect(lastCallOptions().retry).toBeUndefined();
    });

    it("logout", async () => {
      await auth.logout("rt");
      expect(requestMock).toHaveBeenCalledWith(
        expect.objectContaining({
          method: "POST",
          path: "/api/v2/auth/logout",
          body: { refreshToken: "rt" },
        }),
      );
      expect(lastCallOptions().retry).toBeUndefined();
    });
  });

  describe("account.getCurrentAccount", () => {
    it("does not retry unless the caller explicitly opts in (BackendAuthClient.getMe relies on this)", async () => {
      await account.getCurrentAccount("token");
      expect(requestMock).toHaveBeenCalledWith(
        expect.objectContaining({
          method: "GET",
          path: "/api/v2/me",
          accessToken: "token",
        }),
      );
      expect(lastCallOptions().retry).toBeUndefined();
    });

    it("uses the caller-supplied retry policy when one is passed", async () => {
      await account.getCurrentAccount("token", {
        retry: SAFE_READ_RETRY_POLICY,
      });
      expect(requestMock).toHaveBeenCalledWith(
        expect.objectContaining({
          method: "GET",
          path: "/api/v2/me",
          retry: SAFE_READ_RETRY_POLICY,
        }),
      );
    });
  });

  describe("players", () => {
    it("getByTag URL-encodes the tag and retries", async () => {
      await players.getByTag("Patrick#4827", "token");
      expect(requestMock).toHaveBeenCalledWith(
        expect.objectContaining({
          method: "GET",
          path: "/api/v2/players/by-tag/Patrick%234827",
          retry: SAFE_READ_RETRY_POLICY,
        }),
      );
    });

    it("getMyPlayerId retries", async () => {
      await players.getMyPlayerId("token");
      expect(requestMock).toHaveBeenCalledWith(
        expect.objectContaining({
          method: "GET",
          path: "/api/v2/players/me",
          retry: SAFE_READ_RETRY_POLICY,
        }),
      );
    });

    it("updateMyProfile is a mutation - no retry", async () => {
      await players.updateMyProfile("New Name", "token");
      expect(requestMock).toHaveBeenCalledWith(
        expect.objectContaining({
          method: "PATCH",
          path: "/api/v2/players/me",
          body: { displayName: "New Name" },
        }),
      );
      expect(lastCallOptions().retry).toBeUndefined();
    });
  });

  describe("friends", () => {
    it("listFriends retries", async () => {
      await friends.listFriends("token");
      expect(requestMock).toHaveBeenCalledWith(
        expect.objectContaining({
          method: "GET",
          path: "/api/v2/friends",
          retry: SAFE_READ_RETRY_POLICY,
        }),
      );
    });

    it("sendRequest is a mutation - no retry", async () => {
      await friends.sendRequest("player-1", "token");
      expect(requestMock).toHaveBeenCalledWith(
        expect.objectContaining({
          method: "POST",
          path: "/api/v2/friends/requests",
          body: { toPlayerId: "player-1" },
        }),
      );
      expect(lastCallOptions().retry).toBeUndefined();
    });

    it("accept/decline/cancel/remove target the right routes with no retry", async () => {
      await friends.accept("req-1", "token");
      await friends.decline("req-1", "token");
      await friends.cancel("req-1", "token");
      await friends.remove("player-1", "token");

      expect(requestMock).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          method: "POST",
          path: "/api/v2/friends/requests/req-1/accept",
        }),
      );
      expect(requestMock).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          method: "POST",
          path: "/api/v2/friends/requests/req-1/decline",
        }),
      );
      expect(requestMock).toHaveBeenNthCalledWith(
        3,
        expect.objectContaining({
          method: "POST",
          path: "/api/v2/friends/requests/req-1/cancel",
        }),
      );
      expect(requestMock).toHaveBeenNthCalledWith(
        4,
        expect.objectContaining({
          method: "DELETE",
          path: "/api/v2/friends/player-1",
        }),
      );
      for (const call of requestMock.mock.calls) {
        expect((call[0] as Record<string, unknown>).retry).toBeUndefined();
      }
    });
  });

  describe("series", () => {
    it("getSeries retries", async () => {
      await series.getSeries("series-1", "token");
      expect(requestMock).toHaveBeenCalledWith(
        expect.objectContaining({
          method: "GET",
          path: "/api/v2/series/series-1",
          retry: SAFE_READ_RETRY_POLICY,
        }),
      );
    });

    it("listIncoming builds the query string from limit/cursor and retries", async () => {
      await series.listIncoming("token", { limit: 20, cursor: "abc==" });
      expect(requestMock).toHaveBeenCalledWith(
        expect.objectContaining({
          method: "GET",
          path: "/api/v2/series/incoming?limit=20&cursor=abc%3D%3D",
          retry: SAFE_READ_RETRY_POLICY,
        }),
      );
    });

    it("listActive with no params omits the query string", async () => {
      await series.listActive("token");
      expect(requestMock).toHaveBeenCalledWith(
        expect.objectContaining({ path: "/api/v2/series/active" }),
      );
    });

    it("accept/decline/cancel are mutations - no retry", async () => {
      await series.accept("series-1", "token");
      await series.decline("series-1", "token");
      await series.cancel("series-1", "token");

      expect(requestMock).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          method: "POST",
          path: "/api/v2/series/series-1/accept",
        }),
      );
      expect(requestMock).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          method: "POST",
          path: "/api/v2/series/series-1/decline",
        }),
      );
      expect(requestMock).toHaveBeenNthCalledWith(
        3,
        expect.objectContaining({
          method: "POST",
          path: "/api/v2/series/series-1/cancel",
        }),
      );
      for (const call of requestMock.mock.calls) {
        expect((call[0] as Record<string, unknown>).retry).toBeUndefined();
      }
    });
  });
});
