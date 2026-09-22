import { keepPreviousData, useQuery } from "@tanstack/react-query";
import apiFetch from "../httpClient";
import type { Highscore, Highscores } from "../types";

// /api/highscores returns a bare array, not a paginated envelope - DataTable.tsx expects a
// Summary (content/totalElements/number/size/...), a shape borrowed from a Spring-Data-style
// backend this API doesn't have. Since the backend doesn't return a real total count, this
// assumes there's at least one more page whenever a full page comes back, and stops as soon as
// a short/empty page arrives - the standard "unknown total" recipe for MUI DataGrid pagination.
function toSummary(
  content: Highscore[],
  page: number,
  results: number,
): Highscores {
  const hasMore = content.length === results;
  return {
    content,
    number: page,
    size: results,
    numberOfElements: content.length,
    totalElements: page * results + content.length + (hasMore ? 1 : 0),
    totalPages: hasMore ? page + 2 : page + 1,
    first: page === 0,
    last: !hasMore,
    sort: null,
  };
}

export default function useHighscores(page: number, results: number) {
  return useQuery({
    queryKey: ["highscores", page, results],
    queryFn: async () => {
      const content = await apiFetch<Highscore[]>(
        `/api/highscores?page=${page}&results=${results}`,
      );
      return toSummary(content, page, results);
    },
    placeholderData: keepPreviousData,
  });
}
