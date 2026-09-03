import { useQuery } from "@tanstack/react-query";
import { isServerJobId } from "@/features/pose-viewer/lib/serverJobId";
import { historyService } from "../api/history.service";
import { historyQueryKeys } from "../queryKeys";

/**
 * 이 작업에서 확정했던 선택. 기록 상세가 이전 선택을 화면에 되살릴 때 쓴다.
 *
 * 라이브 분석에는 필요 없다 — 그때의 선택은 아직 화면 안에 있다. 서버 jobId일 때만
 * 조회해서 분석 흐름에 불필요한 요청이 붙지 않게 한다.
 */
export function useJobSelections(jobId: string | undefined) {
  return useQuery({
    queryKey: historyQueryKeys.selections(jobId ?? ""),
    queryFn: ({ signal }) => historyService.selections({ jobId: jobId!, signal }),
    enabled: isServerJobId(jobId),
    staleTime: 30_000,
  });
}
