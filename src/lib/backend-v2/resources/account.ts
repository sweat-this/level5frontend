import "server-only";
import {
  request,
  SAFE_READ_RETRY_POLICY,
  type TransportResult,
} from "../transport";
import type { CurrentAccount } from "../contracts";

/**
 * Backend V2's private authenticated-account identity (`GET /api/v2/me`). A safe read.
 * `baseUrl` exists only for BackendAuthClient's per-instance override - see resources/auth.ts.
 */
export function getCurrentAccount(
  accessToken: string,
  signal?: AbortSignal,
  baseUrl?: string,
): Promise<TransportResult<CurrentAccount>> {
  return request<CurrentAccount>({
    method: "GET",
    path: "/api/v2/me",
    accessToken,
    retry: SAFE_READ_RETRY_POLICY,
    signal,
    baseUrl,
  });
}
