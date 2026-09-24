import type { SeriesDetails } from "@/lib/backend-v2/contracts";

/**
 * Only ever displays explicit series winner information from `winnerId` (issue #9's "Do Not
 * Reconstruct Round Winners") - never derived from comparisonKeys/attempt results. An unexpected
 * non-null id matching neither participant renders a safe unavailable state rather than the raw
 * id. Extracted from page.tsx so this safety-relevant mapping has direct unit coverage rather
 * than relying solely on the happy path exercised by e2e/challenges.spec.ts.
 */
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
