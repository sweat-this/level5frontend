/**
 * Query-param normalization shared by account routes. A Next.js route's searchParams value may
 * be string | string[] | undefined - a repeated `?key=a&key=b` produces an array - so nothing
 * downstream calls a string-only method on an unchecked value.
 */

export type RawQueryValue = string | string[] | undefined;

/** Repeated query parameters deterministically resolve to the first occurrence. */
export function firstQueryValue(raw: RawQueryValue): string | undefined {
  return typeof raw === "string" ? raw : raw?.[0];
}
