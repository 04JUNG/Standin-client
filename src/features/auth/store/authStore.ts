import { create } from "zustand";
import { setAccessToken } from "@/shared/api/client";
import { isAppError } from "@/shared/api/errors";
import { authService } from "../api/auth.service";
import { authStorage } from "../lib/authStorage";
import type { AuthUser, LoginInput, OAuthProvider } from "../api/auth.contract";

/** docs/06 §7 인증 가드 상태. */
export type AuthStatus = "initializing" | "authenticated" | "unauthenticated";

type AuthState = {
  status: AuthStatus;
  user: AuthUser | null;
  loginError: string | null;
  login(input: LoginInput): Promise<void>;
  /** 소셜 로그인. true=세션 완료(즉시 로그인), false=외부 브라우저에서 진행(콜백 대기). */
  oauthLogin(provider: OAuthProvider): Promise<boolean>;
  /** 소셜 콜백에서 받은 토큰으로 세션 완성(/auth/callback). */
  completeOAuth(accessToken: string, refreshToken?: string): Promise<void>;
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

  async oauthLogin(provider) {
    set({ loginError: null });
    try {
      const session = await authService.oauthLogin(provider);
      if (!session) return false; // HTTP: 외부 브라우저로 진행 → /auth/callback에서 완성
      setAccessToken(session.accessToken);
      if (session.refreshToken) await authStorage.setRefreshToken(session.refreshToken);
      set({ status: "authenticated", user: session.user });
      return true;
    } catch (err) {
      set({ loginError: messageOf(err, "소셜 로그인에 실패했습니다.") });
      throw err;
    }
  },

  async completeOAuth(accessToken, refreshToken) {
    setAccessToken(accessToken);
    if (refreshToken) await authStorage.setRefreshToken(refreshToken);
    const user = await authService.getCurrentUser();
    set({ status: "authenticated", user, loginError: null });
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
