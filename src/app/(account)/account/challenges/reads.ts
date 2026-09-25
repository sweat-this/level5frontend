import "server-only";
import {
  TEMPORARY_UNAVAILABLE_MESSAGE,
  THROTTLED_MESSAGE,
} from "@/lib/account/outcome-messages";
import type {
  SeriesSummary,
  SeriesSummaryPage,
} from "@/lib/backend-v2/contracts";
import * as SeriesApi from "@/lib/backend-v2/resources/series";
import type { ListSeriesPageParams } from "@/lib/backend-v2/resources/series";
import type {
  TransportError,
  TransportResult,
} from "@/lib/backend-v2/transport";
import type { ChallengesView } from "./view";

export const CHALLENGES_PATH = "/account/challenges";
export const CHALLENGES_LOGIN_REDIRECT = `/account/login?returnTo=${CHALLENGES_PATH}`;

/**
 * One selected list category's render state (issue #9's "List Failure Handling"). `invalid-cursor`
 * covers both a malformed cursor and one copied from another list category - Backend V2 rejects
 * both identically (see KeysetCursor.Decode), so this never tries to tell them apart.
 */
export type ChallengesListResult =
  | {
      readonly kind: "data";
      readonly items: readonly SeriesSummary[];
      readonly nextCursor: string | null;
    }
  | { readonly kind: "redirect"; readonly path: string }
  | { readonly kind: "invalid-cursor" }
  | { readonly kind: "message"; readonly message: string };

const LIST_BY_VIEW: Readonly<
  Record<
    ChallengesView,
    (
      accessToken: string,
      params?: ListSeriesPageParams,
    ) => Promise<TransportResult<SeriesSummaryPage>>
  >
> = {
  incoming: SeriesApi.listIncoming,
  outgoing: SeriesApi.listOutgoing,
  active: SeriesApi.listActive,
  completed: SeriesApi.listCompleted,
  history: SeriesApi.listHistory,
};

function mapListError(error: TransportError): ChallengesListResult {
  if (error.kind === "http") {
    if (error.httpStatus === 401) {
      return { kind: "redirect", path: CHALLENGES_LOGIN_REDIRECT };
    }
    if (error.httpStatus === 400) {
      return { kind: "invalid-cursor" };
    }
    if (error.httpStatus === 429) {
      return { kind: "message", message: THROTTLED_MESSAGE };
    }
    return { kind: "message", message: TEMPORARY_UNAVAILABLE_MESSAGE };
  }
  // timeout | network | invalid_response | cancelled
  return { kind: "message", message: TEMPORARY_UNAVAILABLE_MESSAGE };
}

/**
 * Exactly one Backend V2 list request for the selected category (issue #9 "Performance") -
 * never all four, never a per-row getSeries/profile hydration. `cursor` is forwarded verbatim,
 * whatever category it was minted for; a cursor Backend V2 rejects (malformed or cross-category)
 * surfaces as its own 400 and is handled the same way here - there is no separate client-side
 * cross-category check, because the cursor's contents are never inspected.
 */
export async function resolveChallengesList(
  view: ChallengesView,
  cursor: string | undefined,
  accessToken: string,
): Promise<ChallengesListResult> {
  const list = LIST_BY_VIEW[view];
  const result = await list(accessToken, cursor ? { cursor } : undefined);

  if (result.kind === "error") {
    return mapListError(result.error);
  }
  return {
    kind: "data",
    items: result.data.items,
    nextCursor: result.data.nextCursor,
  };
}
