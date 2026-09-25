import "server-only";
import { resolveAuthenticatedBackendAccess } from "@/lib/account/backend-access";
import {
  TEMPORARY_UNAVAILABLE_MESSAGE,
  THROTTLED_MESSAGE,
} from "@/lib/account/outcome-messages";
import type { SeriesDetails } from "@/lib/backend-v2/contracts";
import * as SeriesApi from "@/lib/backend-v2/resources/series";
import type { TransportError } from "@/lib/backend-v2/transport";
import { challengeDetailPath } from "../view";

export type SeriesDetailOutcome =
  | { readonly kind: "data"; readonly series: SeriesDetails }
  | { readonly kind: "redirect"; readonly path: string }
  | { readonly kind: "message"; readonly message: string };

export function loginRedirectFor(seriesId: string): string {
  const returnTo = challengeDetailPath(encodeURIComponent(seriesId));
  return `/account/login?returnTo=${encodeURIComponent(returnTo)}`;
}

function mapDetailError(error: TransportError): SeriesDetailOutcome {
  if (error.kind === "http") {
    if (error.httpStatus === 404) {
      // Backend V2 deliberately returns the same 404 whether the series doesn't exist or the
      // viewer isn't a participant (issue #9's "Series Detail Failure Handling") - never
      // distinguished here.
      return { kind: "message", message: "Series not found or unavailable." };
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
 * Exactly one getSeries call, authenticated first (issue #9's "Series Detail" / "Performance") -
 * no participant-profile requests are ever needed since SeriesDetailResponseDto already carries
 * both participants' public identity. A Backend outage (429/503/timeout/network) never signs the
 * player out - only a 401 from Backend V2 itself (or no local session at all) does.
 */
export async function resolveSeriesDetail(
  seriesId: string,
): Promise<SeriesDetailOutcome> {
  const access = await resolveAuthenticatedBackendAccess();

  if (access.kind === "unauthenticated") {
    return { kind: "redirect", path: loginRedirectFor(seriesId) };
  }
  if (access.kind === "unavailable") {
    return { kind: "message", message: TEMPORARY_UNAVAILABLE_MESSAGE };
  }
  if (access.kind === "throttled") {
    return { kind: "message", message: THROTTLED_MESSAGE };
  }

  const result = await SeriesApi.getSeries(seriesId, access.accessToken);
  if (result.kind === "error") {
    if (result.error.kind === "http" && result.error.httpStatus === 401) {
      // Backend V2 disagreed with our locally-valid token - the web session is no longer usable.
      return { kind: "redirect", path: loginRedirectFor(seriesId) };
    }
    return mapDetailError(result.error);
  }
  return { kind: "data", series: result.data };
}
