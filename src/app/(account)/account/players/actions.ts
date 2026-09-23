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
import * as PlayersApi from "@/lib/backend-v2/resources/players";
import type { TransportError } from "@/lib/backend-v2/transport";
import { getAccountRuntimeConfig } from "@/lib/web-auth/config";
import { isAllowedOrigin } from "@/lib/web-auth/origin-policy";
import { loginRedirectFor, mapLookupError } from "./lookup";

const FRIENDS_PATH = "/account/friends";

function mapSendRequestError(error: TransportError): string {
  switch (error.kind) {
    case "http":
      if (error.httpStatus === 429) {
        return THROTTLED_MESSAGE;
      }
      if (error.httpStatus === 404) {
        return "That player is no longer available.";
      }
      if (error.httpStatus === 400 || error.httpStatus === 409) {
        // Backend V2 supplies a safe, user-facing message for these domain outcomes (self-friend,
        // already friends, duplicate/crossed pending request) - see SendFriendRequestUseCase and
        // FriendRequest.Create.
        return withReference(error.safeMessage, error.traceId);
      }
      if (error.httpStatus >= 500) {
        return TEMPORARY_UNAVAILABLE_MESSAGE;
      }
      return withReference(UNKNOWN_FAILURE_MESSAGE, error.traceId);
    case "timeout":
    case "network":
      return TEMPORARY_UNAVAILABLE_MESSAGE;
    case "invalid_response":
    case "cancelled":
      return UNKNOWN_FAILURE_MESSAGE;
    default:
      return error satisfies never;
  }
}

/**
 * Sends a friend request from a /account/players search result (issue #8). Never trusts a
 * browser-submitted PlayerId: the submitted Player Tag is re-resolved through Backend V2's own
 * exact-tag lookup here, server-side, immediately before sending - see issue #8 section 13. The
 * acting player is always whoever resolveAuthenticatedBackendAccess() authenticates as; nothing
 * about "who is sending" is ever read from the form.
 */
export async function sendFriendRequestAction(
  _prevState: AccountFormState,
  formData: FormData,
): Promise<AccountFormState> {
  const config = getAccountRuntimeConfig();

  const headerList = await headers();
  if (!isAllowedOrigin(headerList.get("origin"), config.appOrigin)) {
    return { status: "error", message: ORIGIN_REJECTED_MESSAGE };
  }

  const tag = String(formData.get("tag") ?? "").trim();
  if (!tag) {
    return { status: "error", message: MISSING_FIELDS_MESSAGE };
  }

  const access = await resolveAuthenticatedBackendAccess();
  if (access.kind === "unauthenticated") {
    redirect(loginRedirectFor(tag));
  }
  if (access.kind === "throttled") {
    return { status: "error", message: THROTTLED_MESSAGE };
  }
  if (access.kind === "unavailable") {
    return { status: "error", message: TEMPORARY_UNAVAILABLE_MESSAGE };
  }

  const playerResult = await PlayersApi.getByTag(tag, access.accessToken);
  if (playerResult.kind === "error") {
    if (
      playerResult.error.kind === "http" &&
      playerResult.error.httpStatus === 401
    ) {
      redirect(loginRedirectFor(tag));
    }
    return { status: "error", message: mapLookupError(playerResult.error) };
  }

  const sendResult = await FriendsApi.sendRequest(
    playerResult.data.playerId,
    access.accessToken,
  );
  if (sendResult.kind === "error") {
    if (
      sendResult.error.kind === "http" &&
      sendResult.error.httpStatus === 401
    ) {
      redirect(loginRedirectFor(tag));
    }
    return { status: "error", message: mapSendRequestError(sendResult.error) };
  }

  redirect(`${FRIENDS_PATH}?notice=request-sent`);
}
