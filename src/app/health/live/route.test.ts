import { describe, expect, it } from "vitest";
import { GET } from "./route";

describe("GET /health/live", () => {
  it("always returns 200 with no external dependency checks", async () => {
    const response = GET();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ status: "ok" });
  });
});
