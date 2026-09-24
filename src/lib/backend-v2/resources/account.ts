import "server-only";
import { request, type RetryPolicy, type TransportResult } from "../transport";
import type { CurrentAccount } from "../contracts";

export interface GetCurrentAccountOptions {
  // Opt-in, not defaulted - see issue #4 review Problem 2. BackendAuthClient.getMe (issue #3)
  // must stay fail-fast (no retry) on this call, since WebSessionCoordinator.getMe can already
  // invoke it twice in one logical request (once, then again after a coordinated refresh); a
  // baked-in SAFE_READ_RETRY_POLICY here would multiply that path's worst-case latency well
  // past what issue #3 certified. A future direct "safe read" consumer of this function passes
  // SAFE_READ_RETRY_POLICY explicitly instead.
  readonly retry?: RetryPolicy;
  readonly signal?: AbortSignal;
  // Only BackendAuthClient uses this - see resources/auth.ts.
  readonly baseUrl?: string;
}

/** Backend V2's private authenticated-account identity (`GET /api/v2/me`). */
export function getCurrentAccount(
  accessToken: string,
  options: GetCurrentAccountOptions = {},
): Promise<TransportResult<CurrentAccount>> {
  return request<CurrentAccount>({
    method: "GET",
    path: "/api/v2/me",
    operationName: "account.me",
    accessToken,
    retry: options.retry,
    signal: options.signal,
    baseUrl: options.baseUrl,
  });
}
