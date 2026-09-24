"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { establishWebSession } from "@/lib/account/establish-session";
import type { AccountFormState } from "@/lib/account/form-state";
import {
  INVALID_CREDENTIALS_MESSAGE,
  MISSING_FIELDS_MESSAGE,
  ORIGIN_REJECTED_MESSAGE,
  RATE_LIMITED_MESSAGE,
  SESSION_STORE_UNAVAILABLE_MESSAGE,
  UNKNOWN_FAILURE_MESSAGE,
} from "@/lib/account/outcome-messages";
import { sanitizeAccountReturnTo } from "@/lib/account/return-to";
import { resolveTrustedClientIp } from "@/lib/net/trusted-client-ip";
import { getAccountRuntimeConfig } from "@/lib/web-auth/config";
import { isAllowedOrigin } from "@/lib/web-auth/origin-policy";
import { tryGetWebSessionCoordinator } from "@/lib/web-auth/session-coordinator-runtime";
import type { LoginResult } from "@/lib/web-auth/web-session-coordinator";

function loginFailureMessage(
  kind: Exclude<LoginResult, { kind: "success" }>["kind"],
): string {
  switch (kind) {
    case "invalid_credentials":
      // Deliberately identical to any other login failure below - see issue #6's "Login Outcome
      // Semantics": unknown username, wrong password, and a disabled account must stay
      // indistinguishable to the caller.
      return INVALID_CREDENTIALS_MESSAGE;
    case "rate_limited":
      return RATE_LIMITED_MESSAGE;
    case "unavailable":
      return SESSION_STORE_UNAVAILABLE_MESSAGE;
    case "unknown_failure":
      return UNKNOWN_FAILURE_MESSAGE;
    default:
      return kind satisfies never;
  }
}

export async function loginAction(
  _prevState: AccountFormState,
  formData: FormData,
): Promise<AccountFormState> {
  const config = getAccountRuntimeConfig();

  const headerList = await headers();
  if (!isAllowedOrigin(headerList.get("origin"), config.appOrigin)) {
    return { status: "error", message: ORIGIN_REJECTED_MESSAGE };
  }

  const username = String(formData.get("username") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  // Re-validated here, never trusted just because it was sanitized when the page rendered - a
  // caller can POST directly to this action with an arbitrary hidden field value.
  const returnTo = sanitizeAccountReturnTo(
    String(formData.get("returnTo") ?? ""),
  );

  if (!username || !password) {
    return { status: "error", message: MISSING_FIELDS_MESSAGE };
  }

  const coordinator = await tryGetWebSessionCoordinator();
  if (!coordinator) {
    return { status: "error", message: SESSION_STORE_UNAVAILABLE_MESSAGE };
  }
  const clientIp = resolveTrustedClientIp(headerList);
  const result = await coordinator.login(
    username,
    password,
    clientIp ? { clientIp } : undefined,
  );

  if (result.kind !== "success") {
    return { status: "error", message: loginFailureMessage(result.kind) };
  }

  const cookieStore = await cookies();
  await establishWebSession(cookieStore, coordinator, result);

  redirect(returnTo);
}
