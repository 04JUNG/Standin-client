import { setAccessToken, setUnauthorizedHandler } from "@/shared/api/client";
import { authService } from "../api/auth.service";
import { authStorage } from "./authStorage";
import { useAuthStore } from "../store/authStore";

/**
 * 401을 받았을 때 access token을 재발급하는 방법을 API client에 꽂는다(앱 시작 시 1회).
 *
 * client는 shared 계층이라 auth feature를 import할 수 없다. 그래서 client는 "재발급하는
 * 함수"라는 구멍만 두고, 그 구멍을 여기서 메운다. 동시 401을 하나로 묶는 single-flight는
 * client 쪽이 담당한다(ADR-002).
 */
export function attachAuthRefresh(): void {
  setUnauthorizedHandler(async () => {
    const refreshToken = await authStorage.getRefreshToken();
    if (!refreshToken) {
      // 애초에 세션이 없다. 조용히 실패시키고 원 요청의 401을 그대로 올린다.
      return null;
    }
    try {
      const tokens = await authService.refresh(refreshToken);
      setAccessToken(tokens.accessToken);
      // 회전형이라 새 토큰으로 반드시 덮어쓴다.
      if (tokens.refreshToken) await authStorage.setRefreshToken(tokens.refreshToken);
      return tokens.accessToken;
    } catch {
      // refresh token까지 만료·폐기됐다 → 세션 종료. 화면 이동은 가드가 처리한다.
      useAuthStore.getState().endSession("세션이 만료되었습니다. 다시 로그인해 주세요.");
      return null;
    }
  });
}
