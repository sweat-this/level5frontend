import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const headersGetMock = vi.fn();
const revalidatePathMock = vi.fn();
const resolveAuthenticatedBackendAccessMock = vi.fn();
const updateMyProfileMock = vi.fn();

vi.mock("next/headers", () => ({
  headers: vi.fn(async () => ({ get: headersGetMock })),
}));

vi.mock("next/navigation", () => ({
  redirect: vi.fn((path: string) => {
    throw new Error(`REDIRECT:${path}`);
  }),
}));

vi.mock("next/cache", () => ({
  revalidatePath: (path: string) => revalidatePathMock(path),
}));

vi.mock("@/lib/web-auth/config", () => ({
  getAccountRuntimeConfig: vi.fn(() => ({
    backendBaseUrl: "http://backend.test",
    appOrigin: "http://localhost:3000",
  })),
}));

vi.mock("@/lib/account/backend-access", () => ({
  resolveAuthenticatedBackendAccess: () =>
    resolveAuthenticatedBackendAccessMock(),
}));

vi.mock("@/lib/backend-v2/resources/players", () => ({
  updateMyProfile: (displayName: string, accessToken: string) =>
    updateMyProfileMock(displayName, accessToken),
}));

const { updateDisplayNameAction } = await import("./actions");

function formData(displayName: string): FormData {
  const data = new FormData();
  data.set("displayName", displayName);
  return data;
}

beforeEach(() => {
  headersGetMock.mockReturnValue("http://localhost:3000");
  resolveAuthenticatedBackendAccessMock.mockResolvedValue({
    kind: "ready",
    accessToken: "at-1",
  });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("updateDisplayNameAction", () => {
  it("rejects a mismatched Origin without calling Backend V2", async () => {
    headersGetMock.mockReturnValue("http://evil.example");

    const state = await updateDisplayNameAction(
      { status: "idle" },
      formData("New Name"),
    );

    expect(state).toEqual({
      status: "error",
      message:
        "Your request could not be verified. Please reload the page and try again.",
    });
    expect(updateMyProfileMock).not.toHaveBeenCalled();
  });

  it("rejects an empty display name without calling Backend V2", async () => {
    const state = await updateDisplayNameAction(
      { status: "idle" },
      formData("   "),
    );

    expect(state.status).toBe("error");
    expect(updateMyProfileMock).not.toHaveBeenCalled();
  });

  it("redirects to login when the session is unauthenticated", async () => {
    resolveAuthenticatedBackendAccessMock.mockResolvedValue({
      kind: "unauthenticated",
    });

    await expect(
      updateDisplayNameAction({ status: "idle" }, formData("New Name")),
    ).rejects.toThrow("REDIRECT:/account/login?returnTo=/account/profile");
    expect(updateMyProfileMock).not.toHaveBeenCalled();
  });

  it("reports throttled without calling Backend V2 again", async () => {
    resolveAuthenticatedBackendAccessMock.mockResolvedValue({
      kind: "throttled",
    });

    const state = await updateDisplayNameAction(
      { status: "idle" },
      formData("New Name"),
    );

    expect(state.status).toBe("error");
    expect(updateMyProfileMock).not.toHaveBeenCalled();
  });

  it("reports a transient failure when the session store is unavailable", async () => {
    resolveAuthenticatedBackendAccessMock.mockResolvedValue({
      kind: "unavailable",
    });

    const state = await updateDisplayNameAction(
      { status: "idle" },
      formData("New Name"),
    );

    expect(state.status).toBe("error");
    expect(updateMyProfileMock).not.toHaveBeenCalled();
  });

  it("succeeds, revalidates the profile page, and reports success", async () => {
    updateMyProfileMock.mockResolvedValue({
      kind: "success",
      status: 200,
      data: { playerId: "p1", displayName: "New Name", tag: "New#1234" },
    });

    const state = await updateDisplayNameAction(
      { status: "idle" },
      formData("New Name"),
    );

    expect(state).toEqual({
      status: "success",
      message: "Display name updated.",
      displayName: "New Name",
    });
    expect(updateMyProfileMock).toHaveBeenCalledWith("New Name", "at-1");
    expect(revalidatePathMock).toHaveBeenCalledWith("/account/profile");
  });

  it("reconciles to Backend V2's trimmed displayName, not the raw submitted value", async () => {
    updateMyProfileMock.mockResolvedValue({
      kind: "success",
      status: 200,
      data: { playerId: "p1", displayName: "Padded Name", tag: "New#1234" },
    });

    const state = await updateDisplayNameAction(
      { status: "idle" },
      formData("  Padded Name  "),
    );

    expect(state.status).toBe("success");
    expect(state.displayName).toBe("Padded Name");
  });

  it("surfaces Backend V2's safe validation message on 400, with a trace reference", async () => {
    updateMyProfileMock.mockResolvedValue({
      kind: "error",
      error: {
        kind: "http",
        httpStatus: 400,
        safeMessage: "Display name must be between 1 and 32 characters.",
        traceId: "trace-1",
      },
    });

    const state = await updateDisplayNameAction(
      { status: "idle" },
      formData("New Name"),
    );

    expect(state).toEqual({
      status: "error",
      message:
        "Display name must be between 1 and 32 characters. (Reference: trace-1)",
    });
  });

  it("redirects to login when Backend V2 itself returns 401", async () => {
    updateMyProfileMock.mockResolvedValue({
      kind: "error",
      error: { kind: "http", httpStatus: 401, safeMessage: "Unauthorized" },
    });

    await expect(
      updateDisplayNameAction({ status: "idle" }, formData("New Name")),
    ).rejects.toThrow("REDIRECT:/account/login?returnTo=/account/profile");
  });

  it("reports throttled on 429", async () => {
    updateMyProfileMock.mockResolvedValue({
      kind: "error",
      error: {
        kind: "http",
        httpStatus: 429,
        safeMessage: "Too Many Requests",
      },
    });

    const state = await updateDisplayNameAction(
      { status: "idle" },
      formData("New Name"),
    );

    expect(state.status).toBe("error");
    expect(state.message).toMatch(/wait a moment/i);
  });

  it("reports a temporary failure on a 5xx", async () => {
    updateMyProfileMock.mockResolvedValue({
      kind: "error",
      error: {
        kind: "http",
        httpStatus: 503,
        safeMessage: "Service Unavailable",
      },
    });

    const state = await updateDisplayNameAction(
      { status: "idle" },
      formData("New Name"),
    );

    expect(state.status).toBe("error");
    expect(state.message).toMatch(/try again shortly/i);
  });

  it.each(["timeout", "network"] as const)(
    "reports a temporary failure on a %s error",
    async (kind) => {
      updateMyProfileMock.mockResolvedValue({ kind: "error", error: { kind } });

      const state = await updateDisplayNameAction(
        { status: "idle" },
        formData("New Name"),
      );

      expect(state.status).toBe("error");
      expect(state.message).toMatch(/try again shortly/i);
    },
  );

  it("preserves the submitted display name across a failure - no server-side reset behavior", async () => {
    updateMyProfileMock.mockResolvedValue({
      kind: "error",
      error: { kind: "network" },
    });

    // The action never echoes the value back in state - the uncontrolled form input retains it
    // client-side (see EditDisplayNameForm.tsx). This just confirms the action doesn't overwrite
    // or clear anything the caller would render as the field's value.
    const state = await updateDisplayNameAction(
      { status: "idle" },
      formData("Some Value"),
    );

    expect(state).not.toHaveProperty("displayName");
  });
});
