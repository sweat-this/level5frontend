import { describe, expect, it } from "vitest";
import { resolveChallengeNotice } from "./notices";

describe("resolveChallengeNotice", () => {
  it("returns undefined when no notice was supplied", () => {
    expect(resolveChallengeNotice(undefined)).toBeUndefined();
  });

  it("returns undefined for an arbitrary, non-allow-listed value rather than rendering it", () => {
    expect(resolveChallengeNotice("<script>alert(1)</script>")).toBeUndefined();
  });

  it.each([
    ["accepted", "success"],
    ["declined", "success"],
    ["cancelled", "success"],
    ["state-changed", "info"],
    ["outcome-unknown", "warning"],
  ] as const)("maps %s to a fixed %s message", (code, severity) => {
    const view = resolveChallengeNotice(code);
    expect(view?.severity).toBe(severity);
    expect(typeof view?.message).toBe("string");
    expect(view?.message.length).toBeGreaterThan(0);
  });
});
