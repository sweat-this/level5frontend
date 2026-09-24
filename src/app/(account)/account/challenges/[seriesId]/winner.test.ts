import { describe, expect, it } from "vitest";
import type { SeriesDetails } from "@/lib/backend-v2/contracts";
import { resolveWinnerLabel } from "./winner";

function series(winnerId: string | null): SeriesDetails {
  return {
    challenger: {
      playerId: "challenger-id",
      displayName: "Challenger Name",
      tag: "CHAL#0001",
    },
    opponent: {
      playerId: "opponent-id",
      displayName: "Opponent Name",
      tag: "OPP#0002",
    },
    winnerId,
  } as SeriesDetails;
}

describe("resolveWinnerLabel", () => {
  it("labels the challenger when winnerId matches the challenger", () => {
    expect(resolveWinnerLabel(series("challenger-id"))).toBe(
      "Challenger Name (CHAL#0001)",
    );
  });

  it("labels the opponent when winnerId matches the opponent", () => {
    expect(resolveWinnerLabel(series("opponent-id"))).toBe(
      "Opponent Name (OPP#0002)",
    );
  });

  it("reports no winner when winnerId is null", () => {
    expect(resolveWinnerLabel(series(null))).toBe("No winner");
  });

  it("never displays a raw winnerId that matches neither participant", () => {
    const label = resolveWinnerLabel(series("some-other-player-id"));
    expect(label).toBe("Unavailable");
    expect(label).not.toContain("some-other-player-id");
  });
});
