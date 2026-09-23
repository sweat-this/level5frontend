import { describe, expect, it } from "vitest";
import { resolveFriendNotice } from "./notices";

describe("resolveFriendNotice", () => {
  it("returns undefined when no notice was supplied", () => {
    expect(resolveFriendNotice(undefined)).toBeUndefined();
  });

  it("returns undefined for an arbitrary, non-allow-listed value rather than rendering it", () => {
    expect(resolveFriendNotice("<script>alert(1)</script>")).toBeUndefined();
  });

  it.each([
    ["request-sent", "success"],
    ["request-accepted", "success"],
    ["request-declined", "success"],
    ["request-cancelled", "success"],
    ["friend-removed", "success"],
    ["state-changed", "info"],
  ] as const)("maps %s to a fixed %s message", (code, severity) => {
    const view = resolveFriendNotice(code);
    expect(view?.severity).toBe(severity);
    expect(typeof view?.message).toBe("string");
    expect(view?.message.length).toBeGreaterThan(0);
  });
});
