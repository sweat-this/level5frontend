import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { recordSessionEvent } from "./session-observability";

describe("recordSessionEvent", () => {
  let consoleInfoSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleInfoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleInfoSpy.mockRestore();
  });

  it("logs the event name and timestamp", () => {
    recordSessionEvent("session_created");

    expect(consoleInfoSpy).toHaveBeenCalledTimes(1);
    const logged = JSON.parse(consoleInfoSpy.mock.calls[0][0] as string);
    expect(logged.event).toBe("session_created");
    expect(typeof logged.ts).toBe("string");
  });

  it("never lets a caller-supplied field shadow the real event name", () => {
    recordSessionEvent("session_created", { event: "forged_event" });

    const logged = JSON.parse(consoleInfoSpy.mock.calls[0][0] as string);
    expect(logged.event).toBe("session_created");
  });

  it("does not throw when the OTel SDK isn't registered (no-op meter)", () => {
    // No SDK is registered anywhere in the unit test suite - this exercises the actual
    // no-op @opentelemetry/api default, not a mock.
    expect(() =>
      recordSessionEvent("refresh_throttled", { attempt: 1, ok: true }),
    ).not.toThrow();
  });

  it.each(["refresh_throttled", "login_outcome", "register_outcome"] as const)(
    "accepts the issue #10 event %s",
    (event) => {
      expect(() =>
        recordSessionEvent(event, { kind: "success" }),
      ).not.toThrow();
    },
  );
});
