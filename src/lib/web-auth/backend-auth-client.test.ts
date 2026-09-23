import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BackendAuthClient } from "./backend-auth-client";

const BASE_URL = "http://backend.test";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("BackendAuthClient", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("register", () => {
    it("classifies 200 as success and returns the credentials", async () => {
      fetchMock.mockResolvedValue(
        jsonResponse(200, {
          accessToken: "a",
          expiresAt: "2030-01-01T00:00:00Z",
          playerId: "p1",
          refreshToken: "r",
          refreshTokenExpiresAt: "2030-02-01T00:00:00Z",
        }),
      );
      const client = new BackendAuthClient(BASE_URL);
      const result = await client.register("user", "password123", "Display");

      expect(result.kind).toBe("success");
      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(`${BASE_URL}/api/v2/auth/register`);
      expect(init.method).toBe("POST");
    });

    it("classifies 400 as validation_failed with the safe backend message", async () => {
      fetchMock.mockResolvedValue(
        jsonResponse(400, {
          title:
            "Username must be 3-32 characters: letters, digits, underscore, or period.",
          code: "invalid_username",
          traceId: "trace-1",
        }),
      );
      const client = new BackendAuthClient(BASE_URL);
      expect(await client.register("u", "password123", "Display")).toEqual({
        kind: "validation_failed",
        message:
          "Username must be 3-32 characters: letters, digits, underscore, or period.",
        traceId: "trace-1",
      });
    });

    it("classifies 409 as conflict with the safe backend message", async () => {
      fetchMock.mockResolvedValue(
        jsonResponse(409, {
          title: "Username is already taken.",
          code: "username_conflict",
        }),
      );
      const client = new BackendAuthClient(BASE_URL);
      expect(await client.register("taken", "password123", "Display")).toEqual({
        kind: "conflict",
        message: "Username is already taken.",
        traceId: undefined,
      });
    });

    it("classifies 429 as rate_limited", async () => {
      fetchMock.mockResolvedValue(new Response(null, { status: 429 }));
      const client = new BackendAuthClient(BASE_URL);
      expect(await client.register("user", "password123", "Display")).toEqual({
        kind: "rate_limited",
      });
    });

    it("classifies a 5xx as unknown_failure", async () => {
      fetchMock.mockResolvedValue(new Response(null, { status: 503 }));
      const client = new BackendAuthClient(BASE_URL);
      expect(await client.register("user", "password123", "Display")).toEqual({
        kind: "unknown_failure",
        traceId: undefined,
      });
    });

    it("classifies a network/transport failure as unknown_failure", async () => {
      fetchMock.mockRejectedValue(new Error("network down"));
      const client = new BackendAuthClient(BASE_URL);
      expect(await client.register("user", "password123", "Display")).toEqual({
        kind: "unknown_failure",
        traceId: undefined,
      });
    });
  });

  describe("login", () => {
    it("classifies 200 as success and returns the credentials", async () => {
      fetchMock.mockResolvedValue(
        jsonResponse(200, {
          accessToken: "a",
          expiresAt: "2030-01-01T00:00:00Z",
          playerId: "p1",
          refreshToken: "r",
          refreshTokenExpiresAt: "2030-02-01T00:00:00Z",
        }),
      );

      const client = new BackendAuthClient(BASE_URL);
      const result = await client.login("user", "pass");

      expect(result.kind).toBe("success");
      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(`${BASE_URL}/api/v2/auth/login`);
      expect(init.method).toBe("POST");
      expect(init.cache).toBe("no-store");
    });

    it("classifies 401 as invalid_credentials", async () => {
      fetchMock.mockResolvedValue(
        jsonResponse(401, { code: "invalid_credentials" }),
      );
      const client = new BackendAuthClient(BASE_URL);
      expect(await client.login("user", "wrong")).toEqual({
        kind: "invalid_credentials",
      });
    });

    it("classifies 429 as rate_limited", async () => {
      fetchMock.mockResolvedValue(new Response(null, { status: 429 }));
      const client = new BackendAuthClient(BASE_URL);
      expect(await client.login("user", "pass")).toEqual({
        kind: "rate_limited",
      });
    });

    it("classifies a 5xx as unknown_failure", async () => {
      fetchMock.mockResolvedValue(new Response(null, { status: 503 }));
      const client = new BackendAuthClient(BASE_URL);
      expect(await client.login("user", "pass")).toEqual({
        kind: "unknown_failure",
      });
    });

    it("classifies a network/transport failure as unknown_failure", async () => {
      fetchMock.mockRejectedValue(new Error("network down"));
      const client = new BackendAuthClient(BASE_URL);
      expect(await client.login("user", "pass")).toEqual({
        kind: "unknown_failure",
      });
    });

    it("classifies a 200 with a genuinely empty body as unknown_failure, never a success with undefined credentials", async () => {
      // Regression test for issue #4 review Problem 1: a malformed 200 (empty body) must never
      // reach WebSessionCoordinator as { kind: "success", credentials: undefined } - that would
      // create a session whose accessTokenExpiresAt is NaN, which is treated as never-expiring.
      fetchMock.mockResolvedValue(
        new Response(null, {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      );
      const client = new BackendAuthClient(BASE_URL);
      expect(await client.login("user", "pass")).toEqual({
        kind: "unknown_failure",
      });
    });
  });

  describe("refresh", () => {
    it("classifies 401 as invalid (distinct from login's invalid_credentials)", async () => {
      fetchMock.mockResolvedValue(
        jsonResponse(401, { code: "invalid_refresh_token" }),
      );
      const client = new BackendAuthClient(BASE_URL);
      expect(await client.refresh("old-token")).toEqual({ kind: "invalid" });
    });

    it("classifies 429 as rate_limited without treating the token as invalid", async () => {
      fetchMock.mockResolvedValue(new Response(null, { status: 429 }));
      const client = new BackendAuthClient(BASE_URL);
      expect(await client.refresh("old-token")).toEqual({
        kind: "rate_limited",
      });
    });

    it("classifies a timeout as unknown_failure", async () => {
      fetchMock.mockRejectedValue(
        new DOMException("The operation was aborted", "TimeoutError"),
      );
      const client = new BackendAuthClient(BASE_URL);
      expect(await client.refresh("old-token")).toEqual({
        kind: "unknown_failure",
      });
    });

    it("sends the test-only forwarded-for override header only when provided", async () => {
      fetchMock.mockResolvedValue(new Response(null, { status: 429 }));
      const client = new BackendAuthClient(BASE_URL);
      await client.refresh("old-token", {
        testOnlyForwardedFor: "203.0.113.7",
      });

      const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect((init.headers as Record<string, string>)["x-forwarded-for"]).toBe(
        "203.0.113.7",
      );
    });
  });

  describe("logout", () => {
    it("is best-effort and never throws on failure", async () => {
      fetchMock.mockRejectedValue(new Error("network down"));
      const client = new BackendAuthClient(BASE_URL);
      await expect(client.logout("token")).resolves.toBe(false);
    });

    it("reports success for a 204", async () => {
      fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
      const client = new BackendAuthClient(BASE_URL);
      await expect(client.logout("token")).resolves.toBe(true);
    });
  });

  describe("getMe", () => {
    it("classifies 200 as success", async () => {
      fetchMock.mockResolvedValue(
        jsonResponse(200, {
          accountId: "a1",
          username: "player1",
          status: "Active",
          playerId: "p1",
          createdAt: "2025-01-01T00:00:00Z",
        }),
      );
      const client = new BackendAuthClient(BASE_URL);
      const result = await client.getMe("access-token");
      expect(result.kind).toBe("success");
    });

    it("classifies 401 as unauthorized", async () => {
      fetchMock.mockResolvedValue(new Response(null, { status: 401 }));
      const client = new BackendAuthClient(BASE_URL);
      expect(await client.getMe("access-token")).toEqual({
        kind: "unauthorized",
      });
    });

    it("classifies a 503 as unavailable, not unauthorized", async () => {
      fetchMock.mockResolvedValue(new Response(null, { status: 503 }));
      const client = new BackendAuthClient(BASE_URL);
      expect(await client.getMe("access-token")).toEqual({
        kind: "unavailable",
      });
    });

    it("does not retry on a transient failure - stays fail-fast like issue #3 (issue #4 review Problem 2)", async () => {
      // WebSessionCoordinator.getMe can already call this twice in one logical request (once,
      // then again after a coordinated refresh); a retrying /me would multiply that path's
      // worst-case latency well past what issue #3 certified.
      fetchMock.mockResolvedValue(new Response(null, { status: 503 }));
      const client = new BackendAuthClient(BASE_URL);
      await client.getMe("access-token");
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("classifies a network failure as unavailable, not unauthorized", async () => {
      fetchMock.mockRejectedValue(new Error("network down"));
      const client = new BackendAuthClient(BASE_URL);
      expect(await client.getMe("access-token")).toEqual({
        kind: "unavailable",
      });
    });

    it("sends the access token as a Bearer header", async () => {
      fetchMock.mockResolvedValue(new Response(null, { status: 401 }));
      const client = new BackendAuthClient(BASE_URL);
      await client.getMe("my-access-token");

      const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect((init.headers as Record<string, string>).authorization).toBe(
        "Bearer my-access-token",
      );
    });
  });
});
