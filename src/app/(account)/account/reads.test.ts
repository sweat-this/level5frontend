import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const resolveAuthenticatedBackendAccessMock = vi.fn();
const getMyProfileMock = vi.fn();

vi.mock("@/lib/account/backend-access", () => ({
  resolveAuthenticatedBackendAccess: () =>
    resolveAuthenticatedBackendAccessMock(),
}));

vi.mock("@/lib/backend-v2/resources/players", () => ({
  getMyProfile: (accessToken: string) => getMyProfileMock(accessToken),
}));

const { resolveIdentitySection } = await import("./reads");

beforeEach(() => {
  resolveAuthenticatedBackendAccessMock.mockResolvedValue({
    kind: "ready",
    accessToken: "at-1",
  });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("resolveIdentitySection", () => {
  it("redirects when there is no usable access token", async () => {
    resolveAuthenticatedBackendAccessMock.mockResolvedValue({
      kind: "unauthenticated",
    });

    expect(await resolveIdentitySection()).toEqual({ kind: "redirect" });
    expect(getMyProfileMock).not.toHaveBeenCalled();
  });

  it("reports an unavailable access dependency as a message, never a redirect", async () => {
    resolveAuthenticatedBackendAccessMock.mockResolvedValue({
      kind: "unavailable",
    });

    const result = await resolveIdentitySection();

    expect(result.kind).toBe("message");
    expect(getMyProfileMock).not.toHaveBeenCalled();
  });

  it("reports a throttled access dependency as a message", async () => {
    resolveAuthenticatedBackendAccessMock.mockResolvedValue({
      kind: "throttled",
    });

    const result = await resolveIdentitySection();

    expect(result.kind).toBe("message");
    expect(result).toMatchObject({
      message: expect.stringMatching(/wait a moment/i),
    });
    expect(getMyProfileMock).not.toHaveBeenCalled();
  });

  it("returns the resolved display name and tag on success", async () => {
    getMyProfileMock.mockResolvedValue({
      kind: "success",
      status: 200,
      data: { playerId: "p1", displayName: "Patrick", tag: "Patrick#4827" },
    });

    expect(await resolveIdentitySection()).toEqual({
      kind: "ready",
      displayName: "Patrick",
      tag: "Patrick#4827",
    });
    expect(getMyProfileMock).toHaveBeenCalledWith("at-1");
  });

  it("redirects to login when Backend V2 itself returns 401, never destroying the session silently as an ordinary failure", async () => {
    getMyProfileMock.mockResolvedValue({
      kind: "error",
      error: { kind: "http", httpStatus: 401, safeMessage: "Unauthorized" },
    });

    expect(await resolveIdentitySection()).toEqual({ kind: "redirect" });
  });

  it("maps a 429 profile failure to a throttled message", async () => {
    getMyProfileMock.mockResolvedValue({
      kind: "error",
      error: {
        kind: "http",
        httpStatus: 429,
        safeMessage: "Too Many Requests",
      },
    });

    const result = await resolveIdentitySection();

    expect(result.kind).toBe("message");
    expect(result).toMatchObject({
      message: expect.stringMatching(/wait a moment/i),
    });
  });

  it("degrades a temporary profile failure to a message, keeping the rest of the dashboard usable", async () => {
    getMyProfileMock.mockResolvedValue({
      kind: "error",
      error: {
        kind: "http",
        httpStatus: 500,
        safeMessage: "Internal Server Error",
      },
    });

    expect(await resolveIdentitySection()).toEqual({
      kind: "message",
      message: "This isn't available right now. Please try again shortly.",
    });
  });

  it.each(["timeout", "network", "invalid_response", "cancelled"] as const)(
    "maps a %s failure to a temporarily-unavailable message",
    async (kind) => {
      getMyProfileMock.mockResolvedValue({
        kind: "error",
        error:
          kind === "invalid_response" ? { kind, httpStatus: 200 } : { kind },
      });

      expect(await resolveIdentitySection()).toEqual({
        kind: "message",
        message: "This isn't available right now. Please try again shortly.",
      });
    },
  );
});
