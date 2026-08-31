import { useMutation, useQueryClient } from "@tanstack/react-query";
import { poseQueryKeys } from "@/features/pose-viewer/queryKeys";
import { historyService } from "../api/history.service";
import { historyQueryKeys } from "../queryKeys";

/**
 * 기록에서 작업 하나를 지운다.
 *
 * 낙관적 제거는 하지 않는다. 서버가 진행 중인 작업을 409로 거절하므로 되돌리는 경로가
 * 하나 더 생기는데, 목록이 작아 무효화 후 재조회가 충분히 빠르다.
 */
export function useDeleteJob() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (jobId: string) => historyService.remove({ jobId }),
    onSuccess: (_result, jobId) => {
      void queryClient.invalidateQueries({ queryKey: historyQueryKeys.all });
      // 상세를 열어봤다면 그 결과가 캐시에 남아 있다. 지운 작업의 캐시를 두면
      // 뒤로 가기로 되돌아갔을 때 없는 작업이 멀쩡히 보인다.
      queryClient.removeQueries({ queryKey: poseQueryKeys.result(jobId) });
      queryClient.removeQueries({ queryKey: historyQueryKeys.selections(jobId) });
    },
  });
}
