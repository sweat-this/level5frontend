import { afterEach, describe, expect, it, vi } from "vitest";
import { sessionCookieName } from "@/lib/web-auth/cookie-policy";

const cookiesGetMock = vi.fn();

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({ get: cookiesGetMock })),
}));

const { GET } = await import("./route");

afterEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/session-presence", () => {
  it("returns signedIn: false when no session cookie is present", async () => {
    cookiesGetMock.mockReturnValue(undefined);

    const response = await GET();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ signedIn: false });
  });

  it("returns signedIn: true when the session cookie is present", async () => {
    cookiesGetMock.mockReturnValue({ value: "some-opaque-session-id" });

    const response = await GET();

    expect(await response.json()).toEqual({ signedIn: true });
  });

  it("reads the configured session cookie by name only, never its value", async () => {
    cookiesGetMock.mockReturnValue({ value: "some-opaque-session-id" });

    const body = JSON.stringify(await (await GET()).json());

    expect(cookiesGetMock).toHaveBeenCalledWith(sessionCookieName());
    expect(cookiesGetMock).toHaveBeenCalledTimes(1);
    expect(body).not.toContain("some-opaque-session-id");
  });

  it("responds with a boolean-only body - no account/player data", async () => {
    cookiesGetMock.mockReturnValue({ value: "some-opaque-session-id" });

    const body = (await (await GET()).json()) as Record<string, unknown>;

    expect(Object.keys(body)).toEqual(["signedIn"]);
    expect(typeof body.signedIn).toBe("boolean");
  });

  it("marks the response private, no-store", async () => {
    cookiesGetMock.mockReturnValue(undefined);

    const response = await GET();

    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });
});
