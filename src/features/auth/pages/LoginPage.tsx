import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useLocation, useNavigate } from "react-router-dom";
import { Eye, EyeOff } from "lucide-react";
import { Button } from "@/shared/components/Button";
import { Input } from "@/shared/components/Input";
import { env } from "@/shared/lib/env";
import { openExternal } from "@/shared/lib/openExternal";
import { useAuthStore } from "../store/authStore";
import { authService } from "../api/auth.service";
import { SocialLoginButtons } from "../components/SocialLoginButtons";
import type { OAuthProvider } from "../api/auth.contract";
import { loginSchema, type LoginFormValues } from "../schemas/login.schema";
import { DEFAULT_RETURN_TO, setPendingReturnTo } from "../lib/returnTo";
import {
  clearRememberedEmail,
  getRememberedEmail,
  setRememberedEmail,
} from "../lib/rememberedEmail";

/** 로그인 화면(docs/03 §2). 입력/로딩/인증실패/네트워크 상태를 표시한다. */
export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const login = useAuthStore((s) => s.login);
  const oauthLogin = useAuthStore((s) => s.oauthLogin);
  const loginError = useAuthStore((s) => s.loginError);
  const unverifiedEmail = useAuthStore((s) => s.unverifiedEmail);
  const setLoginError = useAuthStore((s) => s.setLoginError);

  const rememberedEmail = getRememberedEmail();
  const [showPassword, setShowPassword] = useState(false);
  const [rememberEmail, setRememberEmail] = useState(rememberedEmail !== "");
  const [resendState, setResendState] = useState<"idle" | "sending" | "sent">("idle");

  // 가드가 막아 세운 목적지. 없으면 홈.
  const returnTo = (location.state as { from?: string } | null)?.from ?? DEFAULT_RETURN_TO;

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: rememberedEmail, password: "" },
  });

  // 이전 방문에서 남은 오류가 다음 진입에 그대로 보이지 않게 한다.
  useEffect(() => {
    return () => setLoginError(null);
  }, [setLoginError]);

  async function onSubmit(values: LoginFormValues) {
    if (rememberEmail) setRememberedEmail(values.email);
    else clearRememberedEmail();
    setResendState("idle");
    try {
      await login(values);
      navigate(returnTo, { replace: true });
    } catch {
      // 오류 메시지는 store의 loginError로 표시된다.
    }
  }

  async function onSocial(provider: OAuthProvider) {
    // 외부 브라우저를 거치면 라우터 상태가 남지 않으므로 목적지를 따로 적어둔다.
    setPendingReturnTo(returnTo);
    try {
      const done = await oauthLogin(provider);
      // Mock: 즉시 세션 완료 → 이동. HTTP: 외부 브라우저로 진행(콜백에서 이동).
      if (done) navigate(returnTo, { replace: true });
    } catch {
      // 오류 메시지는 store의 loginError로 표시된다.
    }
  }

  async function onResendVerification() {
    if (!unverifiedEmail) return;
    setResendState("sending");
    try {
      await authService.resendVerification(unverifiedEmail);
    } catch {
      // 서버는 계정 존재 여부를 노출하지 않으려 항상 성공을 돌려준다.
      // 실패해도 사용자가 할 수 있는 일은 같으므로 같은 안내를 보여준다.
    }
    setResendState("sent");
  }

  return (
    <div className="flex h-full items-center justify-center bg-brand-paper p-6">
      <div className="w-full max-w-[420px] rounded-2xl border border-border bg-surface-0 p-8 shadow-sm">
        <div className="mb-6 text-center">
          <div className="text-[28px] font-bold text-brand-ink">Standin</div>
          <p className="mt-1 text-[14px] text-text-secondary">
            콘티에서 시작하는 3D 포즈 어시스턴트
          </p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
          <Input
            label="이메일"
            type="email"
            autoComplete="username"
            error={errors.email?.message}
            {...register("email")}
          />
          <Input
            label="비밀번호"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            error={errors.password?.message}
            rightSlot={
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? "비밀번호 숨기기" : "비밀번호 표시"}
                aria-pressed={showPassword}
                className="flex h-7 w-7 items-center justify-center rounded text-text-secondary hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-sky"
              >
                {showPassword ? (
                  <EyeOff className="h-4 w-4" aria-hidden />
                ) : (
                  <Eye className="h-4 w-4" aria-hidden />
                )}
              </button>
            }
            {...register("password")}
          />

          <label className="flex cursor-pointer items-center gap-2 text-[13px] text-text-secondary">
            <input
              type="checkbox"
              checked={rememberEmail}
              onChange={(e) => setRememberEmail(e.target.checked)}
              className="h-4 w-4 accent-brand-coral"
            />
            이메일 기억하기
          </label>

          {loginError && (
            <div>
              <p role="alert" className="text-[13px] text-brand-coral">
                {loginError}
              </p>
              {unverifiedEmail &&
                (resendState === "sent" ? (
                  <p className="mt-1 text-[13px] text-text-secondary">
                    인증 메일을 다시 보냈습니다. 메일함을 확인해 주세요.
                  </p>
                ) : (
                  <button
                    type="button"
                    onClick={onResendVerification}
                    disabled={resendState === "sending"}
                    className="mt-1 text-[13px] text-brand-sky underline disabled:opacity-60"
                  >
                    {resendState === "sending" ? "보내는 중…" : "인증 메일 다시 보내기"}
                  </button>
                ))}
            </div>
          )}

          <Button type="submit" size="lg" loading={isSubmitting} className="mt-2 w-full">
            로그인
          </Button>
        </form>

        <div className="my-5 flex items-center gap-3 text-[12px] text-text-secondary">
          <span className="h-px flex-1 bg-border" />
          또는
          <span className="h-px flex-1 bg-border" />
        </div>

        <SocialLoginButtons onSelect={onSocial} disabled={isSubmitting} />

        {/* 회원가입은 앱이 아니라 웹에서 진행한다(docs/06 §1). 약관 동의·이메일 인증이 웹에 있다. */}
        <p className="mt-6 text-center text-[13px] text-text-secondary">
          아직 계정이 없나요?{" "}
          <button
            type="button"
            // 후행 슬래시가 필요하다. 랜딩은 Vite MPA라 가입 페이지가 signup/index.html이고,
            // 슬래시가 없으면 dev 서버가 랜딩 index.html로 폴백한다.
            onClick={() => void openExternal(`${env.webBaseUrl}/signup/`)}
            className="text-brand-sky underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-sky"
          >
            웹에서 계정 만들기
          </button>
        </p>

        {env.useMockApi && (
          <p className="mt-4 rounded-lg bg-surface-2 p-3 text-[12px] text-text-secondary">
            개발 Mock 계정: <code>demo@standin.app</code> / <code>password</code>
          </p>
        )}
      </div>
    </div>
  );
}
