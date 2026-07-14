import { type ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuthStore } from "@/features/auth/store/authStore";

/** 인증 필요 라우트. unauthenticated면 로그인으로(docs/06 §7). */
export function RequireAuth({ children }: { children: ReactNode }) {
  const status = useAuthStore((s) => s.status);
  if (status === "unauthenticated") return <Navigate to="/auth/login" replace />;
  return <>{children}</>;
}

/** 인증 화면 가드. 이미 authenticated면 홈으로. */
export function RedirectIfAuthed({ children }: { children: ReactNode }) {
  const status = useAuthStore((s) => s.status);
  if (status === "authenticated") return <Navigate to="/app/home" replace />;
  return <>{children}</>;
}
