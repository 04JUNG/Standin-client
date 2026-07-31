import { apiFetch } from "@/shared/api/client";
import { endpoints } from "@/shared/api/endpoints";
import { env } from "@/shared/lib/env";
import { openExternal } from "@/shared/lib/openExternal";
import { authSessionSchema, authTokensSchema, authUserSchema } from "./auth.schema";
import type {
  AuthService,
  AuthSession,
  AuthTokens,
  AuthUser,
  LoginInput,
  OAuthProvider,
} from "./auth.contract";

/**
 * 실제 HTTP 구현(BFF `Standin-app-server`). 서버 응답을 계약 타입으로 변환하는 adapter.
 * 응답은 모두 zod로 검증한다 — 계약 위반을 화면이 아니라 여기서 잡는다(CLAUDE.md §10).
 */
export const authHttp: AuthService = {
  async login(input: LoginInput): Promise<AuthSession> {
    const data = await apiFetch<unknown>(endpoints.auth.login, {
      method: "POST",
      body: input,
      auth: false,
    });
    return authSessionSchema.parse(data);
  },

  async oauthLogin(provider: OAuthProvider): Promise<null> {
    // BFF의 소셜 로그인 시작 URL을 외부 브라우저로 연다.
    // 콜백은 1회용 코드만 딥링크로 넘기고, 토큰은 exchangeOAuthCode에서 받는다.
    const base = env.apiBaseUrl.replace(/\/+$/, "");
    await openExternal(`${base}${endpoints.auth.oauthStart(provider)}`);
    return null;
  },

  async exchangeOAuthCode(code: string): Promise<AuthSession> {
    const data = await apiFetch<unknown>(endpoints.auth.oauthExchange, {
      method: "POST",
      body: { code },
      auth: false,
    });
    return authSessionSchema.parse(data);
  },

  async refresh(refreshToken: string): Promise<AuthTokens> {
    // 서버는 body로 refresh token을 받고, 응답에 user는 포함하지 않는다(ADR-002 서버 확인).
    // 재발급 요청이 401을 받았을 때 다시 재발급을 시도하면 무한히 돈다 → skipRefresh.
    const data = await apiFetch<unknown>(endpoints.auth.refresh, {
      method: "POST",
      body: { refreshToken },
      auth: false,
      skipRefresh: true,
    });
    return authTokensSchema.parse(data);
  },

  async logout(refreshToken: string | null): Promise<void> {
    // 서버는 refresh token으로 세션을 폐기한다. 없으면 폐기할 게 없으니 호출도 하지 않는다.
    if (!refreshToken) return;
    await apiFetch<void>(endpoints.auth.logout, {
      method: "POST",
      body: { refreshToken },
      skipRefresh: true,
    });
  },

  async getCurrentUser(): Promise<AuthUser> {
    const data = await apiFetch<unknown>(endpoints.auth.me);
    return authUserSchema.parse(data);
  },

  async resendVerification(email: string): Promise<void> {
    await apiFetch<void>(endpoints.auth.resendVerification, {
      method: "POST",
      body: { email },
      auth: false,
    });
  },
};
