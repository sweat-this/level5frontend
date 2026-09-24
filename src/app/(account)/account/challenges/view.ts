/**
 * Query-param normalization for /account/challenges (issue #9). A Next.js route's searchParams
 * value may be string | string[] | undefined - a repeated `?view=a&view=b` produces an array -
 * so nothing here calls a string-only method on an unchecked value. Every helper degrades to a
 * safe default rather than letting malformed input throw during server rendering.
 */

export type ChallengesView = "incoming" | "outgoing" | "active" | "completed";

const VIEWS: readonly ChallengesView[] = [
  "incoming",
  "outgoing",
  "active",
  "completed",
];

export const DEFAULT_VIEW: ChallengesView = "incoming";

export type RawQueryValue = string | string[] | undefined;

/** Repeated query parameters deterministically resolve to the first occurrence. */
export function firstQueryValue(raw: RawQueryValue): string | undefined {
  return typeof raw === "string" ? raw : raw?.[0];
}

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
  return `/account/challenges?view=${view}`;
}
