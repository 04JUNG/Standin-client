import { apiFetch } from "@/shared/api/client";
import { endpoints } from "@/shared/api/endpoints";
import type {
  AuthService,
  AuthSession,
  AuthUser,
  LoginInput,
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
