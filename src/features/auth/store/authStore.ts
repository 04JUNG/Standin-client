import { create } from "zustand";
import { setAccessToken } from "@/shared/api/client";
import { isAppError } from "@/shared/api/errors";
import { authService } from "../api/auth.service";
import { authStorage } from "../lib/authStorage";
import type { AuthUser, LoginInput } from "../api/auth.contract";

/** docs/06 §7 인증 가드 상태. */
export type AuthStatus = "initializing" | "authenticated" | "unauthenticated";

type AuthState = {
  status: AuthStatus;
  user: AuthUser | null;
  loginError: string | null;
  login(input: LoginInput): Promise<void>;
  logout(): Promise<void>;
  restore(): Promise<void>;
};

function messageOf(err: unknown, fallback: string): string {
  if (isAppError(err)) return err.message;
  if (err instanceof Error) return err.message;
  return fallback;
}

export const useAuthStore = create<AuthState>((set) => ({
  status: "initializing",
  user: null,
  loginError: null,

  async login(input) {
    set({ loginError: null });
    try {
      const session = await authService.login(input);
      setAccessToken(session.accessToken);
      if (session.refreshToken) await authStorage.setRefreshToken(session.refreshToken);
      set({ status: "authenticated", user: session.user });
    } catch (err) {
      set({ loginError: messageOf(err, "로그인에 실패했습니다.") });
      throw err;
    }
  },

  async logout() {
    // 서버 로그아웃이 실패해도 로컬 세션은 제거한다(docs/06 §2).
    try {
      await authService.logout();
    } catch {
      // 무시하고 로컬 정리를 계속한다.
    }
    setAccessToken(null);
    await authStorage.clear();
    set({ status: "unauthenticated", user: null, loginError: null });
  },

  async restore() {
    const refreshToken = await authStorage.getRefreshToken();
    if (!refreshToken) {
      set({ status: "unauthenticated", user: null });
      return;
    }
    try {
      const session = await authService.refresh();
      setAccessToken(session.accessToken);
      if (session.refreshToken) await authStorage.setRefreshToken(session.refreshToken);
      set({ status: "authenticated", user: session.user });
    } catch {
      setAccessToken(null);
      await authStorage.clear();
      set({ status: "unauthenticated", user: null });
    }
  },
}));
