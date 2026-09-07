import { useQuery } from "@tanstack/react-query";
import { modelsService } from "../api/models.service";
import { modelQueryKeys } from "../queryKeys";

/**
 * 모델 카탈로그. 서버 배포에서만 바뀌는 값이라 오래 캐시한다.
 *
 * 실패해도 흐름을 막지 않는다 — `models.http`가 "이 배포엔 없다"(404/501/503)를 폴백
 * 카탈로그로 바꿔 주므로, 여기로 오는 오류는 네트워크·5xx뿐이고 그때만 재시도를 보여준다.
 */
export function useModelCatalog() {
  return useQuery({
    queryKey: modelQueryKeys.catalog(),
    queryFn: ({ signal }) => modelsService.list({ signal }),
    staleTime: 10 * 60 * 1000,
    retry: 1,
  });
}
