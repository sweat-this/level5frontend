import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sessionCookieName } from "@/lib/web-auth/cookie-policy";

const registerMock = vi.fn();
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
    register: typeof registerMock;
    logout: typeof logoutMock;
  } | null> => ({
    register: registerMock,
    logout: logoutMock,
  }),
);

vi.mock("@/lib/web-auth/session-coordinator-runtime", () => ({
  tryGetWebSessionCoordinator: tryGetWebSessionCoordinatorMock,
}));

const { registerAction } = await import("./actions");

function formData(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    data.set(key, value);
  }
  return data;
}

const VALID_FIELDS = {
  username: "newplayer",
  displayName: "New Player",
  password: "password123",
};

beforeEach(() => {
  cookieStore = createCookieStore();
  headersGetMock.mockReturnValue("http://localhost:3000");
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("registerAction", () => {
  it("rejects a mismatched Origin without calling the coordinator", async () => {
    headersGetMock.mockReturnValue("http://evil.example");

    const result = await registerAction(
      { status: "idle" },
      formData(VALID_FIELDS),
    );

    expect(result.status).toBe("error");
    expect(registerMock).not.toHaveBeenCalled();
  });

  it("rejects missing fields without calling the coordinator", async () => {
    const result = await registerAction(
      { status: "idle" },
      formData({ username: "", displayName: "", password: "" }),
    );

    expect(result.status).toBe("error");
    expect(registerMock).not.toHaveBeenCalled();
  });

  it("surfaces Backend V2's safe validation message on validation_failed", async () => {
    registerMock.mockResolvedValue({
      kind: "validation_failed",
      message: "Password must be at least 8 characters.",
    });

    const result = await registerAction(
      { status: "idle" },
      formData(VALID_FIELDS),
    );

    expect(result).toEqual({
      status: "error",
      message: "Password must be at least 8 characters.",
    });
  });

  it("surfaces Backend V2's safe conflict message on conflict", async () => {
    registerMock.mockResolvedValue({
      kind: "conflict",
      message: "Username is already taken.",
    });

    const result = await registerAction(
      { status: "idle" },
      formData(VALID_FIELDS),
    );

    expect(result).toEqual({
      status: "error",
      message: "Username is already taken.",
    });
  });

  it("appends a safe reference id when Backend V2 supplies a traceId", async () => {
    registerMock.mockResolvedValue({
      kind: "conflict",
      message: "Username is already taken.",
      traceId: "trace-123",
    });

    const result = await registerAction(
      { status: "idle" },
      formData(VALID_FIELDS),
    );

    expect(result.message).toBe(
      "Username is already taken. (Reference: trace-123)",
    );
  });

  it("never issues a second login request - establishes the session directly on success", async () => {
    registerMock.mockResolvedValue({
      kind: "success",
      sessionId: "new-session-id",
      absoluteExpiresAt: Date.now() + 60_000,
    });

    await expect(
      registerAction({ status: "idle" }, formData(VALID_FIELDS)),
    ).rejects.toThrow("REDIRECT:/account");

    expect(registerMock).toHaveBeenCalledTimes(1);
    expect(cookieStore.get(sessionCookieName())?.value).toBe("new-session-id");
  });

  it("best-effort logs out an old session once the new one is established", async () => {
    cookieStore = createCookieStore({
      [sessionCookieName()]: "old-session-id",
    });
    registerMock.mockResolvedValue({
      kind: "success",
      sessionId: "new-session-id",
      absoluteExpiresAt: Date.now() + 60_000,
    });

    await expect(
      registerAction({ status: "idle" }, formData(VALID_FIELDS)),
    ).rejects.toThrow("REDIRECT:/account");

    expect(logoutMock).toHaveBeenCalledWith("old-session-id");
  });

  it("returns a safe unavailable message when the coordinator itself can't be constructed (e.g. Redis unreachable)", async () => {
    tryGetWebSessionCoordinatorMock.mockResolvedValueOnce(null);

    const result = await registerAction(
      { status: "idle" },
      formData(VALID_FIELDS),
    );

    expect(result).toEqual({
      status: "error",
      message: "We couldn't complete that right now. Please try again shortly.",
    });
    expect(registerMock).not.toHaveBeenCalled();
    expect(cookieStore.set).not.toHaveBeenCalled();
  });
});
