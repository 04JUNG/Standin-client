import { create } from "zustand";
import { setAccessToken } from "@/shared/api/client";
import { toAppError } from "@/shared/api/errors";
import { authService } from "../api/auth.service";
import { authStorage } from "../lib/authStorage";
import type { AuthUser, LoginInput, OAuthProvider } from "../api/auth.contract";

/** docs/06 §7 인증 가드 상태. */
export type AuthStatus = "initializing" | "authenticated" | "unauthenticated";

type AuthState = {
  status: AuthStatus;
  user: AuthUser | null;
  loginError: string | null;
  /**
   * 로그인 실패가 "이메일 미인증" 때문일 때의 대상 이메일. 인증 메일 재발송 버튼을
   * 띄울지 판단하는 데 쓴다.
   */
  unverifiedEmail: string | null;
  login(input: LoginInput): Promise<void>;
  /** 소셜 로그인. true=세션 완료(즉시 로그인), false=외부 브라우저에서 진행(콜백 대기). */
  oauthLogin(provider: OAuthProvider): Promise<boolean>;
  /** 소셜 콜백이 넘긴 1회용 코드로 세션을 완성한다. */
  completeOAuth(code: string): Promise<void>;
  logout(): Promise<void>;
  restore(): Promise<void>;
  /** 토큰 재발급 실패 등으로 세션이 끝났을 때. 로컬 상태만 정리한다. */
  endSession(message?: string): void;
  setLoginError(message: string | null): void;
};

/** 서버 원문이 아니라 코드로 고른 앱 문구를 쓴다(docs/06 §4). */
function messageOf(err: unknown, fallback: string): string {
  const appError = toAppError(err);
  return appError.message || fallback;
}

/** 이메일 미인증(403 EMAIL_NOT_VERIFIED)인지. 재발송 안내를 띄울지 판단한다. */
function isUnverifiedEmailError(err: unknown): boolean {
  return (
    typeof err === "object" && err !== null && "code" in err && err.code === "EMAIL_NOT_VERIFIED"
  );
}

export const useAuthStore = create<AuthState>((set) => ({
  status: "initializing",
  user: null,
  loginError: null,
  unverifiedEmail: null,

  setLoginError(message) {
    // 오류를 지울 때는 딸린 안내(재발송 버튼)도 같이 지운다.
    set(message === null ? { loginError: null, unverifiedEmail: null } : { loginError: message });
  },

  async login(input) {
    set({ loginError: null, unverifiedEmail: null });
    try {
      const session = await authService.login(input);
      setAccessToken(session.accessToken);
      if (session.refreshToken) await authStorage.setRefreshToken(session.refreshToken);
      set({ status: "authenticated", user: session.user });
    } catch (err) {
      set({
        loginError: messageOf(err, "로그인에 실패했습니다."),
        unverifiedEmail: isUnverifiedEmailError(err) ? input.email : null,
      });
      throw err;
    }
  },

  async oauthLogin(provider) {
    set({ loginError: null, unverifiedEmail: null });
    try {
      const session = await authService.oauthLogin(provider);
      if (!session) return false; // HTTP: 외부 브라우저로 진행 → 콜백에서 완성
      setAccessToken(session.accessToken);
      if (session.refreshToken) await authStorage.setRefreshToken(session.refreshToken);
      set({ status: "authenticated", user: session.user });
      return true;
    } catch (err) {
      set({ loginError: messageOf(err, "소셜 로그인에 실패했습니다.") });
      throw err;
    }
  },

  async completeOAuth(code) {
    const session = await authService.exchangeOAuthCode(code);
    setAccessToken(session.accessToken);
    if (session.refreshToken) await authStorage.setRefreshToken(session.refreshToken);
    set({ status: "authenticated", user: session.user, loginError: null, unverifiedEmail: null });
  },

  async logout() {
    // 서버 로그아웃이 실패해도 로컬 세션은 제거한다(docs/06 §2).
    try {
      await authService.logout(await authStorage.getRefreshToken());
    } catch {
      // 무시하고 로컬 정리를 계속한다.
    }
    setAccessToken(null);
    await authStorage.clear();
    set({ status: "unauthenticated", user: null, loginError: null, unverifiedEmail: null });
  },

  endSession(message) {
    setAccessToken(null);
    void authStorage.clear();
    set({
      status: "unauthenticated",
      user: null,
      loginError: message ?? null,
      unverifiedEmail: null,
    });
  },

  async restore() {
    const refreshToken = await authStorage.getRefreshToken();
    if (!refreshToken) {
      set({ status: "unauthenticated", user: null });
      return;
    }
    try {
      const tokens = await authService.refresh(refreshToken);
      setAccessToken(tokens.accessToken);
      // 회전형이라 새 refresh token으로 반드시 덮어쓴다 — 안 하면 다음 실행에서 폐기된 토큰을 쓴다.
      if (tokens.refreshToken) await authStorage.setRefreshToken(tokens.refreshToken);
      // refresh 응답에는 user가 없다(ADR-002 서버 확인 결과). 따로 조회한다.
      const user = await authService.getCurrentUser();
      set({ status: "authenticated", user });
    } catch {
      setAccessToken(null);
      await authStorage.clear();
      set({ status: "unauthenticated", user: null });
    }
  },
}));
