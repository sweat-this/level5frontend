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
    operationName: "series.get",
    accessToken,
    retry: SAFE_READ_RETRY_POLICY,
    signal,
  });
}

function listPage(
  path: string,
  operationName: string,
  params: ListSeriesPageParams | undefined,
  accessToken: string,
  signal: AbortSignal | undefined,
): Promise<TransportResult<SeriesSummaryPage>> {
  return request<SeriesSummaryPage>({
    method: "GET",
    path: `${path}${listQuery(params)}`,
    operationName,
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
  return listPage(
    "/api/v2/series/incoming",
    "series.listIncoming",
    params,
    accessToken,
    signal,
  );
}

export function listOutgoing(
  accessToken: string,
  params?: ListSeriesPageParams,
  signal?: AbortSignal,
): Promise<TransportResult<SeriesSummaryPage>> {
  return listPage(
    "/api/v2/series/outgoing",
    "series.listOutgoing",
    params,
    accessToken,
    signal,
  );
}

export function listActive(
  accessToken: string,
  params?: ListSeriesPageParams,
  signal?: AbortSignal,
): Promise<TransportResult<SeriesSummaryPage>> {
  return listPage(
    "/api/v2/series/active",
    "series.listActive",
    params,
    accessToken,
    signal,
  );
}

export function listCompleted(
  accessToken: string,
  params?: ListSeriesPageParams,
  signal?: AbortSignal,
): Promise<TransportResult<SeriesSummaryPage>> {
  return listPage(
    "/api/v2/series/completed",
    "series.listCompleted",
    params,
    accessToken,
    signal,
  );
}

/**
 * Every terminal correspondence record (Completed, Declined, Cancelled, Expired) either
 * participant is in - the durable-history surface. Deliberately separate from `listCompleted`,
 * which stays scoped to series that actually finished play.
 */
export function listHistory(
  accessToken: string,
  params?: ListSeriesPageParams,
  signal?: AbortSignal,
): Promise<TransportResult<SeriesSummaryPage>> {
  return listPage(
    "/api/v2/series/history",
    "series.listHistory",
    params,
    accessToken,
    signal,
  );
}

/** Mutations - never retried automatically (issue #11). */

export function accept(
  seriesId: string,
  accessToken: string,
): Promise<TransportResult<SeriesResponse>> {
  return request<SeriesResponse>({
    method: "POST",
    path: `/api/v2/series/${encodeURIComponent(seriesId)}/accept`,
    operationName: "series.accept",
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
    operationName: "series.decline",
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
    operationName: "series.cancel",
    accessToken,
  });
}
