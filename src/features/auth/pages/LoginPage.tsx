import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useNavigate } from "react-router-dom";
import { Button } from "@/shared/components/Button";
import { Input } from "@/shared/components/Input";
import { env } from "@/shared/lib/env";
import { useAuthStore } from "../store/authStore";
import { loginSchema, type LoginFormValues } from "../schemas/login.schema";

/** 로그인 화면(docs/03 §2). 입력/로딩/인증실패/네트워크 상태를 표시한다. */
export function LoginPage() {
  const navigate = useNavigate();
  const login = useAuthStore((s) => s.login);
  const loginError = useAuthStore((s) => s.loginError);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  async function onSubmit(values: LoginFormValues) {
    try {
      await login(values);
      navigate("/app/home", { replace: true });
    } catch {
      // 오류 메시지는 store의 loginError로 표시된다.
    }
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
            type="password"
            autoComplete="current-password"
            error={errors.password?.message}
            {...register("password")}
          />

          {loginError && (
            <p role="alert" className="text-[13px] text-brand-coral">
              {loginError}
            </p>
          )}

          <Button type="submit" size="lg" loading={isSubmitting} className="mt-2 w-full">
            로그인
          </Button>
        </form>

        <div className="mt-6 flex justify-between text-[13px] text-text-secondary">
          <span>계정 만들기 / 비밀번호 찾기는 웹에서 진행합니다.</span>
        </div>

        {env.useMockApi && (
          <p className="mt-4 rounded-lg bg-surface-2 p-3 text-[12px] text-text-secondary">
            개발 Mock 계정: <code>demo@standin.app</code> / <code>password</code>
          </p>
        )}
      </div>
    </div>
  );
}
