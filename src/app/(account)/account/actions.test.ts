import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sessionCookieName } from "@/lib/web-auth/cookie-policy";

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

let cookieStore = createCookieStore({
  [sessionCookieName()]: "session-id",
});

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

vi.mock("@/lib/web-auth/session-coordinator-runtime", () => ({
  getWebSessionCoordinator: vi.fn(async () => ({ logout: logoutMock })),
}));

const { logoutAction } = await import("./actions");

beforeEach(() => {
  cookieStore = createCookieStore({ [sessionCookieName()]: "session-id" });
  headersGetMock.mockReturnValue("http://localhost:3000");
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("logoutAction", () => {
  it("clears the session cookie and redirects to login even when coordinator.logout rejects", async () => {
    logoutMock.mockRejectedValue(new Error("backend/store failure"));

    await expect(logoutAction()).rejects.toThrow("REDIRECT:/account/login");

    expect(cookieStore.get(sessionCookieName())?.value).toBe("");
    expect(logoutMock).toHaveBeenCalledWith("session-id", undefined);
  });

  it("clears the cookie and redirects even without a session cookie present", async () => {
    cookieStore = createCookieStore();

    await expect(logoutAction()).rejects.toThrow("REDIRECT:/account/login");

    expect(logoutMock).not.toHaveBeenCalled();
    expect(cookieStore.get(sessionCookieName())?.value).toBe("");
  });

  it("does nothing on a mismatched Origin - no backend call, no cookie change, no redirect", async () => {
    headersGetMock.mockReturnValue("http://evil.example");

    await logoutAction();

    expect(logoutMock).not.toHaveBeenCalled();
    expect(cookieStore.get(sessionCookieName())?.value).toBe("session-id");
  });
});
