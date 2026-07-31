import { useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "../store/authStore";

/**
 * 로그아웃 흐름(docs/06 §2): 확인 → 서버 세션 폐기 → 로컬 토큰 삭제 → 로그인 화면.
 *
 * Query cache 비우기는 여기가 아니라 App.tsx의 상태 전이 구독이 처리한다 —
 * 토큰 만료로 세션이 끊기는 경로도 같이 덮어야 하기 때문이다.
 *
 * 로그아웃 진입점이 홈·설정 여러 곳이라 확인 상태까지 훅에 담아 화면마다 다시 짜지 않게 한다.
 */
export function useLogout() {
  const navigate = useNavigate();
  const logout = useAuthStore((s) => s.logout);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pending, setPending] = useState(false);

  const requestLogout = useCallback(() => setConfirmOpen(true), []);
  const cancelLogout = useCallback(() => setConfirmOpen(false), []);

  const confirmLogout = useCallback(async () => {
    setPending(true);
    try {
      // 서버 호출이 실패해도 로컬 세션은 정리된다(store가 보장).
      await logout();
      navigate("/auth/login", { replace: true });
    } finally {
      setPending(false);
      setConfirmOpen(false);
    }
  }, [logout, navigate]);

  return { confirmOpen, pending, requestLogout, cancelLogout, confirmLogout };
}
