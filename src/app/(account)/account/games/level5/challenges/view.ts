/**
 * View/cursor normalization for /account/games/level5/challenges (issue #9, namespaced under
 * Level 5's game data by issue #26). Every helper degrades to a safe default rather than letting
 * malformed input throw during server rendering.
 */

import { firstQueryValue, type RawQueryValue } from "@/lib/search-params";

export type { RawQueryValue };
export { firstQueryValue };

/**
 * The one canonical base path for the Level 5 challenges portal (issue #26) - every other module
 * under this feature imports it from here rather than repeating the string literal.
 */
export const CHALLENGES_PATH = "/account/games/level5/challenges";

export type ChallengesView =
  "incoming" | "outgoing" | "active" | "completed" | "history";

const VIEWS: readonly ChallengesView[] = [
  "incoming",
  "outgoing",
  "active",
  "completed",
  "history",
];

export const DEFAULT_VIEW: ChallengesView = "incoming";

function isChallengesView(value: string): value is ChallengesView {
  return (VIEWS as readonly string[]).includes(value);
}

/** Missing or invalid falls back to the one stable default (incoming). */
export function normalizeView(raw: RawQueryValue): ChallengesView {
  const value = firstQueryValue(raw);
  return value && isChallengesView(value) ? value : DEFAULT_VIEW;
}

/**
 * Opaque (issue #9 "Cursor invariants") - never decoded, parsed, or inspected here, only
 * collapsed to a single string (or undefined) and later passed back to Backend V2 verbatim.
 */
export function normalizeCursor(raw: RawQueryValue): string | undefined {
  return firstQueryValue(raw) || undefined;
}

/** The current category's first-page URL - never carries a cursor forward across a view change. */
export function challengesPathFor(view: ChallengesView): string {
  return `${CHALLENGES_PATH}?view=${view}`;
}

/** A single series' canonical detail URL. */
export function challengeDetailPath(seriesId: string): string {
  return `${CHALLENGES_PATH}/${seriesId}`;
}
