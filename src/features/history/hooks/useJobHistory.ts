import { useInfiniteQuery } from "@tanstack/react-query";
import { historyService } from "../api/history.service";
import { historyQueryKeys } from "../queryKeys";

const PAGE_SIZE = 20;

/**
 * 작업 기록 목록.
 *
 * `analyze`와 달리 단순 GET이라 재조회가 안전하다 — Job을 만들지 않으므로 쿼터도
 * 동시 분석 슬롯도 건드리지 않는다. 그래서 pose 쿼리처럼 staleTime을 Infinity로
 * 묶지 않고 보통의 캐시 수명을 준다.
 */
export function useJobHistory() {
  const query = useInfiniteQuery({
    queryKey: historyQueryKeys.list(),
    queryFn: ({ pageParam, signal }) =>
      historyService.list({ limit: PAGE_SIZE, cursor: pageParam, signal }),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    staleTime: 30_000,
  });

  return {
    ...query,
    items: query.data?.pages.flatMap((page) => page.items) ?? [],
  };
}
