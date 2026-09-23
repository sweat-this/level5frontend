import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sessionCookieName } from "@/lib/web-auth/cookie-policy";

const loginMock = vi.fn();
const logoutMock = vi.fn();
const headersGetMock = vi.fn();

function createCookieStore(initial: Record<string, string> = {}) {
  const entries = new Map(
    Object.entries(initial).map(([name, value]) => [name, { value }]),
  );
  return {
    get: vi.fn((name: string) => entries.get(name)),
    set: vi.fn((name: string, value: string) => {
      entries.set(name, { value });
    }),
    entries,
  };
}

let cookieStore = createCookieStore();

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => cookieStore),
  headers: vi.fn(async () => ({ get: headersGetMock })),
}));

vi.mock("next/navigation", () => ({
  redirect: vi.fn((path: string) => {
    throw new Error(`REDIRECT:${path}`);
  }),
}));

vi.mock("@/lib/web-auth/config", () => ({
  getAccountRuntimeConfig: vi.fn(() => ({
    backendBaseUrl: "http://backend.test",
    appOrigin: "http://localhost:3000",
  })),
}));

const tryGetWebSessionCoordinatorMock = vi.fn(
  async (): Promise<{
    login: typeof loginMock;
    logout: typeof logoutMock;
  } | null> => ({
    login: loginMock,
    logout: logoutMock,
  }),
);

vi.mock("@/lib/web-auth/session-coordinator-runtime", () => ({
  tryGetWebSessionCoordinator: tryGetWebSessionCoordinatorMock,
}));

const { loginAction } = await import("./actions");
const { redirect } = await import("next/navigation");

function formData(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    data.set(key, value);
  }
  return data;
}

beforeEach(() => {
  cookieStore = createCookieStore();
  headersGetMock.mockReturnValue("http://localhost:3000");
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("loginAction", () => {
  it("rejects a mismatched Origin without calling the coordinator", async () => {
    headersGetMock.mockReturnValue("http://evil.example");

    const result = await loginAction(
      { status: "idle" },
      formData({ username: "user", password: "password123" }),
    );

    expect(result.status).toBe("error");
    expect(loginMock).not.toHaveBeenCalled();
  });

  it("rejects a missing Origin header", async () => {
    headersGetMock.mockReturnValue(null);

    const result = await loginAction(
      { status: "idle" },
      formData({ username: "user", password: "password123" }),
    );

    expect(result.status).toBe("error");
    expect(loginMock).not.toHaveBeenCalled();
  });

  it("rejects missing fields without calling the coordinator", async () => {
    const result = await loginAction(
      { status: "idle" },
      formData({ username: "", password: "" }),
    );

    expect(result.status).toBe("error");
    expect(loginMock).not.toHaveBeenCalled();
  });

  it("returns the generic invalid-credentials message on invalid_credentials", async () => {
    loginMock.mockResolvedValue({ kind: "invalid_credentials" });

    const result = await loginAction(
      { status: "idle" },
      formData({ username: "user", password: "wrong" }),
    );

    expect(result).toEqual({
      status: "error",
      message: "Username or password is incorrect.",
    });
  });

  it("sets the session cookie and redirects to the sanitized returnTo on success", async () => {
    loginMock.mockResolvedValue({
      kind: "success",
      sessionId: "new-session-id",
      absoluteExpiresAt: Date.now() + 60_000,
    });

    await expect(
      loginAction(
        { status: "idle" },
        formData({
          username: "user",
          password: "password123",
          returnTo: "/account/friends",
        }),
      ),
    ).rejects.toThrow("REDIRECT:/account/friends");

    expect(cookieStore.set).toHaveBeenCalledWith(
      sessionCookieName(),
      "new-session-id",
      expect.objectContaining({ httpOnly: true }),
    );
    expect(redirect).toHaveBeenCalledWith("/account/friends");
  });

  it("collapses a malicious returnTo to /account", async () => {
    loginMock.mockResolvedValue({
      kind: "success",
      sessionId: "new-session-id",
      absoluteExpiresAt: Date.now() + 60_000,
    });

    await expect(
      loginAction(
        { status: "idle" },
        formData({
          username: "user",
          password: "password123",
          returnTo: "https://evil.example",
        }),
      ),
    ).rejects.toThrow("REDIRECT:/account");
  });

  it("best-effort logs out an old session once the new one is established", async () => {
    cookieStore = createCookieStore({
      [sessionCookieName()]: "old-session-id",
    });
    loginMock.mockResolvedValue({
      kind: "success",
      sessionId: "new-session-id",
      absoluteExpiresAt: Date.now() + 60_000,
    });

    await expect(
      loginAction(
        { status: "idle" },
        formData({ username: "user", password: "password123" }),
      ),
    ).rejects.toThrow("REDIRECT:/account");

    expect(logoutMock).toHaveBeenCalledWith("old-session-id");
    expect(cookieStore.get(sessionCookieName())?.value).toBe("new-session-id");
  });

  it("returns a safe unavailable message when the coordinator itself can't be constructed (e.g. Redis unreachable)", async () => {
    tryGetWebSessionCoordinatorMock.mockResolvedValueOnce(null);

    const result = await loginAction(
      { status: "idle" },
      formData({ username: "user", password: "password123" }),
    );

    expect(result).toEqual({
      status: "error",
      message: "We couldn't complete that right now. Please try again shortly.",
    });
    expect(loginMock).not.toHaveBeenCalled();
    expect(cookieStore.set).not.toHaveBeenCalled();
  });
});
