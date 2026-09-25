import type { SeriesDetails } from "@/lib/backend-v2/contracts";

/**
 * Only ever displays explicit series winner information from `winnerId` (issue #9's "Do Not
 * Reconstruct Round Winners") - never derived from comparisonKeys/attempt results. An unexpected
 * non-null id matching neither participant renders a safe unavailable state rather than the raw
 * id. Extracted from page.tsx so this safety-relevant mapping has direct unit coverage rather
 * than relying solely on the happy path exercised by e2e/challenges.spec.ts.
 */
/**
 * Whether a "Winner" row is meaningful for this series. Backend V2 sets `completedAt` for every
 * terminal status - Completed, Declined, Cancelled, and Expired - not just Completed (it's the
 * one authoritative terminal timestamp for all of them), so `completedAt !== null` alone is not
 * enough to gate a winner display: a Declined/Cancelled/Expired challenge was never played and
 * has no winner to report, `winnerId` is simply null. Only `Completed` means a winner (or an
 * explicit no-winner draw) is meaningful to show.
 */
export function hasWinner(series: SeriesDetails): boolean {
  return series.status === "Completed";
}

export function resolveWinnerLabel(series: SeriesDetails): string {
  if (series.winnerId === series.challenger.playerId) {
    return `${series.challenger.displayName} (${series.challenger.tag})`;
  }
  if (series.winnerId === series.opponent.playerId) {
    return `${series.opponent.displayName} (${series.opponent.tag})`;
  }
  if (series.winnerId === null) {
    return "No winner";
  }
  return "Unavailable";
}
