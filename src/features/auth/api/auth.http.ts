import { apiFetch } from "@/shared/api/client";
import { endpoints } from "@/shared/api/endpoints";
import { env } from "@/shared/lib/env";
import { openExternal } from "@/shared/lib/openExternal";
import type {
  AuthService,
  AuthSession,
  AuthUser,
  LoginInput,
  OAuthProvider,
} from "./auth.contract";

/**
 * 실제 HTTP 구현. 서버 응답을 계약 타입으로 변환하는 adapter 자리.
 * 서버 스펙 확정 전이므로 매핑은 서버 확인 후 보강한다(docs/08 §11).
 */
export const authHttp: AuthService = {
  async login(input: LoginInput): Promise<AuthSession> {
    return apiFetch<AuthSession>(endpoints.auth.login, {
      method: "POST",
      body: input,
      auth: false,
    });
  },

  async oauthLogin(provider: OAuthProvider): Promise<null> {
    // BFF의 소셜 로그인 시작 URL을 외부 브라우저로 연다.
    // 토큰은 콜백(BFF → OAUTH_SUCCESS_REDIRECT → /auth/callback)에서 완성되므로 여기선 null.
    const base = env.apiBaseUrl.replace(/\/+$/, "");
    openExternal(`${base}${endpoints.auth.oauthStart(provider)}`);
    return null;
  },

  async refresh(): Promise<AuthSession> {
    // refresh token 전달 형식(body/쿠키)은 서버와 합의 후 확정한다(ADR-002).
    return apiFetch<AuthSession>(endpoints.auth.refresh, {
      method: "POST",
      auth: false,
    });
  },

  async logout(): Promise<void> {
    await apiFetch<void>(endpoints.auth.logout, { method: "POST" });
  },

  async getCurrentUser(): Promise<AuthUser> {
    return apiFetch<AuthUser>(endpoints.auth.me);
  },
};
