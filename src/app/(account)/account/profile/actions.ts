"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { resolveAuthenticatedBackendAccess } from "@/lib/account/backend-access";
import {
  MISSING_FIELDS_MESSAGE,
  ORIGIN_REJECTED_MESSAGE,
  TEMPORARY_UNAVAILABLE_MESSAGE,
  THROTTLED_MESSAGE,
  UNKNOWN_FAILURE_MESSAGE,
  withReference,
} from "@/lib/account/outcome-messages";
import type { ProfileFormState } from "@/lib/account/profile-form-state";
import * as PlayersApi from "@/lib/backend-v2/resources/players";
import type { TransportError } from "@/lib/backend-v2/transport";
import { getAccountRuntimeConfig } from "@/lib/web-auth/config";
import { isAllowedOrigin } from "@/lib/web-auth/origin-policy";

const PROFILE_PATH = "/account/profile";
const LOGIN_REDIRECT = `/account/login?returnTo=${PROFILE_PATH}`;

function mapUpdateError(error: TransportError): string {
  switch (error.kind) {
    case "http":
      if (error.httpStatus === 429) {
        return THROTTLED_MESSAGE;
      }
      if (error.httpStatus === 400) {
        // Backend V2 supplies a safe, user-facing validation message for this case - see
        // ApiExceptionHandler.cs and PlayersFlowTests's display-name validation coverage.
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
 * Backend V2's current PATCH /players/me is last-write-wins with no revision/concurrency
 * check (issue #7 - intentionally not added here either), so this never needs optimistic
 * update state: the server-confirmed PlayerProfileResponseDto is the only source of truth,
 * surfaced by revalidating the page after a success.
 */
export async function updateDisplayNameAction(
  _prevState: ProfileFormState,
  formData: FormData,
): Promise<ProfileFormState> {
  const config = getAccountRuntimeConfig();

  const headerList = await headers();
  if (!isAllowedOrigin(headerList.get("origin"), config.appOrigin)) {
    return { status: "error", message: ORIGIN_REJECTED_MESSAGE };
  }

  const displayName = String(formData.get("displayName") ?? "").trim();
  if (!displayName) {
    return { status: "error", message: MISSING_FIELDS_MESSAGE };
  }

  const access = await resolveAuthenticatedBackendAccess();
  if (access.kind === "unauthenticated") {
    redirect(LOGIN_REDIRECT);
  }
  if (access.kind === "throttled") {
    return { status: "error", message: THROTTLED_MESSAGE };
  }
  if (access.kind === "unavailable") {
    return { status: "error", message: TEMPORARY_UNAVAILABLE_MESSAGE };
  }

  const result = await PlayersApi.updateMyProfile(
    displayName,
    access.accessToken,
  );
  if (result.kind === "error") {
    // Backend V2 disagreed with our locally-valid token (see resolveAuthenticatedBackendAccess) -
    // the web session is no longer usable and must not be silently retried (issue #7's "resource
    // 401" rule).
    if (result.error.kind === "http" && result.error.httpStatus === 401) {
      redirect(LOGIN_REDIRECT);
    }
    return { status: "error", message: mapUpdateError(result.error) };
  }

  revalidatePath(PROFILE_PATH);
  return { status: "success", message: "Display name updated." };
}
