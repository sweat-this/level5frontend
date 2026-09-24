import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { request, SAFE_READ_RETRY_POLICY, type RetryPolicy } from "./transport";

const BASE_URL = "http://backend.test";

function jsonResponse(
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

describe("transport", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("request URL construction", () => {
    it("strips a trailing slash from baseUrl so the joined URL has no double slash", async () => {
      fetchMock.mockResolvedValue(jsonResponse(200, {}));
      await request({
        method: "GET",
        path: "/api/v2/players/me",
        operationName: "test.op",
        baseUrl: "http://backend.test/",
      });
      expect(fetchMock.mock.calls[0][0]).toBe(
        "http://backend.test/api/v2/players/me",
      );
    });

    it("joins a baseUrl with no trailing slash unchanged", async () => {
      fetchMock.mockResolvedValue(jsonResponse(200, {}));
      await request({
        method: "GET",
        path: "/api/v2/players/me",
        operationName: "test.op",
        baseUrl: BASE_URL,
      });
      expect(fetchMock.mock.calls[0][0]).toBe(
        "http://backend.test/api/v2/players/me",
      );
    });
  });

  describe("client IP forwarding (issue #10)", () => {
    function forwardedForHeader(call: unknown[]): string | null {
      const init = call[1] as RequestInit;
      return new Headers(init.headers).get("x-forwarded-for");
    }

    it("forwards ip.clientIp as X-Forwarded-For", async () => {
      fetchMock.mockResolvedValue(jsonResponse(200, {}));
      await request({
        method: "GET",
        path: "/x",
        operationName: "test.op",
        baseUrl: BASE_URL,
        ip: { clientIp: "203.0.113.7" },
      });
      expect(forwardedForHeader(fetchMock.mock.calls[0])).toBe("203.0.113.7");
    });

    it("still supports testOnlyForwardedFor for certification harnesses", async () => {
      fetchMock.mockResolvedValue(jsonResponse(200, {}));
      await request({
        method: "GET",
        path: "/x",
        operationName: "test.op",
        baseUrl: BASE_URL,
        ip: { testOnlyForwardedFor: "198.51.100.9" },
      });
      expect(forwardedForHeader(fetchMock.mock.calls[0])).toBe("198.51.100.9");
    });

    it("prefers clientIp over testOnlyForwardedFor when both are somehow supplied", async () => {
      fetchMock.mockResolvedValue(jsonResponse(200, {}));
      await request({
        method: "GET",
        path: "/x",
        operationName: "test.op",
        baseUrl: BASE_URL,
        ip: { clientIp: "203.0.113.7", testOnlyForwardedFor: "198.51.100.9" },
      });
      expect(forwardedForHeader(fetchMock.mock.calls[0])).toBe("203.0.113.7");
    });

    it("sends no X-Forwarded-For when no IP is supplied", async () => {
      fetchMock.mockResolvedValue(jsonResponse(200, {}));
      await request({
        method: "GET",
        path: "/x",
        operationName: "test.op",
        baseUrl: BASE_URL,
      });
      expect(forwardedForHeader(fetchMock.mock.calls[0])).toBeNull();
    });
  });

  describe("telemetry (issue #10)", () => {
    it("passes a stable per-call span name and propagateContext via the fetch opentelemetry option", async () => {
      fetchMock.mockResolvedValue(jsonResponse(200, {}));
      await request({
        method: "GET",
        path: "/api/v2/players/by-tag/Somebody%234444",
        operationName: "players.getByTag",
        baseUrl: BASE_URL,
      });

      const init = fetchMock.mock.calls[0][1] as RequestInit;
      expect(init.opentelemetry).toEqual({
        spanName: "backend.players.getByTag.fetch",
        propagateContext: true,
        attributes: {
          "http.url": BASE_URL,
          "resource.name": "players.getByTag",
        },
      });
    });

    it("never lets @vercel/otel's fetch auto-instrumentation attach a path/query-bearing URL as a span attribute", async () => {
      // @vercel/otel's fetch instrumentation otherwise computes http.url/resource.name from the
      // real request URL, which can embed a PlayerTag/series ID/player ID (issue #10's
      // low-cardinality requirement) - the opentelemetry.attributes override in transport.ts must
      // redact both to values that never contain options.path.
      fetchMock.mockResolvedValue(jsonResponse(200, {}));
      const sensitivePath = "/api/v2/players/by-tag/Somebody%234444";
      await request({
        method: "GET",
        path: sensitivePath,
        operationName: "players.getByTag",
        baseUrl: BASE_URL,
      });

      const init = fetchMock.mock.calls[0][1] as RequestInit;
      const attributes = init.opentelemetry?.attributes as
        Record<string, unknown> | undefined;
      expect(attributes?.["http.url"]).not.toContain("Somebody");
      expect(attributes?.["resource.name"]).not.toContain("Somebody");
      for (const value of Object.values(attributes ?? {})) {
        expect(String(value)).not.toContain(sensitivePath);
      }
    });

    it("does not throw when the OTel SDK isn't registered (no-op tracer)", async () => {
      fetchMock.mockResolvedValue(jsonResponse(200, {}));
      await expect(
        request({
          method: "GET",
          path: "/x",
          operationName: "test.op",
          baseUrl: BASE_URL,
        }),
      ).resolves.toMatchObject({ kind: "success" });
    });
  });

  describe("ProblemDetails / error normalization", () => {
    it("classifies a 400 ProblemDetails with code and traceId", async () => {
      fetchMock.mockResolvedValue(
        jsonResponse(400, {
          title: "Bad input.",
          code: "validation_failed",
          traceId: "trace-1",
        }),
      );
      const result = await request({
        method: "POST",
        path: "/x",
        operationName: "test.op",
        baseUrl: BASE_URL,
      });
      expect(result).toEqual({
        kind: "error",
        error: {
          kind: "http",
          httpStatus: 400,
          code: "validation_failed",
          safeMessage: "Bad input.",
          traceId: "trace-1",
          fieldErrors: undefined,
          retryAfterMs: undefined,
        },
      });
    });

    it("classifies a 401 with an empty body using a safe generic message", async () => {
      fetchMock.mockResolvedValue(new Response(null, { status: 401 }));
      const result = await request({
        method: "GET",
        path: "/x",
        operationName: "test.op",
        baseUrl: BASE_URL,
      });
      expect(result.kind).toBe("error");
      if (result.kind === "error" && result.error.kind === "http") {
        expect(result.error.httpStatus).toBe(401);
        expect(result.error.safeMessage).toBe(
          "The request could not be completed.",
        );
        expect(result.error.code).toBeUndefined();
      }
    });

    it("classifies a 403 ProblemDetails", async () => {
      fetchMock.mockResolvedValue(
        jsonResponse(403, {
          title: "Not a friend.",
          code: "friendship_required",
        }),
      );
      const result = await request({
        method: "GET",
        path: "/x",
        operationName: "test.op",
        baseUrl: BASE_URL,
      });
      expect(result).toMatchObject({
        kind: "error",
        error: { kind: "http", httpStatus: 403, code: "friendship_required" },
      });
    });

    it("classifies a 404 ProblemDetails", async () => {
      fetchMock.mockResolvedValue(
        jsonResponse(404, { title: "Not found.", code: "not_found" }),
      );
      const result = await request({
        method: "GET",
        path: "/x",
        operationName: "test.op",
        baseUrl: BASE_URL,
      });
      expect(result).toMatchObject({
        kind: "error",
        error: { kind: "http", httpStatus: 404, code: "not_found" },
      });
    });

    it("classifies a 409 ProblemDetails", async () => {
      fetchMock.mockResolvedValue(
        jsonResponse(409, { title: "Conflict.", code: "conflict" }),
      );
      const result = await request({
        method: "POST",
        path: "/x",
        operationName: "test.op",
        baseUrl: BASE_URL,
      });
      expect(result).toMatchObject({
        kind: "error",
        error: { kind: "http", httpStatus: 409, code: "conflict" },
      });
    });

    it("parses a valid Retry-After on a 429", async () => {
      fetchMock.mockResolvedValue(
        new Response(null, { status: 429, headers: { "retry-after": "2" } }),
      );
      const result = await request({
        method: "GET",
        path: "/x",
        operationName: "test.op",
        baseUrl: BASE_URL,
      });
      expect(result).toMatchObject({
        kind: "error",
        error: { kind: "http", httpStatus: 429, retryAfterMs: 2000 },
      });
    });

    it("classifies a 500 ProblemDetails using Backend V2's generic title, never raw detail", async () => {
      fetchMock.mockResolvedValue(
        jsonResponse(500, {
          title: "An unexpected error occurred.",
          code: "error",
          traceId: "trace-2",
        }),
      );
      const result = await request({
        method: "GET",
        path: "/x",
        operationName: "test.op",
        baseUrl: BASE_URL,
      });
      expect(result).toMatchObject({
        kind: "error",
        error: {
          kind: "http",
          httpStatus: 500,
          safeMessage: "An unexpected error occurred.",
          traceId: "trace-2",
        },
      });
    });

    it("classifies a 502 with an HTML body from a reverse proxy without parsing it as JSON", async () => {
      fetchMock.mockResolvedValue(
        new Response("<html><body>Bad Gateway</body></html>", {
          status: 502,
          headers: { "content-type": "text/html" },
        }),
      );
      const result = await request({
        method: "GET",
        path: "/x",
        operationName: "test.op",
        baseUrl: BASE_URL,
      });
      expect(result).toEqual({
        kind: "error",
        error: {
          kind: "http",
          httpStatus: 502,
          code: undefined,
          safeMessage: "The request could not be completed.",
          traceId: undefined,
          fieldErrors: undefined,
          retryAfterMs: undefined,
        },
      });
    });

    it("classifies a 503 with an empty body", async () => {
      fetchMock.mockResolvedValue(new Response(null, { status: 503 }));
      const result = await request({
        method: "GET",
        path: "/x",
        operationName: "test.op",
        baseUrl: BASE_URL,
      });
      expect(result).toMatchObject({
        kind: "error",
        error: {
          kind: "http",
          httpStatus: 503,
          safeMessage: "The request could not be completed.",
        },
      });
    });

    it("never throws a secondary parsing failure on malformed JSON in an error body", async () => {
      fetchMock.mockResolvedValue(
        new Response("{not json", {
          status: 400,
          headers: { "content-type": "application/json" },
        }),
      );
      await expect(
        request({
          method: "GET",
          path: "/x",
          operationName: "test.op",
          baseUrl: BASE_URL,
        }),
      ).resolves.toMatchObject({
        kind: "error",
        error: {
          kind: "http",
          httpStatus: 400,
          safeMessage: "The request could not be completed.",
        },
      });
    });

    it("classifies a network failure", async () => {
      fetchMock.mockRejectedValue(new TypeError("fetch failed"));
      const result = await request({
        method: "GET",
        path: "/x",
        operationName: "test.op",
        baseUrl: BASE_URL,
      });
      expect(result).toEqual({ kind: "error", error: { kind: "network" } });
    });

    it("classifies a timeout distinctly from a network failure", async () => {
      fetchMock.mockImplementation(
        (_url: string, init: RequestInit) =>
          new Promise((_resolve, reject) => {
            init.signal?.addEventListener("abort", () => {
              reject(
                new DOMException("The operation was aborted", "TimeoutError"),
              );
            });
          }),
      );
      const result = await request({
        method: "GET",
        path: "/x",
        operationName: "test.op",
        baseUrl: BASE_URL,
        timeoutMs: 15,
      });
      expect(result).toEqual({ kind: "error", error: { kind: "timeout" } });
    });

    it("classifies a malformed success response (invalid JSON) as invalid_response, not a thrown error", async () => {
      fetchMock.mockResolvedValue(
        new Response("not json", {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      );
      const result = await request({
        method: "GET",
        path: "/x",
        operationName: "test.op",
        baseUrl: BASE_URL,
      });
      expect(result).toEqual({
        kind: "error",
        error: { kind: "invalid_response", httpStatus: 200 },
      });
    });

    it("classifies a 200 with no recognizable JSON content-type as invalid_response", async () => {
      fetchMock.mockResolvedValue(
        new Response("<html>ok</html>", {
          status: 200,
          headers: { "content-type": "text/html" },
        }),
      );
      const result = await request({
        method: "GET",
        path: "/x",
        operationName: "test.op",
        baseUrl: BASE_URL,
      });
      expect(result).toEqual({
        kind: "error",
        error: { kind: "invalid_response", httpStatus: 200 },
      });
    });

    it("classifies a 200 with a genuinely empty body as invalid_response, not a false success (issue #4 review Problem 1)", async () => {
      // Backend V2 only ever sends an empty body on 204 (logout/accept/decline/cancel/remove).
      // A 200 is never intentionally empty, so this must not be treated the same as a real 204 -
      // doing so previously let a malformed login/refresh response through as
      // { kind: "success", data: undefined }, corrupting the session (Date.parse(undefined) is
      // NaN, which isAccessTokenExpired then treats as never-expiring).
      fetchMock.mockResolvedValue(
        new Response(null, {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      );
      const result = await request({
        method: "POST",
        path: "/x",
        operationName: "test.op",
        baseUrl: BASE_URL,
      });
      expect(result).toEqual({
        kind: "error",
        error: { kind: "invalid_response", httpStatus: 200 },
      });
    });

    it("still treats a 204 as a real, intentional success with no payload", async () => {
      fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
      const result = await request({
        method: "POST",
        path: "/x",
        operationName: "test.op",
        baseUrl: BASE_URL,
      });
      expect(result).toEqual({ kind: "success", status: 204, data: undefined });
    });
  });

  describe("retry", () => {
    const fastRetry: RetryPolicy = {
      maxAttempts: 3,
      baseDelayMs: 1,
      maxDelayMs: 5,
    };

    it("retries a transient failure for a safe read and eventually succeeds", async () => {
      fetchMock
        .mockResolvedValueOnce(new Response(null, { status: 503 }))
        .mockResolvedValueOnce(new Response(null, { status: 503 }))
        .mockResolvedValueOnce(jsonResponse(200, { ok: true }));

      const result = await request({
        method: "GET",
        path: "/x",
        operationName: "test.op",
        baseUrl: BASE_URL,
        retry: fastRetry,
      });
      expect(result).toEqual({
        kind: "success",
        status: 200,
        data: { ok: true },
      });
      expect(fetchMock).toHaveBeenCalledTimes(3);
    });

    it("does not retry a 404, even with a retry policy supplied", async () => {
      fetchMock.mockResolvedValue(
        jsonResponse(404, { title: "Not found.", code: "not_found" }),
      );
      const result = await request({
        method: "GET",
        path: "/x",
        operationName: "test.op",
        baseUrl: BASE_URL,
        retry: SAFE_READ_RETRY_POLICY,
      });
      expect(result).toMatchObject({
        kind: "error",
        error: { kind: "http", httpStatus: 404 },
      });
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("does not retry a mutation (no retry policy passed at all)", async () => {
      fetchMock.mockResolvedValue(new Response(null, { status: 503 }));
      const result = await request({
        method: "POST",
        path: "/x",
        operationName: "test.op",
        baseUrl: BASE_URL,
      });
      expect(result).toMatchObject({
        kind: "error",
        error: { kind: "http", httpStatus: 503 },
      });
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("retries a 429 when Retry-After is present and valid", async () => {
      fetchMock
        .mockResolvedValueOnce(
          new Response(null, { status: 429, headers: { "retry-after": "0" } }),
        )
        .mockResolvedValueOnce(jsonResponse(200, { ok: true }));

      const result = await request({
        method: "GET",
        path: "/x",
        operationName: "test.op",
        baseUrl: BASE_URL,
        retry: fastRetry,
      });
      expect(result).toEqual({
        kind: "success",
        status: 200,
        data: { ok: true },
      });
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it("does not retry a 429 without a Retry-After header", async () => {
      fetchMock.mockResolvedValue(new Response(null, { status: 429 }));
      const result = await request({
        method: "GET",
        path: "/x",
        operationName: "test.op",
        baseUrl: BASE_URL,
        retry: fastRetry,
      });
      expect(result).toMatchObject({
        kind: "error",
        error: { kind: "http", httpStatus: 429 },
      });
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("does not retry a 500 by default", async () => {
      fetchMock.mockResolvedValue(
        jsonResponse(500, {
          title: "An unexpected error occurred.",
          code: "error",
        }),
      );
      const result = await request({
        method: "GET",
        path: "/x",
        operationName: "test.op",
        baseUrl: BASE_URL,
        retry: fastRetry,
      });
      expect(result).toMatchObject({
        kind: "error",
        error: { kind: "http", httpStatus: 500 },
      });
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("stops retrying once maxAttempts is exhausted", async () => {
      fetchMock.mockResolvedValue(new Response(null, { status: 503 }));
      const result = await request({
        method: "GET",
        path: "/x",
        operationName: "test.op",
        baseUrl: BASE_URL,
        retry: fastRetry,
      });
      expect(result).toMatchObject({
        kind: "error",
        error: { kind: "http", httpStatus: 503 },
      });
      expect(fetchMock).toHaveBeenCalledTimes(fastRetry.maxAttempts);
    });

    // Issue #10 retry/timeout certification - pinning tests for behavior transport.ts already
    // implements, not new logic. 503 above already covers isRetryableStatus's general shape;
    // 408/502/504 are the other three members of that same allowlist and hadn't been exercised.
    it.each([408, 502, 504])(
      "retries a %i, the same as 503",
      async (status) => {
        fetchMock
          .mockResolvedValueOnce(new Response(null, { status }))
          .mockResolvedValueOnce(jsonResponse(200, { ok: true }));

        const result = await request({
          method: "GET",
          path: "/x",
          operationName: "test.op",
          baseUrl: BASE_URL,
          retry: fastRetry,
        });
        expect(result).toEqual({
          kind: "success",
          status: 200,
          data: { ok: true },
        });
        expect(fetchMock).toHaveBeenCalledTimes(2);
      },
    );

    it("bounded-retries an actual network failure (not just an HTTP status) and eventually succeeds", async () => {
      fetchMock
        .mockRejectedValueOnce(new TypeError("fetch failed"))
        .mockRejectedValueOnce(new TypeError("fetch failed"))
        .mockResolvedValueOnce(jsonResponse(200, { ok: true }));

      const result = await request({
        method: "GET",
        path: "/x",
        operationName: "test.op",
        baseUrl: BASE_URL,
        retry: fastRetry,
      });
      expect(result).toEqual({
        kind: "success",
        status: 200,
        data: { ok: true },
      });
      expect(fetchMock).toHaveBeenCalledTimes(3);
    });

    it("exhausts maxAttempts on a network failure that never recovers", async () => {
      fetchMock.mockRejectedValue(new TypeError("fetch failed"));

      const result = await request({
        method: "GET",
        path: "/x",
        operationName: "test.op",
        baseUrl: BASE_URL,
        retry: fastRetry,
      });
      expect(result).toEqual({ kind: "error", error: { kind: "network" } });
      expect(fetchMock).toHaveBeenCalledTimes(fastRetry.maxAttempts);
    });

    it("never retries a timeout, even with a retry policy supplied", async () => {
      fetchMock.mockImplementation(
        (_url: string, init: RequestInit) =>
          new Promise((_resolve, reject) => {
            init.signal?.addEventListener("abort", () => {
              reject(
                new DOMException("The operation was aborted", "TimeoutError"),
              );
            });
          }),
      );

      const result = await request({
        method: "GET",
        path: "/x",
        operationName: "test.op",
        baseUrl: BASE_URL,
        timeoutMs: 15,
        retry: fastRetry,
      });
      expect(result).toEqual({ kind: "error", error: { kind: "timeout" } });
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
  });

  describe("caller cancellation", () => {
    it("stops on caller cancellation and never retries", async () => {
      const controller = new AbortController();
      fetchMock.mockImplementation(
        (_url: string, init: RequestInit) =>
          new Promise((_resolve, reject) => {
            init.signal?.addEventListener("abort", () => {
              reject(
                new DOMException("The operation was aborted", "AbortError"),
              );
            });
          }),
      );

      const pending = request({
        method: "GET",
        path: "/x",
        operationName: "test.op",
        baseUrl: BASE_URL,
        signal: controller.signal,
        retry: SAFE_READ_RETRY_POLICY,
      });
      controller.abort();

      const result = await pending;
      expect(result).toEqual({ kind: "error", error: { kind: "cancelled" } });
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
  });

  describe("trace propagation", () => {
    it("forwards a valid traceparent/tracestate", async () => {
      fetchMock.mockResolvedValue(jsonResponse(200, { ok: true }));
      await request({
        method: "GET",
        path: "/x",
        operationName: "test.op",
        baseUrl: BASE_URL,
        trace: {
          traceparent:
            "00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01",
          tracestate: "vendor=value",
        },
      });
      const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      const headers = init.headers as Record<string, string>;
      expect(headers.traceparent).toBe(
        "00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01",
      );
      expect(headers.tracestate).toBe("vendor=value");
    });

    it("drops a malformed traceparent instead of forwarding it", async () => {
      fetchMock.mockResolvedValue(jsonResponse(200, { ok: true }));
      await request({
        method: "GET",
        path: "/x",
        operationName: "test.op",
        baseUrl: BASE_URL,
        trace: { traceparent: "not-a-real-traceparent" },
      });
      const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      const headers = init.headers as Record<string, string>;
      expect(headers.traceparent).toBeUndefined();
    });

    it("never emits a proprietary correlation header", async () => {
      fetchMock.mockResolvedValue(jsonResponse(200, { ok: true }));
      await request({
        method: "GET",
        path: "/x",
        operationName: "test.op",
        baseUrl: BASE_URL,
        trace: {
          traceparent:
            "00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01",
        },
      });
      const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      const headerNames = Object.keys(
        init.headers as Record<string, string>,
      ).map((h) => h.toLowerCase());
      expect(headerNames.some((h) => h.includes("correlation"))).toBe(false);
      expect(headerNames).not.toContain("baggage");
    });
  });
});
