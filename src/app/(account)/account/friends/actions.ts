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
import * as FriendsApi from "@/lib/backend-v2/resources/friends";
import type { TransportError } from "@/lib/backend-v2/transport";
import { getAccountRuntimeConfig } from "@/lib/web-auth/config";
import { isAllowedOrigin } from "@/lib/web-auth/origin-policy";

const FRIENDS_PATH = "/account/friends";
const LOGIN_REDIRECT = `/account/login?returnTo=${FRIENDS_PATH}`;
const STATE_CHANGED_REDIRECT = `${FRIENDS_PATH}?notice=state-changed`;

type AccessOutcome =
  | { readonly kind: "ok"; readonly accessToken: string }
  | { readonly kind: "error"; readonly state: AccountFormState };

/**
 * Shared Origin + session resolution for every friend mutation (issue #8 section 15). Only ever
 * called from within a "use server" action, so redirect()'s throw propagates exactly like it
 * does inline in profile/actions.ts.
 */
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
 * Maps a mutation's TransportError to either a redirect (session gone, or Backend's authoritative
 * state has moved on since this page loaded - issue #8 section 17) or an inline error to render
 * in place (429/timeout/network/5xx - transient, worth letting the player retry without losing
 * their place). Never reproduces Backend's own friendship rules here (issue #8 section 11) - a
 * domain 400/409 just surfaces Backend's own safe message verbatim.
 */
function mapMutationError(
  error: TransportError,
): { redirectTo: string } | { state: AccountFormState } {
  if (error.kind === "http") {
    if (error.httpStatus === 401) {
      return { redirectTo: LOGIN_REDIRECT };
    }
    if (
      error.httpStatus === 403 ||
      error.httpStatus === 404 ||
      error.httpStatus === 409
    ) {
      return { redirectTo: STATE_CHANGED_REDIRECT };
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
    if (error.httpStatus >= 500) {
      return {
        state: { status: "error", message: TEMPORARY_UNAVAILABLE_MESSAGE },
      };
    }
    return {
      state: {
        status: "error",
        message: withReference(UNKNOWN_FAILURE_MESSAGE, error.traceId),
      },
    };
  }
  if (error.kind === "timeout" || error.kind === "network") {
    return {
      state: { status: "error", message: TEMPORARY_UNAVAILABLE_MESSAGE },
    };
  }
  return { state: { status: "error", message: UNKNOWN_FAILURE_MESSAGE } };
}

function requiredField(formData: FormData, name: string): string | null {
  const value = String(formData.get(name) ?? "").trim();
  return value ? value : null;
}

export async function acceptFriendRequestAction(
  _prevState: AccountFormState,
  formData: FormData,
): Promise<AccountFormState> {
  const resolved = await resolveMutationAccess();
  if (resolved.kind === "error") {
    return resolved.state;
  }

  const requestId = requiredField(formData, "requestId");
  if (!requestId) {
    return { status: "error", message: MISSING_FIELDS_MESSAGE };
  }

  const result = await FriendsApi.accept(requestId, resolved.accessToken);
  if (result.kind === "error") {
    const outcome = mapMutationError(result.error);
    if ("redirectTo" in outcome) {
      redirect(outcome.redirectTo);
    }
    return outcome.state;
  }

  redirect(`${FRIENDS_PATH}?notice=request-accepted`);
}

export async function declineFriendRequestAction(
  _prevState: AccountFormState,
  formData: FormData,
): Promise<AccountFormState> {
  const resolved = await resolveMutationAccess();
  if (resolved.kind === "error") {
    return resolved.state;
  }

  const requestId = requiredField(formData, "requestId");
  if (!requestId) {
    return { status: "error", message: MISSING_FIELDS_MESSAGE };
  }

  const result = await FriendsApi.decline(requestId, resolved.accessToken);
  if (result.kind === "error") {
    const outcome = mapMutationError(result.error);
    if ("redirectTo" in outcome) {
      redirect(outcome.redirectTo);
    }
    return outcome.state;
  }

  redirect(`${FRIENDS_PATH}?notice=request-declined`);
}

export async function cancelFriendRequestAction(
  _prevState: AccountFormState,
  formData: FormData,
): Promise<AccountFormState> {
  const resolved = await resolveMutationAccess();
  if (resolved.kind === "error") {
    return resolved.state;
  }

  const requestId = requiredField(formData, "requestId");
  if (!requestId) {
    return { status: "error", message: MISSING_FIELDS_MESSAGE };
  }

  const result = await FriendsApi.cancel(requestId, resolved.accessToken);
  if (result.kind === "error") {
    const outcome = mapMutationError(result.error);
    if ("redirectTo" in outcome) {
      redirect(outcome.redirectTo);
    }
    return outcome.state;
  }

  redirect(`${FRIENDS_PATH}?notice=request-cancelled`);
}

export async function removeFriendAction(
  _prevState: AccountFormState,
  formData: FormData,
): Promise<AccountFormState> {
  const resolved = await resolveMutationAccess();
  if (resolved.kind === "error") {
    return resolved.state;
  }

  const playerId = requiredField(formData, "playerId");
  if (!playerId) {
    return { status: "error", message: MISSING_FIELDS_MESSAGE };
  }

  const result = await FriendsApi.remove(playerId, resolved.accessToken);
  if (result.kind === "error") {
    const outcome = mapMutationError(result.error);
    if ("redirectTo" in outcome) {
      redirect(outcome.redirectTo);
    }
    return outcome.state;
  }

  redirect(`${FRIENDS_PATH}?notice=friend-removed`);
}
