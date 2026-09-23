import { describe, expect, it } from "vitest";
import { hasResourceAuthFailure, toSectionResult } from "./reads";

describe("toSectionResult", () => {
  it("passes through an empty list as data", () => {
    expect(toSectionResult({ kind: "success", status: 200, data: [] })).toEqual(
      {
        kind: "data",
        items: [],
      },
    );
  });

  it("passes through a populated list as data", () => {
    const items = [{ playerId: "p1" }];
    expect(
      toSectionResult({ kind: "success", status: 200, data: items }),
    ).toEqual({
      kind: "data",
      items,
    });
  });

  it("maps a 429 to a throttled message", () => {
    const result = toSectionResult({
      kind: "error",
      error: {
        kind: "http",
        httpStatus: 429,
        safeMessage: "Too Many Requests",
      },
    });
    expect(result.kind).toBe("message");
    expect(result).toMatchObject({
      message: expect.stringMatching(/wait a moment/i),
    });
  });

  it.each(["timeout", "network", "invalid_response", "cancelled"] as const)(
    "maps a %s failure to a temporarily-unavailable message",
    (kind) => {
      const result = toSectionResult({
        kind: "error",
        error:
          kind === "invalid_response" ? { kind, httpStatus: 200 } : { kind },
      });
      expect(result).toEqual({
        kind: "message",
        message: "This isn't available right now. Please try again shortly.",
      });
    },
  );

  it("maps an unexpected http status to the temporarily-unavailable message", () => {
    const result = toSectionResult({
      kind: "error",
      error: {
        kind: "http",
        httpStatus: 500,
        safeMessage: "Internal Server Error",
      },
    });
    expect(result).toEqual({
      kind: "message",
      message: "This isn't available right now. Please try again shortly.",
    });
  });
});

describe("hasResourceAuthFailure", () => {
  it("is false when every result succeeded", () => {
    const success = { kind: "success" as const, status: 200, data: [] };
    expect(hasResourceAuthFailure(success, success, success)).toBe(false);
  });

  it("is false when a result failed with a non-401 error", () => {
    const success = { kind: "success" as const, status: 200, data: [] };
    const notFound = {
      kind: "error" as const,
      error: {
        kind: "http" as const,
        httpStatus: 404,
        safeMessage: "Not Found",
      },
    };
    expect(hasResourceAuthFailure(success, notFound, success)).toBe(false);
  });

  it("is true when any single result failed with a 401", () => {
    const success = { kind: "success" as const, status: 200, data: [] };
    const unauthorized = {
      kind: "error" as const,
      error: {
        kind: "http" as const,
        httpStatus: 401,
        safeMessage: "Unauthorized",
      },
    };
    expect(hasResourceAuthFailure(success, success, unauthorized)).toBe(true);
  });
});
