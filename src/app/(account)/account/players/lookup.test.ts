import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { vi } from "vitest";

const resolveAuthenticatedBackendAccessMock = vi.fn();
const getByTagMock = vi.fn();

vi.mock("@/lib/account/backend-access", () => ({
  resolveAuthenticatedBackendAccess: () =>
    resolveAuthenticatedBackendAccessMock(),
}));

vi.mock("@/lib/backend-v2/resources/players", () => ({
  getByTag: (tag: string, accessToken: string) =>
    getByTagMock(tag, accessToken),
}));

const { resolvePlayerLookup, loginRedirectFor } = await import("./lookup");

beforeEach(() => {
  resolveAuthenticatedBackendAccessMock.mockResolvedValue({
    kind: "ready",
    accessToken: "at-1",
  });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("loginRedirectFor", () => {
  it("URL-encodes a tag containing '#' rather than interpolating it raw", () => {
    const redirect = loginRedirectFor("Patrick#4827");
    expect(redirect).toBe(
      "/account/login?returnTo=%2Faccount%2Fplayers%3Ftag%3DPatrick%25234827",
    );
  });

  it("omits the tag query param when no tag was supplied", () => {
    expect(loginRedirectFor(undefined)).toBe(
      "/account/login?returnTo=%2Faccount%2Fplayers",
    );
  });
});

describe("resolvePlayerLookup", () => {
  it("redirects to login when unauthenticated, preserving the searched tag", async () => {
    resolveAuthenticatedBackendAccessMock.mockResolvedValue({
      kind: "unauthenticated",
    });

    const outcome = await resolvePlayerLookup("Patrick#4827");

    expect(outcome).toEqual({
      kind: "redirect",
      path: loginRedirectFor("Patrick#4827"),
    });
    expect(getByTagMock).not.toHaveBeenCalled();
  });

  it("reports unavailable as a message, never an error page", async () => {
    resolveAuthenticatedBackendAccessMock.mockResolvedValue({
      kind: "unavailable",
    });

    const outcome = await resolvePlayerLookup("Patrick#4827");

    expect(outcome.kind).toBe("message");
    expect(getByTagMock).not.toHaveBeenCalled();
  });

  it("reports throttled as a message", async () => {
    resolveAuthenticatedBackendAccessMock.mockResolvedValue({
      kind: "throttled",
    });

    const outcome = await resolvePlayerLookup("Patrick#4827");

    expect(outcome.kind).toBe("message");
    expect(outcome).toMatchObject({
      message: expect.stringMatching(/wait a moment/i),
    });
    expect(getByTagMock).not.toHaveBeenCalled();
  });

  it("returns the found player's display name and canonical tag", async () => {
    getByTagMock.mockResolvedValue({
      kind: "success",
      status: 200,
      data: { playerId: "p1", displayName: "Patrick", tag: "Patrick#4827" },
    });

    const outcome = await resolvePlayerLookup("patrick#4827");

    expect(outcome).toEqual({
      kind: "found",
      displayName: "Patrick",
      tag: "Patrick#4827",
    });
    expect(getByTagMock).toHaveBeenCalledWith("patrick#4827", "at-1");
  });

  it("maps a 400 to an invalid-tag message", async () => {
    getByTagMock.mockResolvedValue({
      kind: "error",
      error: { kind: "http", httpStatus: 400, safeMessage: "Invalid tag" },
    });

    const outcome = await resolvePlayerLookup("not-a-tag");

    expect(outcome).toEqual({
      kind: "message",
      message: "That doesn't look like a valid Player Tag.",
    });
  });

  it("maps a 404 to a not-found message", async () => {
    getByTagMock.mockResolvedValue({
      kind: "error",
      error: { kind: "http", httpStatus: 404, safeMessage: "Not found" },
    });

    const outcome = await resolvePlayerLookup("Nobody#9999");

    expect(outcome).toEqual({
      kind: "message",
      message: "No player was found with that tag.",
    });
  });

  it("redirects to login when Backend V2 itself returns 401", async () => {
    getByTagMock.mockResolvedValue({
      kind: "error",
      error: { kind: "http", httpStatus: 401, safeMessage: "Unauthorized" },
    });

    const outcome = await resolvePlayerLookup("Patrick#4827");

    expect(outcome).toEqual({
      kind: "redirect",
      path: loginRedirectFor("Patrick#4827"),
    });
  });

  it("maps a 429 to a throttled message", async () => {
    getByTagMock.mockResolvedValue({
      kind: "error",
      error: {
        kind: "http",
        httpStatus: 429,
        safeMessage: "Too Many Requests",
      },
    });

    const outcome = await resolvePlayerLookup("Patrick#4827");

    expect(outcome.kind).toBe("message");
    expect(outcome).toMatchObject({
      message: expect.stringMatching(/wait a moment/i),
    });
  });

  it.each(["timeout", "network", "invalid_response"] as const)(
    "maps a %s failure to a temporarily-unavailable message",
    async (kind) => {
      getByTagMock.mockResolvedValue({
        kind: "error",
        error:
          kind === "invalid_response" ? { kind, httpStatus: 200 } : { kind },
      });

      const outcome = await resolvePlayerLookup("Patrick#4827");

      expect(outcome).toEqual({
        kind: "message",
        message: "This isn't available right now. Please try again shortly.",
      });
    },
  );
});
