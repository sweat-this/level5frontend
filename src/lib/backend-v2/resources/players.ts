import "server-only";
import {
  request,
  SAFE_READ_RETRY_POLICY,
  type TransportResult,
} from "../transport";
import type { PlayerProfile } from "../contracts";

/** Backend V2's `/api/v2/players/*` surface - near-term operations only (issue #4). */

export function getByTag(
  tag: string,
  accessToken: string,
  signal?: AbortSignal,
): Promise<TransportResult<PlayerProfile>> {
  return request<PlayerProfile>({
    method: "GET",
    path: `/api/v2/players/by-tag/${encodeURIComponent(tag)}`,
    accessToken,
    retry: SAFE_READ_RETRY_POLICY,
    signal,
  });
}

export function getMyPlayerId(
  accessToken: string,
  signal?: AbortSignal,
): Promise<TransportResult<string>> {
  return request<string>({
    method: "GET",
    path: "/api/v2/players/me",
    accessToken,
    retry: SAFE_READ_RETRY_POLICY,
    signal,
  });
}

/**
 * Additive self-profile read (issue #7) - distinct from getMyPlayerId()'s bare-GUID `/players/me`,
 * which the Unity client's existing contract requires staying unchanged. A safe read, so it may
 * use the same retry policy.
 */
export function getMyProfile(
  accessToken: string,
  signal?: AbortSignal,
): Promise<TransportResult<PlayerProfile>> {
  return request<PlayerProfile>({
    method: "GET",
    path: "/api/v2/players/me/profile",
    accessToken,
    retry: SAFE_READ_RETRY_POLICY,
    signal,
  });
}

/** Mutation - never retried automatically (issue #11). */
export function updateMyProfile(
  displayName: string,
  accessToken: string,
): Promise<TransportResult<PlayerProfile>> {
  return request<PlayerProfile>({
    method: "PATCH",
    path: "/api/v2/players/me",
    body: { displayName },
    accessToken,
  });
}
