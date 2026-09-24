"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { resolveAuthenticatedBackendAccess } from "@/lib/account/backend-access";
import type { AccountFormState } from "@/lib/account/form-state";
import {
  MISSING_FIELDS_MESSAGE,
  ORIGIN_REJECTED_MESSAGE,
  TEMPORARY_UNAVAILABLE_MESSAGE,
  THROTTLED_MESSAGE,
  UNKNOWN_FAILURE_MESSAGE,
  withReference,
} from "@/lib/account/outcome-messages";
import * as SeriesApi from "@/lib/backend-v2/resources/series";
import type { TransportError } from "@/lib/backend-v2/transport";
import { getAccountRuntimeConfig } from "@/lib/web-auth/config";
import { isAllowedOrigin } from "@/lib/web-auth/origin-policy";
import { challengesPathFor, type ChallengesView } from "./view";

const CHALLENGES_PATH = "/account/challenges";
const LOGIN_REDIRECT = `/account/login?returnTo=${CHALLENGES_PATH}`;

type AccessOutcome =
  | { readonly kind: "ok"; readonly accessToken: string }
  | { readonly kind: "error"; readonly state: AccountFormState };

/** Shared Origin + session resolution for every challenge mutation (mirrors friends/actions.ts). */
async function resolveMutationAccess(): Promise<AccessOutcome> {
  const config = getAccountRuntimeConfig();
  const headerList = await headers();
  if (!isAllowedOrigin(headerList.get("origin"), config.appOrigin)) {
    return {
      kind: "error",
      state: { status: "error", message: ORIGIN_REJECTED_MESSAGE },
    };
  }

  const access = await resolveAuthenticatedBackendAccess();
  if (access.kind === "unauthenticated") {
    redirect(LOGIN_REDIRECT);
  }
  if (access.kind === "throttled") {
    return {
      kind: "error",
      state: { status: "error", message: THROTTLED_MESSAGE },
    };
  }
  if (access.kind === "unavailable") {
    return {
      kind: "error",
      state: { status: "error", message: TEMPORARY_UNAVAILABLE_MESSAGE },
    };
  }
  return { kind: "ok", accessToken: access.accessToken };
}

/**
 * Maps a mutation's TransportError to either a fixed redirect or an inline error (issue #9's
 * "Stale / Concurrent Mutation" and "Ambiguous Mutation Outcome"). Unlike friends/actions.ts, a
 * transport failure (timeout/network/5xx) never returns inline here - the request may have
 * already reached Backend V2 (accept is a domain no-op replay, decline/cancel are not), so it
 * converges through a fresh authoritative read (?notice=outcome-unknown) instead of implying the
 * mutation definitely failed. 429 stays inline: it's explicit rate limiting, not an unknown
 * network outcome, and no automatic retry is ever performed (issue #11).
 */
function mapMutationError(
  error: TransportError,
  staleRedirectView: ChallengesView,
): { redirectTo: string } | { state: AccountFormState } {
  const firstPage = challengesPathFor(staleRedirectView);

  if (error.kind === "http") {
    if (error.httpStatus === 401) {
      return { redirectTo: LOGIN_REDIRECT };
    }
    if (
      error.httpStatus === 403 ||
      error.httpStatus === 404 ||
      error.httpStatus === 409
    ) {
      return { redirectTo: `${firstPage}&notice=state-changed` };
    }
    if (error.httpStatus === 429) {
      return { state: { status: "error", message: THROTTLED_MESSAGE } };
    }
    if (error.httpStatus === 400) {
      return {
        state: {
          status: "error",
          message: withReference(error.safeMessage, error.traceId),
        },
      };
    }
    // 5xx: ambiguous - the write may have already landed.
    return { redirectTo: `${firstPage}&notice=outcome-unknown` };
  }
  if (error.kind === "timeout" || error.kind === "network") {
    return { redirectTo: `${firstPage}&notice=outcome-unknown` };
  }
  // invalid_response - a decodable-but-unexpected response; not a network ambiguity, so it gets a
  // generic inline error rather than implying an unconfirmed write.
  return { state: { status: "error", message: UNKNOWN_FAILURE_MESSAGE } };
}

function requiredField(formData: FormData, name: string): string | null {
  const value = String(formData.get(name) ?? "").trim();
  return value ? value : null;
}

export async function acceptChallengeAction(
  _prevState: AccountFormState,
  formData: FormData,
): Promise<AccountFormState> {
  const resolved = await resolveMutationAccess();
  if (resolved.kind === "error") {
    return resolved.state;
  }

  const seriesId = requiredField(formData, "seriesId");
  if (!seriesId) {
    return { status: "error", message: MISSING_FIELDS_MESSAGE };
  }

  const result = await SeriesApi.accept(seriesId, resolved.accessToken);
  if (result.kind === "error") {
    const outcome = mapMutationError(result.error, "incoming");
    if ("redirectTo" in outcome) {
      redirect(outcome.redirectTo);
    }
    return outcome.state;
  }

  redirect(`${challengesPathFor("active")}&notice=accepted`);
}

export async function declineChallengeAction(
  _prevState: AccountFormState,
  formData: FormData,
): Promise<AccountFormState> {
  const resolved = await resolveMutationAccess();
  if (resolved.kind === "error") {
    return resolved.state;
  }

  const seriesId = requiredField(formData, "seriesId");
  if (!seriesId) {
    return { status: "error", message: MISSING_FIELDS_MESSAGE };
  }

  const result = await SeriesApi.decline(seriesId, resolved.accessToken);
  if (result.kind === "error") {
    const outcome = mapMutationError(result.error, "incoming");
    if ("redirectTo" in outcome) {
      redirect(outcome.redirectTo);
    }
    return outcome.state;
  }

  redirect(`${challengesPathFor("incoming")}&notice=declined`);
}

export async function cancelChallengeAction(
  _prevState: AccountFormState,
  formData: FormData,
): Promise<AccountFormState> {
  const resolved = await resolveMutationAccess();
  if (resolved.kind === "error") {
    return resolved.state;
  }

  const seriesId = requiredField(formData, "seriesId");
  if (!seriesId) {
    return { status: "error", message: MISSING_FIELDS_MESSAGE };
  }

  const result = await SeriesApi.cancel(seriesId, resolved.accessToken);
  if (result.kind === "error") {
    const outcome = mapMutationError(result.error, "outgoing");
    if ("redirectTo" in outcome) {
      redirect(outcome.redirectTo);
    }
    return outcome.state;
  }

  redirect(`${challengesPathFor("outgoing")}&notice=cancelled`);
}
