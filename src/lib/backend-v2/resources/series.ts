import "server-only";
import {
  request,
  SAFE_READ_RETRY_POLICY,
  type TransportResult,
} from "../transport";
import type {
  SeriesDetails,
  SeriesResponse,
  SeriesSummaryPage,
} from "../contracts";

/**
 * Backend V2's `/api/v2/series/*` surface - near-term operations for issue #9 only. Deliberately
 * excludes challenge creation (the web rules/configuration contract isn't ready yet) and
 * StartAttempt/CompleteAttempt (no browser gameplay support in this issue) - see issue #4 scope.
 * The generated contract still describes those endpoints; nothing here calls them.
 */

export interface ListSeriesPageParams {
  readonly limit?: number;
  readonly cursor?: string;
}

function listQuery(params: ListSeriesPageParams | undefined): string {
  if (!params) {
    return "";
  }
  const search = new URLSearchParams();
  if (params.limit !== undefined) {
    search.set("limit", String(params.limit));
  }
  if (params.cursor !== undefined) {
    search.set("cursor", params.cursor);
  }
  const query = search.toString();
  return query ? `?${query}` : "";
}

export function getSeries(
  seriesId: string,
  accessToken: string,
  signal?: AbortSignal,
): Promise<TransportResult<SeriesDetails>> {
  return request<SeriesDetails>({
    method: "GET",
    path: `/api/v2/series/${encodeURIComponent(seriesId)}`,
    accessToken,
    retry: SAFE_READ_RETRY_POLICY,
    signal,
  });
}

function listPage(
  path: string,
  params: ListSeriesPageParams | undefined,
  accessToken: string,
  signal: AbortSignal | undefined,
): Promise<TransportResult<SeriesSummaryPage>> {
  return request<SeriesSummaryPage>({
    method: "GET",
    path: `${path}${listQuery(params)}`,
    accessToken,
    retry: SAFE_READ_RETRY_POLICY,
    signal,
  });
}

export function listIncoming(
  accessToken: string,
  params?: ListSeriesPageParams,
  signal?: AbortSignal,
): Promise<TransportResult<SeriesSummaryPage>> {
  return listPage("/api/v2/series/incoming", params, accessToken, signal);
}

export function listOutgoing(
  accessToken: string,
  params?: ListSeriesPageParams,
  signal?: AbortSignal,
): Promise<TransportResult<SeriesSummaryPage>> {
  return listPage("/api/v2/series/outgoing", params, accessToken, signal);
}

export function listActive(
  accessToken: string,
  params?: ListSeriesPageParams,
  signal?: AbortSignal,
): Promise<TransportResult<SeriesSummaryPage>> {
  return listPage("/api/v2/series/active", params, accessToken, signal);
}

export function listCompleted(
  accessToken: string,
  params?: ListSeriesPageParams,
  signal?: AbortSignal,
): Promise<TransportResult<SeriesSummaryPage>> {
  return listPage("/api/v2/series/completed", params, accessToken, signal);
}

/** Mutations - never retried automatically (issue #11). */

export function accept(
  seriesId: string,
  accessToken: string,
): Promise<TransportResult<SeriesResponse>> {
  return request<SeriesResponse>({
    method: "POST",
    path: `/api/v2/series/${encodeURIComponent(seriesId)}/accept`,
    accessToken,
  });
}

export function decline(
  seriesId: string,
  accessToken: string,
): Promise<TransportResult<SeriesResponse>> {
  return request<SeriesResponse>({
    method: "POST",
    path: `/api/v2/series/${encodeURIComponent(seriesId)}/decline`,
    accessToken,
  });
}

export function cancel(
  seriesId: string,
  accessToken: string,
): Promise<TransportResult<SeriesResponse>> {
  return request<SeriesResponse>({
    method: "POST",
    path: `/api/v2/series/${encodeURIComponent(seriesId)}/cancel`,
    accessToken,
  });
}
