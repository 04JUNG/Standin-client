import type { QueryClient } from "@tanstack/react-query";
import { useAuthStore } from "@/features/auth/store/authStore";

/**
 * 세션이 끝나면 서버 상태 캐시를 비운다(docs/06 §2, docs/09 §8).
 *
 * 로그아웃 버튼뿐 아니라 토큰 만료로 끊기는 경로도 있어서, 각 진입점에서 지우는 대신
 * 상태 전이 한 곳에서 처리한다 — 다음 사용자가 로그인했을 때 이전 사용자의 데이터가
 * 화면에 남으면 안 된다.
 *
 * 반환값은 구독 해제 함수다.
 */
export function clearQueryCacheOnSessionEnd(queryClient: QueryClient): () => void {
  return useAuthStore.subscribe((state, prev) => {
    if (prev.status === "authenticated" && state.status !== "authenticated") {
      queryClient.clear();
    }
  });
}
