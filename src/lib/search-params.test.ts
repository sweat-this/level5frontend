import { describe, expect, it } from "vitest";
import { firstQueryValue } from "./search-params";

describe("firstQueryValue", () => {
  it("returns undefined for a missing param", () => {
    expect(firstQueryValue(undefined)).toBeUndefined();
  });

  it("passes through a single string value", () => {
    expect(firstQueryValue("abc#1234")).toBe("abc#1234");
  });

  it("resolves a repeated param (?tag=a&tag=b) to the first occurrence", () => {
    expect(firstQueryValue(["abc#1234", "def#5678"])).toBe("abc#1234");
  });

  it("returns undefined for an empty repeated-param array", () => {
    expect(firstQueryValue([])).toBeUndefined();
  });
});
