import "server-only";
import { resourceRequest } from "../resource-request";
import { SAFE_READ_RETRY_POLICY, type TransportResult } from "../transport";
import type { PlayerProfile } from "../contracts";

/** Backend V2's `/api/v2/players/*` surface - near-term operations only (issue #4). */

export function getByTag(
  tag: string,
  accessToken: string,
  signal?: AbortSignal,
): Promise<TransportResult<PlayerProfile>> {
  return resourceRequest<PlayerProfile>({
    method: "GET",
    contractPath: "/api/v2/players/by-tag/{tag}",
    path: `/api/v2/players/by-tag/${encodeURIComponent(tag)}`,
    operationName: "players.getByTag",
    accessToken,
    retry: SAFE_READ_RETRY_POLICY,
    signal,
  });
}

export function getMyPlayerId(
  accessToken: string,
  signal?: AbortSignal,
): Promise<TransportResult<string>> {
  return resourceRequest<string>({
    method: "GET",
    contractPath: "/api/v2/players/me",
    operationName: "players.getMyPlayerId",
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
  return resourceRequest<PlayerProfile>({
    method: "GET",
    contractPath: "/api/v2/players/me/profile",
    operationName: "players.getMyProfile",
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
  return resourceRequest<PlayerProfile>({
    method: "PATCH",
    contractPath: "/api/v2/players/me",
    operationName: "players.updateMyProfile",
    body: { displayName },
    accessToken,
  });
}
