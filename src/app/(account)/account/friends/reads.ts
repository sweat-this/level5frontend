import "server-only";
import {
  TEMPORARY_UNAVAILABLE_MESSAGE,
  THROTTLED_MESSAGE,
} from "@/lib/account/outcome-messages";
import type {
  TransportError,
  TransportResult,
} from "@/lib/backend-v2/transport";

/**
 * One social list's render state (issue #8 section 7/6): a failed read never replaces the whole
 * page - it degrades to a safe message in that section only, while the other sections render
 * normally from their own independent TransportResult.
 */
export type SocialSectionResult<T> =
  | { readonly kind: "data"; readonly items: readonly T[] }
  | { readonly kind: "message"; readonly message: string };

function mapListError(error: TransportError): string {
  switch (error.kind) {
    case "http":
      if (error.httpStatus === 429) {
        return THROTTLED_MESSAGE;
      }
      return TEMPORARY_UNAVAILABLE_MESSAGE;
    case "timeout":
    case "network":
    case "invalid_response":
    case "cancelled":
      return TEMPORARY_UNAVAILABLE_MESSAGE;
    default:
      return error satisfies never;
  }
}

export function toSectionResult<T>(
  result: TransportResult<readonly T[]>,
): SocialSectionResult<T> {
  if (result.kind === "error") {
    return { kind: "message", message: mapListError(result.error) };
  }
  return { kind: "data", items: result.data };
}

/**
 * A 401 from any of the three concurrent reads means the access token resolveAuthenticatedBackendAccess()
 * handed out was locally valid but Backend V2 itself rejected it (the same "resource 401" rule
 * as players/lookup.ts and profile/actions.ts) - a whole-session problem, not a per-list one, so
 * it is handled once for the page rather than as a per-section message.
 */
export function hasResourceAuthFailure(
  ...results: readonly TransportResult<unknown>[]
): boolean {
  return results.some(
    (result) =>
      result.kind === "error" &&
      result.error.kind === "http" &&
      result.error.httpStatus === 401,
  );
}
