import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toAppError } from "@/shared/api/errors";
import { useAuthStore } from "../store/authStore";
import { takePendingReturnTo } from "../lib/returnTo";

/**
 * 소셜 로그인 콜백 처리(/auth/callback) — dev 브라우저 경로.
 * BFF가 `OAUTH_SUCCESS_REDIRECT`로 이 경로에 1회용 `code`를 붙여 보낸다.
 * 코드를 토큰으로 교환한 뒤 원래 가려던 화면으로 이동한다.
 * (패키지된 데스크톱 앱은 `deepLinkAuth.ts`가 같은 일을 한다)
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

    const code = params.get("code");
    if (!code) {
      setError("소셜 로그인을 완료하지 못했습니다. 다시 시도해 주세요.");
      return;
    }
    completeOAuth(code)
      .then(() => navigate(takePendingReturnTo(), { replace: true }))
      .catch((err: unknown) => setError(toAppError(err).message));
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
