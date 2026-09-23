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
