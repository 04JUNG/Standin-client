import { type ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuthStore } from "@/features/auth/store/authStore";
import { env } from "@/shared/lib/env";
import { useInstallationStore } from "@/features/installation/installationStore";

/**
 * 인증 필요 라우트. unauthenticated면 로그인으로(docs/06 §7).
 *
 * 어디로 가려다 막혔는지 `state.from`으로 넘겨 로그인 후 그 화면으로 되돌린다.
 * initializing은 아직 판단할 수 없는 상태이므로 자식을 렌더하지 않고 기다린다 —
 * 통과시키면 세션 복원 중에 보호 화면이 잠깐 그려진다.
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const status = useAuthStore((s) => s.status);
  const location = useLocation();

  if (env.skipAuth) return <>{children}</>;
  if (status === "initializing") return null;
  if (status === "unauthenticated") {
    return (
      <Navigate to="/auth/login" replace state={{ from: location.pathname + location.search }} />
    );
  }
  return <>{children}</>;
}

/** 인증 화면 가드. 이미 authenticated면 홈으로. */
export function RedirectIfAuthed({ children }: { children: ReactNode }) {
  const status = useAuthStore((s) => s.status);
  if (env.skipAuth || status === "authenticated") return <Navigate to="/app/home" replace />;
  return <>{children}</>;
}

export function RequireInstallation({ children }: { children: ReactNode }) {
  const status = useInstallationStore((state) => state.status);
  const location = useLocation();
  if (status === "initializing") return null;
  if (status !== "registered") {
    return <Navigate to="/beta-consent" replace state={{ from: location.pathname }} />;
  }
  return <>{children}</>;
}
