import { describe, expect, it } from "vitest";
import {
  challengeDetailPath,
  challengesPathFor,
  firstQueryValue,
  normalizeCursor,
  normalizeView,
} from "./view";

describe("firstQueryValue", () => {
  it("returns undefined for undefined", () => {
    expect(firstQueryValue(undefined)).toBeUndefined();
  });

  it("passes through a single string", () => {
    expect(firstQueryValue("incoming")).toBe("incoming");
  });

  it("deterministically takes the first value of a repeated parameter", () => {
    expect(firstQueryValue(["incoming", "outgoing"])).toBe("incoming");
  });

  it("returns undefined for an empty array", () => {
    expect(firstQueryValue([])).toBeUndefined();
  });
});

describe("normalizeView", () => {
  it("defaults to incoming when missing", () => {
    expect(normalizeView(undefined)).toBe("incoming");
  });

  it("defaults to incoming for an invalid value", () => {
    expect(normalizeView("not-a-view")).toBe("incoming");
  });

  it.each(["incoming", "outgoing", "active", "completed"] as const)(
    "accepts %s",
    (view) => {
      expect(normalizeView(view)).toBe(view);
    },
  );

  it("takes the first of a repeated view parameter", () => {
    expect(normalizeView(["active", "completed"])).toBe("active");
  });

  it("falls back to the default when the first of a repeated parameter is invalid", () => {
    expect(normalizeView(["bogus", "active"])).toBe("incoming");
  });
});

describe("normalizeCursor", () => {
  it("returns undefined when missing", () => {
    expect(normalizeCursor(undefined)).toBeUndefined();
  });

  it("returns undefined for an empty string", () => {
    expect(normalizeCursor("")).toBeUndefined();
  });

  it("passes an opaque cursor through unchanged", () => {
    expect(normalizeCursor("abc==")).toBe("abc==");
  });

  it("takes the first of a repeated cursor parameter", () => {
    expect(normalizeCursor(["cursor-a", "cursor-b"])).toBe("cursor-a");
  });
});

describe("challengesPathFor", () => {
  it.each(["incoming", "outgoing", "active", "completed", "history"] as const)(
    "namespaces %s under the Level 5 game-data route",
    (view) => {
      expect(challengesPathFor(view)).toBe(
        `/account/games/level5/challenges?view=${view}`,
      );
    },
  );

  it("never carries a cursor forward across a view change", () => {
    expect(challengesPathFor("active")).toBe(
      "/account/games/level5/challenges?view=active",
    );
  });
});

describe("challengeDetailPath", () => {
  it("namespaces a series id under the Level 5 game-data route", () => {
    expect(challengeDetailPath("series-1")).toBe(
      "/account/games/level5/challenges/series-1",
    );
  });
});
