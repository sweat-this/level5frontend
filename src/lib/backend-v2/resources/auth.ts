import "server-only";
import {
  request,
  type ClientIpOverride,
  type TransportResult,
} from "../transport";
import type { BackendCredentials } from "../contracts";

/**
 * Backend V2's `/api/v2/auth/*` surface. No operation here ever retries automatically (issue
 * #11/#16) - BackendAuthClient is the only intended caller, and maps these raw transport
 * results into the exact LoginOutcome/RefreshOutcome semantics WebSessionCoordinator depends on.
 * `baseUrl` exists only for BackendAuthClient's per-instance override (tests, the live-backend
 * certification harness) - callers that don't need it can omit it and get
 * LEVEL5_V2_API_BASE_URL.
 */

export function register(
  username: string,
  password: string,
  displayName: string,
  baseUrl?: string,
): Promise<TransportResult<BackendCredentials>> {
  return request<BackendCredentials>({
    method: "POST",
    path: "/api/v2/auth/register",
    body: { username, password, displayName },
    baseUrl,
  });
}

export function login(
  username: string,
  password: string,
  ip?: ClientIpOverride,
  baseUrl?: string,
): Promise<TransportResult<BackendCredentials>> {
  return request<BackendCredentials>({
    method: "POST",
    path: "/api/v2/auth/login",
    body: { username, password },
    ip,
    baseUrl,
  });
}

export function refresh(
  refreshToken: string,
  ip?: ClientIpOverride,
  baseUrl?: string,
): Promise<TransportResult<BackendCredentials>> {
  return request<BackendCredentials>({
    method: "POST",
    path: "/api/v2/auth/refresh",
    body: { refreshToken },
    ip,
    baseUrl,
  });
}

export function logout(
  refreshToken: string,
  baseUrl?: string,
): Promise<TransportResult<undefined>> {
  return request<undefined>({
    method: "POST",
    path: "/api/v2/auth/logout",
    body: { refreshToken },
    baseUrl,
  });
}
