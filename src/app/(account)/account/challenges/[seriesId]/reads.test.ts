import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const resolveAuthenticatedBackendAccessMock = vi.fn();
const getSeriesMock = vi.fn();

vi.mock("@/lib/account/backend-access", () => ({
  resolveAuthenticatedBackendAccess: () =>
    resolveAuthenticatedBackendAccessMock(),
}));

vi.mock("@/lib/backend-v2/resources/series", () => ({
  getSeries: (seriesId: string, accessToken: string) =>
    getSeriesMock(seriesId, accessToken),
}));

const { resolveSeriesDetail, loginRedirectFor } = await import("./reads");

afterEach(() => {
  vi.clearAllMocks();
});

describe("loginRedirectFor", () => {
  it("preserves the series id as an encoded returnTo", () => {
    expect(loginRedirectFor("series-1")).toBe(
      "/account/login?returnTo=%2Faccount%2Fchallenges%2Fseries-1",
    );
  });
});

describe("resolveSeriesDetail", () => {
  it("redirects to login when there is no local session, without calling Backend V2", async () => {
    resolveAuthenticatedBackendAccessMock.mockResolvedValue({
      kind: "unauthenticated",
    });

    const result = await resolveSeriesDetail("series-1");

    expect(result).toEqual({
      kind: "redirect",
      path: loginRedirectFor("series-1"),
    });
    expect(getSeriesMock).not.toHaveBeenCalled();
  });

  it("reports a temporary failure when the session store is unavailable", async () => {
    resolveAuthenticatedBackendAccessMock.mockResolvedValue({
      kind: "unavailable",
    });

    const result = await resolveSeriesDetail("series-1");

    expect(result.kind).toBe("message");
    expect(getSeriesMock).not.toHaveBeenCalled();
  });

  it("reports a throttled message when session resolution is throttled", async () => {
    resolveAuthenticatedBackendAccessMock.mockResolvedValue({
      kind: "throttled",
    });

    const result = await resolveSeriesDetail("series-1");

    expect(result.kind).toBe("message");
    expect((result as { message: string }).message).toMatch(/wait a moment/i);
    expect(getSeriesMock).not.toHaveBeenCalled();
  });

  describe("with a ready session", () => {
    beforeEach(() => {
      resolveAuthenticatedBackendAccessMock.mockResolvedValue({
        kind: "ready",
        accessToken: "at-1",
      });
    });

    it("calls getSeries exactly once and returns its data on success", async () => {
      getSeriesMock.mockResolvedValue({
        kind: "success",
        status: 200,
        data: { id: "series-1" },
      });

      const result = await resolveSeriesDetail("series-1");

      expect(result).toEqual({ kind: "data", series: { id: "series-1" } });
      expect(getSeriesMock).toHaveBeenCalledTimes(1);
      expect(getSeriesMock).toHaveBeenCalledWith("series-1", "at-1");
    });

    it("redirects to login when Backend V2 itself returns 401", async () => {
      getSeriesMock.mockResolvedValue({
        kind: "error",
        error: { kind: "http", httpStatus: 401, safeMessage: "Unauthorized" },
      });

      const result = await resolveSeriesDetail("series-1");

      expect(result).toEqual({
        kind: "redirect",
        path: loginRedirectFor("series-1"),
      });
    });

    it("never distinguishes not-found from not-a-participant on a 404", async () => {
      getSeriesMock.mockResolvedValue({
        kind: "error",
        error: { kind: "http", httpStatus: 404, safeMessage: "Not Found" },
      });

      const result = await resolveSeriesDetail("series-1");

      expect(result).toEqual({
        kind: "message",
        message: "Series not found or unavailable.",
      });
    });

    it("reports a throttled message on a 429", async () => {
      getSeriesMock.mockResolvedValue({
        kind: "error",
        error: {
          kind: "http",
          httpStatus: 429,
          safeMessage: "Too Many Requests",
        },
      });

      const result = await resolveSeriesDetail("series-1");

      expect(result.kind).toBe("message");
      expect((result as { message: string }).message).toMatch(/wait a moment/i);
    });

    it("reports a temporarily-unavailable message on a 5xx", async () => {
      getSeriesMock.mockResolvedValue({
        kind: "error",
        error: {
          kind: "http",
          httpStatus: 503,
          safeMessage: "Service Unavailable",
        },
      });

      const result = await resolveSeriesDetail("series-1");

      expect(result).toEqual({
        kind: "message",
        message: "This isn't available right now. Please try again shortly.",
      });
    });

    it.each(["timeout", "network", "invalid_response", "cancelled"] as const)(
      "reports a temporarily-unavailable message on a %s, never signing the player out",
      async (kind) => {
        getSeriesMock.mockResolvedValue({
          kind: "error",
          error:
            kind === "invalid_response" ? { kind, httpStatus: 200 } : { kind },
        });

        const result = await resolveSeriesDetail("series-1");

        expect(result).toEqual({
          kind: "message",
          message: "This isn't available right now. Please try again shortly.",
        });
      },
    );
  });
});
