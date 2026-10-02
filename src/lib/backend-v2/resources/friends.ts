import "server-only";
import { resourceRequest } from "../resource-request";
import { SAFE_READ_RETRY_POLICY, type TransportResult } from "../transport";
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
  return resourceRequest<FriendSummary[]>({
    method: "GET",
    contractPath: "/api/v2/friends",
    operationName: "friends.list",
    accessToken,
    retry: SAFE_READ_RETRY_POLICY,
    signal,
  });
}

export function listIncoming(
  accessToken: string,
  signal?: AbortSignal,
): Promise<TransportResult<FriendRequestListItem[]>> {
  return resourceRequest<FriendRequestListItem[]>({
    method: "GET",
    contractPath: "/api/v2/friends/requests/incoming",
    operationName: "friends.listIncoming",
    accessToken,
    retry: SAFE_READ_RETRY_POLICY,
    signal,
  });
}

export function listOutgoing(
  accessToken: string,
  signal?: AbortSignal,
): Promise<TransportResult<FriendRequestListItem[]>> {
  return resourceRequest<FriendRequestListItem[]>({
    method: "GET",
    contractPath: "/api/v2/friends/requests/outgoing",
    operationName: "friends.listOutgoing",
    accessToken,
    retry: SAFE_READ_RETRY_POLICY,
    signal,
  });
}

export function sendRequest(
  toPlayerId: string,
  accessToken: string,
): Promise<TransportResult<FriendRequestSummary>> {
  return resourceRequest<FriendRequestSummary>({
    method: "POST",
    contractPath: "/api/v2/friends/requests",
    operationName: "friends.sendRequest",
    body: { toPlayerId },
    accessToken,
  });
}

export function accept(
  requestId: string,
  accessToken: string,
): Promise<TransportResult<undefined>> {
  return resourceRequest<undefined>({
    method: "POST",
    contractPath: "/api/v2/friends/requests/{requestId}/accept",
    path: `/api/v2/friends/requests/${encodeURIComponent(requestId)}/accept`,
    operationName: "friends.accept",
    accessToken,
  });
}

export function decline(
  requestId: string,
  accessToken: string,
): Promise<TransportResult<undefined>> {
  return resourceRequest<undefined>({
    method: "POST",
    contractPath: "/api/v2/friends/requests/{requestId}/decline",
    path: `/api/v2/friends/requests/${encodeURIComponent(requestId)}/decline`,
    operationName: "friends.decline",
    accessToken,
  });
}

export function cancel(
  requestId: string,
  accessToken: string,
): Promise<TransportResult<undefined>> {
  return resourceRequest<undefined>({
    method: "POST",
    contractPath: "/api/v2/friends/requests/{requestId}/cancel",
    path: `/api/v2/friends/requests/${encodeURIComponent(requestId)}/cancel`,
    operationName: "friends.cancel",
    accessToken,
  });
}

export function remove(
  playerId: string,
  accessToken: string,
): Promise<TransportResult<undefined>> {
  return resourceRequest<undefined>({
    method: "DELETE",
    contractPath: "/api/v2/friends/{playerId}",
    path: `/api/v2/friends/${encodeURIComponent(playerId)}`,
    operationName: "friends.remove",
    accessToken,
  });
}
