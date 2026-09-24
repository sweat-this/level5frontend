import { afterEach, describe, expect, it, vi } from "vitest";
import { sessionCookieName } from "@/lib/web-auth/cookie-policy";

const getAccessTokenMock = vi.fn();
const cookiesGetMock = vi.fn();
const headersGetMock = vi.fn();

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({ get: cookiesGetMock })),
  headers: vi.fn(async () => ({ get: headersGetMock })),
}));

const tryGetWebSessionCoordinatorMock = vi.fn(
  async (): Promise<{ getAccessToken: typeof getAccessTokenMock } | null> => ({
    getAccessToken: getAccessTokenMock,
  }),
);

vi.mock("@/lib/web-auth/session-coordinator-runtime", () => ({
  tryGetWebSessionCoordinator: tryGetWebSessionCoordinatorMock,
}));

const { resolveAuthenticatedBackendAccess } = await import("./backend-access");

afterEach(() => {
  vi.clearAllMocks();
});

describe("resolveAuthenticatedBackendAccess", () => {
  it("returns unauthenticated when no session cookie is present", async () => {
    cookiesGetMock.mockReturnValue(undefined);

    expect(await resolveAuthenticatedBackendAccess()).toEqual({
      kind: "unauthenticated",
    });
    expect(getAccessTokenMock).not.toHaveBeenCalled();
  });

  it("reads the configured session cookie name", async () => {
    cookiesGetMock.mockReturnValue(undefined);
    await resolveAuthenticatedBackendAccess();
    expect(cookiesGetMock).toHaveBeenCalledWith(sessionCookieName());
  });

  it("maps a ready token through unchanged", async () => {
    cookiesGetMock.mockReturnValue({ value: "session-id" });
    getAccessTokenMock.mockResolvedValue({
      kind: "ready",
      accessToken: "at-1",
    });

    expect(await resolveAuthenticatedBackendAccess()).toEqual({
      kind: "ready",
      accessToken: "at-1",
    });
  });

  it("maps not_found to unauthenticated", async () => {
    cookiesGetMock.mockReturnValue({ value: "session-id" });
    getAccessTokenMock.mockResolvedValue({ kind: "not_found" });

    expect(await resolveAuthenticatedBackendAccess()).toEqual({
      kind: "unauthenticated",
    });
  });

  it("maps reauthentication_required to unauthenticated", async () => {
    cookiesGetMock.mockReturnValue({ value: "session-id" });
    getAccessTokenMock.mockResolvedValue({
      kind: "reauthentication_required",
    });

    expect(await resolveAuthenticatedBackendAccess()).toEqual({
      kind: "unauthenticated",
    });
  });

  it("maps unavailable to unavailable - never treated as unauthenticated", async () => {
    cookiesGetMock.mockReturnValue({ value: "session-id" });
    getAccessTokenMock.mockResolvedValue({ kind: "unavailable" });

    expect(await resolveAuthenticatedBackendAccess()).toEqual({
      kind: "unavailable",
    });
  });

  it("maps throttled to throttled", async () => {
    cookiesGetMock.mockReturnValue({ value: "session-id" });
    getAccessTokenMock.mockResolvedValue({ kind: "throttled" });

    expect(await resolveAuthenticatedBackendAccess()).toEqual({
      kind: "throttled",
    });
  });

  it("maps a coordinator construction failure (e.g. Redis unreachable) to unavailable, not an uncaught rejection", async () => {
    cookiesGetMock.mockReturnValue({ value: "session-id" });
    tryGetWebSessionCoordinatorMock.mockResolvedValueOnce(null);

    expect(await resolveAuthenticatedBackendAccess()).toEqual({
      kind: "unavailable",
    });
    expect(getAccessTokenMock).not.toHaveBeenCalled();
  });
});
