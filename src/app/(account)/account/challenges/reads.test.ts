import { afterEach, describe, expect, it, vi } from "vitest";

const listIncomingMock = vi.fn();
const listOutgoingMock = vi.fn();
const listActiveMock = vi.fn();
const listCompletedMock = vi.fn();

vi.mock("@/lib/backend-v2/resources/series", () => ({
  listIncoming: (...args: unknown[]) => listIncomingMock(...args),
  listOutgoing: (...args: unknown[]) => listOutgoingMock(...args),
  listActive: (...args: unknown[]) => listActiveMock(...args),
  listCompleted: (...args: unknown[]) => listCompletedMock(...args),
}));

const { resolveChallengesList, CHALLENGES_LOGIN_REDIRECT } =
  await import("./reads");

afterEach(() => {
  vi.clearAllMocks();
});

function successPage(nextCursor: string | null = null) {
  return {
    kind: "success" as const,
    status: 200,
    data: { items: [{ id: "series-1" }], limit: 20, nextCursor },
  };
}

describe("resolveChallengesList", () => {
  it.each([
    ["incoming", () => listIncomingMock],
    ["outgoing", () => listOutgoingMock],
    ["active", () => listActiveMock],
    ["completed", () => listCompletedMock],
  ] as const)(
    "calls exactly the %s list resource for that view",
    async (view, mock) => {
      mock().mockResolvedValue(successPage());
      const others = [
        listIncomingMock,
        listOutgoingMock,
        listActiveMock,
        listCompletedMock,
      ].filter((candidate) => candidate !== mock());

      await resolveChallengesList(view, undefined, "token");

      expect(mock()).toHaveBeenCalledTimes(1);
      for (const other of others) {
        expect(other).not.toHaveBeenCalled();
      }
    },
  );

  it("omits cursor from the request when none is given (uses Backend's default limit)", async () => {
    listIncomingMock.mockResolvedValue(successPage());
    await resolveChallengesList("incoming", undefined, "token");
    expect(listIncomingMock).toHaveBeenCalledWith("token", undefined);
  });

  it("passes an opaque cursor back to Backend V2 verbatim", async () => {
    listActiveMock.mockResolvedValue(successPage());
    await resolveChallengesList("active", "opaque-cursor==", "token");
    expect(listActiveMock).toHaveBeenCalledWith("token", {
      cursor: "opaque-cursor==",
    });
  });

  it("returns data with items and nextCursor on success", async () => {
    listCompletedMock.mockResolvedValue(successPage("next-cursor=="));
    const result = await resolveChallengesList("completed", undefined, "token");
    expect(result).toEqual({
      kind: "data",
      items: [{ id: "series-1" }],
      nextCursor: "next-cursor==",
    });
  });

  it("returns a null nextCursor as the terminal page (no manufactured page number)", async () => {
    listOutgoingMock.mockResolvedValue(successPage(null));
    const result = await resolveChallengesList("outgoing", undefined, "token");
    expect(result).toMatchObject({ kind: "data", nextCursor: null });
  });

  it("redirects to login on a 401", async () => {
    listIncomingMock.mockResolvedValue({
      kind: "error",
      error: { kind: "http", httpStatus: 401, safeMessage: "Unauthorized" },
    });
    const result = await resolveChallengesList("incoming", undefined, "token");
    expect(result).toEqual({
      kind: "redirect",
      path: CHALLENGES_LOGIN_REDIRECT,
    });
  });

  it("reports invalid-cursor on a 400 (malformed or cross-category cursor)", async () => {
    listActiveMock.mockResolvedValue({
      kind: "error",
      error: {
        kind: "http",
        httpStatus: 400,
        safeMessage: "The provided pagination cursor is invalid.",
      },
    });
    const result = await resolveChallengesList(
      "active",
      "cursor-from-completed==",
      "token",
    );
    expect(result).toEqual({ kind: "invalid-cursor" });
  });

  it("reports a throttled message on a 429", async () => {
    listIncomingMock.mockResolvedValue({
      kind: "error",
      error: {
        kind: "http",
        httpStatus: 429,
        safeMessage: "Too Many Requests",
      },
    });
    const result = await resolveChallengesList("incoming", undefined, "token");
    expect(result.kind).toBe("message");
    expect((result as { message: string }).message).toMatch(/wait a moment/i);
  });

  it("reports a temporarily-unavailable message on a 5xx", async () => {
    listIncomingMock.mockResolvedValue({
      kind: "error",
      error: {
        kind: "http",
        httpStatus: 503,
        safeMessage: "Service Unavailable",
      },
    });
    const result = await resolveChallengesList("incoming", undefined, "token");
    expect(result.kind).toBe("message");
    expect((result as { message: string }).message).toMatch(
      /try again shortly/i,
    );
  });

  it.each(["timeout", "network", "invalid_response", "cancelled"] as const)(
    "reports a temporarily-unavailable message on a %s transport failure",
    async (kind) => {
      listIncomingMock.mockResolvedValue({
        kind: "error",
        error:
          kind === "invalid_response" ? { kind, httpStatus: 200 } : { kind },
      });
      const result = await resolveChallengesList(
        "incoming",
        undefined,
        "token",
      );
      expect(result).toEqual({
        kind: "message",
        message: "This isn't available right now. Please try again shortly.",
      });
    },
  );
});
