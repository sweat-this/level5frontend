import "server-only";
import { resolveAuthenticatedBackendAccess } from "@/lib/account/backend-access";
import {
  TEMPORARY_UNAVAILABLE_MESSAGE,
  THROTTLED_MESSAGE,
} from "@/lib/account/outcome-messages";
import * as PlayersApi from "@/lib/backend-v2/resources/players";

export const ACCOUNT_PATH = "/account";
export const ACCOUNT_LOGIN_REDIRECT = `/account/login?returnTo=${ACCOUNT_PATH}`;

/**
 * The dashboard's Identity section resolves independently of the account session resolved by
 * resolveCurrentAccountSession() (issue #25's "Profile Failure Isolation"): a temporary profile
 * read failure degrades to a controlled warning in this section only, never a full-page redirect
 * or failure - Social/Games/Account details/Logout need only that already-resolved session. Only
 * a definitive unauthentication here redirects to login, matching the "resource 401" rule
 * players/lookup.ts and profile/actions.ts already use.
 */
export type IdentitySectionResult =
  | {
      readonly kind: "ready";
      readonly displayName: string;
      readonly tag: string;
    }
  | { readonly kind: "message"; readonly message: string }
  | { readonly kind: "redirect" };

/**
 * Resolves the dashboard's own Backend V2 access token and profile independently of the account
 * session the page already has - never reuses a token/account passed in, so this stays testable
 * and correct in isolation from resolveCurrentAccountSession().
 */
export async function resolveIdentitySection(): Promise<IdentitySectionResult> {
  const access = await resolveAuthenticatedBackendAccess();

  if (access.kind === "unauthenticated") {
    return { kind: "redirect" };
  }
  if (access.kind === "unavailable") {
    return { kind: "message", message: TEMPORARY_UNAVAILABLE_MESSAGE };
  }
  if (access.kind === "throttled") {
    return { kind: "message", message: THROTTLED_MESSAGE };
  }

  const result = await PlayersApi.getMyProfile(access.accessToken);

  if (result.kind === "error") {
    if (result.error.kind === "http" && result.error.httpStatus === 401) {
      // Backend V2 disagreed with our locally-valid token - the web session is no longer usable.
      return { kind: "redirect" };
    }
    if (result.error.kind === "http" && result.error.httpStatus === 429) {
      return { kind: "message", message: THROTTLED_MESSAGE };
    }
    return { kind: "message", message: TEMPORARY_UNAVAILABLE_MESSAGE };
  }

  return {
    kind: "ready",
    displayName: result.data.displayName,
    tag: result.data.tag,
  };
}
