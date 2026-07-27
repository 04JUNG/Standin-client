import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuthStore } from "../store/authStore";

/**
 * 소셜 로그인 콜백 처리(/auth/callback).
 * BFF가 `OAUTH_SUCCESS_REDIRECT`로 이 경로에 `accessToken`·`refreshToken`을 붙여 보낸다.
 * 토큰으로 세션을 완성한 뒤 홈으로 이동한다.
 */
export function OAuthCallbackPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const completeOAuth = useAuthStore((s) => s.completeOAuth);
  const [error, setError] = useState<string | null>(null);
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return; // StrictMode 이중 실행 방지
    ran.current = true;

    const accessToken = params.get("accessToken");
    const refreshToken = params.get("refreshToken") ?? undefined;
    if (!accessToken) {
      setError("로그인 토큰을 받지 못했습니다. 다시 시도해 주세요.");
      return;
    }
    completeOAuth(accessToken, refreshToken)
      .then(() => navigate("/app/home", { replace: true }))
      .catch(() => setError("로그인 완료에 실패했습니다. 다시 시도해 주세요."));
  }, [params, completeOAuth, navigate]);

  return (
    <div className="flex h-full items-center justify-center bg-brand-paper p-6">
      <div className="text-center">
        {error ? (
          <>
            <p role="alert" className="text-[14px] text-brand-coral">
              {error}
            </p>
            <button
              type="button"
              onClick={() => navigate("/auth/login", { replace: true })}
              className="mt-4 text-[13px] text-brand-sky underline"
            >
              로그인 화면으로
            </button>
          </>
        ) : (
          <p className="text-[14px] text-text-secondary">로그인 처리 중…</p>
        )}
      </div>
    </div>
  );
}
