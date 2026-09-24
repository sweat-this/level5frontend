import { afterEach, describe, expect, it, vi } from "vitest";
import { sessionCookieName } from "@/lib/web-auth/cookie-policy";

const getMeMock = vi.fn();
const cookiesGetMock = vi.fn();
const headersGetMock = vi.fn();

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({ get: cookiesGetMock })),
  headers: vi.fn(async () => ({ get: headersGetMock })),
}));

const tryGetWebSessionCoordinatorMock = vi.fn(
  async (): Promise<{ getMe: typeof getMeMock } | null> => ({
    getMe: getMeMock,
  }),
);

vi.mock("@/lib/web-auth/session-coordinator-runtime", () => ({
  tryGetWebSessionCoordinator: tryGetWebSessionCoordinatorMock,
}));

const { resolveCurrentAccountSession } = await import("./session-resolution");

afterEach(() => {
  vi.clearAllMocks();
});

describe("resolveCurrentAccountSession", () => {
  it("returns unauthenticated when no session cookie is present", async () => {
    cookiesGetMock.mockReturnValue(undefined);

    expect(await resolveCurrentAccountSession()).toEqual({
      kind: "unauthenticated",
    });
    expect(getMeMock).not.toHaveBeenCalled();
  });

  it("reads the configured session cookie name", async () => {
    cookiesGetMock.mockReturnValue(undefined);
    await resolveCurrentAccountSession();
    expect(cookiesGetMock).toHaveBeenCalledWith(sessionCookieName());
  });

  it("maps a successful getMe to authenticated", async () => {
    cookiesGetMock.mockReturnValue({ value: "session-id" });
    const account = {
      accountId: "a1",
      username: "player1",
      status: "Active",
      playerId: "p1",
      createdAt: "2025-01-01T00:00:00Z",
    };
    getMeMock.mockResolvedValue({ kind: "success", account });

    expect(await resolveCurrentAccountSession()).toEqual({
      kind: "authenticated",
      account,
    });
  });

  it("maps not_found to unauthenticated", async () => {
    cookiesGetMock.mockReturnValue({ value: "session-id" });
    getMeMock.mockResolvedValue({ kind: "not_found" });

    expect(await resolveCurrentAccountSession()).toEqual({
      kind: "unauthenticated",
    });
  });

  it("maps reauthentication_required to unauthenticated", async () => {
    cookiesGetMock.mockReturnValue({ value: "session-id" });
    getMeMock.mockResolvedValue({ kind: "reauthentication_required" });

    expect(await resolveCurrentAccountSession()).toEqual({
      kind: "unauthenticated",
    });
  });

  it("maps unavailable to unavailable - never treated as unauthenticated", async () => {
    cookiesGetMock.mockReturnValue({ value: "session-id" });
    getMeMock.mockResolvedValue({ kind: "unavailable" });

    expect(await resolveCurrentAccountSession()).toEqual({
      kind: "unavailable",
    });
  });

  it("maps throttled to throttled", async () => {
    cookiesGetMock.mockReturnValue({ value: "session-id" });
    getMeMock.mockResolvedValue({ kind: "throttled" });

    expect(await resolveCurrentAccountSession()).toEqual({
      kind: "throttled",
    });
  });

  it("maps a coordinator construction failure (e.g. Redis unreachable) to unavailable, not an uncaught rejection", async () => {
    cookiesGetMock.mockReturnValue({ value: "session-id" });
    tryGetWebSessionCoordinatorMock.mockResolvedValueOnce(null);

    expect(await resolveCurrentAccountSession()).toEqual({
      kind: "unavailable",
    });
    expect(getMeMock).not.toHaveBeenCalled();
  });
});
