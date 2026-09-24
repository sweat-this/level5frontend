"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { establishWebSession } from "@/lib/account/establish-session";
import type { AccountFormState } from "@/lib/account/form-state";
import {
  MISSING_FIELDS_MESSAGE,
  ORIGIN_REJECTED_MESSAGE,
  RATE_LIMITED_MESSAGE,
  SESSION_STORE_UNAVAILABLE_MESSAGE,
  UNKNOWN_FAILURE_MESSAGE,
  withReference,
} from "@/lib/account/outcome-messages";
import { sanitizeAccountReturnTo } from "@/lib/account/return-to";
import { resolveTrustedClientIp } from "@/lib/net/trusted-client-ip";
import { getAccountRuntimeConfig } from "@/lib/web-auth/config";
import { isAllowedOrigin } from "@/lib/web-auth/origin-policy";
import { tryGetWebSessionCoordinator } from "@/lib/web-auth/session-coordinator-runtime";
import type { RegisterResult } from "@/lib/web-auth/web-session-coordinator";

function registerFailureMessage(
  result: Exclude<RegisterResult, { kind: "success" }>,
): string {
  switch (result.kind) {
    case "validation_failed":
    case "conflict":
      // Backend V2 intentionally supplies a safe, user-facing message for exactly these two
      // cases (invalid username/password/display name, username conflict) - see
      // ApiExceptionHandler.cs. Never a raw exception/stack trace: BackendAuthClient already
      // only ever forwards ProblemDetails' `title`.
      return withReference(result.message, result.traceId);
    case "rate_limited":
      return RATE_LIMITED_MESSAGE;
    case "unavailable":
      return SESSION_STORE_UNAVAILABLE_MESSAGE;
    case "unknown_failure":
      return withReference(UNKNOWN_FAILURE_MESSAGE, result.traceId);
    default:
      return result satisfies never;
  }
}

export async function registerAction(
  _prevState: AccountFormState,
  formData: FormData,
): Promise<AccountFormState> {
  const config = getAccountRuntimeConfig();

  const headerList = await headers();
  if (!isAllowedOrigin(headerList.get("origin"), config.appOrigin)) {
    return { status: "error", message: ORIGIN_REJECTED_MESSAGE };
  }

  const username = String(formData.get("username") ?? "").trim();
  const displayName = String(formData.get("displayName") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const returnTo = sanitizeAccountReturnTo(
    String(formData.get("returnTo") ?? ""),
  );

  if (!username || !displayName || !password) {
    return { status: "error", message: MISSING_FIELDS_MESSAGE };
  }

  const coordinator = await tryGetWebSessionCoordinator();
  if (!coordinator) {
    return { status: "error", message: SESSION_STORE_UNAVAILABLE_MESSAGE };
  }
  const clientIp = resolveTrustedClientIp(headerList);
  const result = await coordinator.register(
    username,
    password,
    displayName,
    clientIp ? { clientIp } : undefined,
  );

  if (result.kind !== "success") {
    return { status: "error", message: registerFailureMessage(result) };
  }

  // A successful registration already produced credentials - establish the web session
  // directly, never a second login request (issue #6).
  const cookieStore = await cookies();
  await establishWebSession(cookieStore, coordinator, result);

  redirect(returnTo);
}
