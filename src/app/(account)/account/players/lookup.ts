import "server-only";
import { resolveAuthenticatedBackendAccess } from "@/lib/account/backend-access";
import { TEMPORARY_UNAVAILABLE_MESSAGE } from "@/lib/account/outcome-messages";
import * as PlayersApi from "@/lib/backend-v2/resources/players";
import type { TransportError } from "@/lib/backend-v2/transport";

export const PLAYERS_PATH = "/account/players";

export type PlayerLookupOutcome =
  | {
      readonly kind: "found";
      readonly displayName: string;
      readonly tag: string;
    }
  | { readonly kind: "message"; readonly message: string }
  | { readonly kind: "redirect"; readonly path: string };

/**
 * Never manually interpolated into a URL string (issue #7) - URLSearchParams handles encoding
 * of any character the Player Tag can contain, including `#`.
 */
export function loginRedirectFor(tag: string | undefined): string {
  const params = new URLSearchParams();
  if (tag) {
    params.set("tag", tag);
  }
  const query = params.toString();
  const returnTo = query ? `${PLAYERS_PATH}?${query}` : PLAYERS_PATH;
  return `/account/login?returnTo=${encodeURIComponent(returnTo)}`;
}

/** Exported for reuse by the Send Friend Request action (issue #8), which re-resolves the same
 * exact-tag lookup server-side before sending - see players/actions.ts. */
export function mapLookupError(error: TransportError): string {
  switch (error.kind) {
    case "http":
      if (error.httpStatus === 400) {
        return "That doesn't look like a valid Player Tag.";
      }
      if (error.httpStatus === 404) {
        return "No player was found with that tag.";
      }
      if (error.httpStatus === 429) {
        return "Too many attempts. Please wait a moment and try again.";
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

/**
 * Resolves an exact Player Tag lookup (issue #7) to one of: a found public player, a safe
 * message to render inline, or a login redirect. Backend V2 owns tag normalization/matching -
 * this never uppercases, parses, or partially matches the tag itself.
 */
export async function resolvePlayerLookup(
  tag: string,
): Promise<PlayerLookupOutcome> {
  const access = await resolveAuthenticatedBackendAccess();

  if (access.kind === "unauthenticated") {
    return { kind: "redirect", path: loginRedirectFor(tag) };
  }
  if (access.kind === "unavailable") {
    return { kind: "message", message: TEMPORARY_UNAVAILABLE_MESSAGE };
  }
  if (access.kind === "throttled") {
    return {
      kind: "message",
      message: "Too many attempts. Please wait a moment and try again.",
    };
  }

  const result = await PlayersApi.getByTag(tag, access.accessToken);

  if (result.kind === "error") {
    if (result.error.kind === "http" && result.error.httpStatus === 401) {
      // Backend V2 disagreed with our locally-valid token - the web session is no longer usable
      // (issue #7's "resource 401" rule).
      return { kind: "redirect", path: loginRedirectFor(tag) };
    }
    return { kind: "message", message: mapLookupError(result.error) };
  }

  return {
    kind: "found",
    displayName: result.data.displayName,
    tag: result.data.tag,
  };
}
