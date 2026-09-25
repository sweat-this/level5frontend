import { describe, expect, it } from "vitest";
import type { SeriesDetails } from "@/lib/backend-v2/contracts";
import { hasWinner, resolveWinnerLabel } from "./winner";

function series(
  winnerId: string | null,
  status: string = "Completed",
): SeriesDetails {
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
    status,
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

describe("hasWinner", () => {
  it("is true for a Completed series", () => {
    expect(hasWinner(series(null, "Completed"))).toBe(true);
  });

  // Backend V2 sets completedAt for every terminal status, not just Completed - a
  // Declined/Cancelled/Expired challenge was never played and must not render a "Winner" row
  // (it would otherwise show "Winner: No winner" for a challenge that has no result at all).
  it.each(["Declined", "Cancelled", "Expired"])(
    "is false for a %s series even though winnerId is null just like a real draw",
    (status) => {
      expect(hasWinner(series(null, status))).toBe(false);
    },
  );

  it("is false for an Active series", () => {
    expect(hasWinner(series(null, "Active"))).toBe(false);
  });
});
