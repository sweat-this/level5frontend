import "server-only";
import {
  request,
  SAFE_READ_RETRY_POLICY,
  type TransportResult,
} from "../transport";
import type {
  FriendRequestListItem,
  FriendRequestSummary,
  FriendSummary,
} from "../contracts";

/**
 * Backend V2's `/api/v2/friends/*` surface - near-term operations for issue #8. Reads use the
 * bounded safe-read retry policy; every mutation is never retried automatically (issue #11).
 */

export function listFriends(
  accessToken: string,
  signal?: AbortSignal,
): Promise<TransportResult<FriendSummary[]>> {
  return request<FriendSummary[]>({
    method: "GET",
    path: "/api/v2/friends",
    accessToken,
    retry: SAFE_READ_RETRY_POLICY,
    signal,
  });
}

export function listIncoming(
  accessToken: string,
  signal?: AbortSignal,
): Promise<TransportResult<FriendRequestListItem[]>> {
  return request<FriendRequestListItem[]>({
    method: "GET",
    path: "/api/v2/friends/requests/incoming",
    accessToken,
    retry: SAFE_READ_RETRY_POLICY,
    signal,
  });
}

export function listOutgoing(
  accessToken: string,
  signal?: AbortSignal,
): Promise<TransportResult<FriendRequestListItem[]>> {
  return request<FriendRequestListItem[]>({
    method: "GET",
    path: "/api/v2/friends/requests/outgoing",
    accessToken,
    retry: SAFE_READ_RETRY_POLICY,
    signal,
  });
}

export function sendRequest(
  toPlayerId: string,
  accessToken: string,
): Promise<TransportResult<FriendRequestSummary>> {
  return request<FriendRequestSummary>({
    method: "POST",
    path: "/api/v2/friends/requests",
    body: { toPlayerId },
    accessToken,
  });
}

export function accept(
  requestId: string,
  accessToken: string,
): Promise<TransportResult<undefined>> {
  return request<undefined>({
    method: "POST",
    path: `/api/v2/friends/requests/${encodeURIComponent(requestId)}/accept`,
    accessToken,
  });
}

export function decline(
  requestId: string,
  accessToken: string,
): Promise<TransportResult<undefined>> {
  return request<undefined>({
    method: "POST",
    path: `/api/v2/friends/requests/${encodeURIComponent(requestId)}/decline`,
    accessToken,
  });
}

export function cancel(
  requestId: string,
  accessToken: string,
): Promise<TransportResult<undefined>> {
  return request<undefined>({
    method: "POST",
    path: `/api/v2/friends/requests/${encodeURIComponent(requestId)}/cancel`,
    accessToken,
  });
}

export function remove(
  playerId: string,
  accessToken: string,
): Promise<TransportResult<undefined>> {
  return request<undefined>({
    method: "DELETE",
    path: `/api/v2/friends/${encodeURIComponent(playerId)}`,
    accessToken,
  });
}
