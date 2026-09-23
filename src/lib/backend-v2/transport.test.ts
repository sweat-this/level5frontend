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
        request({ method: "GET", path: "/x", baseUrl: BASE_URL }),
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
        baseUrl: BASE_URL,
      });
      expect(result).toEqual({
        kind: "error",
        error: { kind: "invalid_response", httpStatus: 200 },
      });
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
        baseUrl: BASE_URL,
        retry: fastRetry,
      });
      expect(result).toMatchObject({
        kind: "error",
        error: { kind: "http", httpStatus: 503 },
      });
      expect(fetchMock).toHaveBeenCalledTimes(fastRetry.maxAttempts);
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
