/**
 * 인증 계약. UI 타입과 서버 응답을 직접 결합하지 않고 이 계약을 통해 다룬다(docs/06 §5).
 */
export type LoginInput = {
  email: string;
  password: string;
};

/** 소셜 로그인 provider(BFF `/v1/auth/oauth/:provider`와 일치). */
export type OAuthProvider = "google" | "kakao" | "naver";

export type AuthUser = {
  id: string;
  email: string;
  displayName?: string;
};

export type AuthSession = {
  accessToken: string;
  accessTokenExpiresAt: string;
  refreshToken?: string;
  user: AuthUser;
};

export interface AuthService {
  login(input: LoginInput): Promise<AuthSession>;
  /**
   * 소셜 로그인 시작.
   * - 즉시 세션을 반환하면(예: Mock) 그대로 로그인 완료.
   * - `null`을 반환하면 외부 브라우저에서 흐름이 이어지고, 세션은 `/auth/callback`에서 완성된다(HTTP).
   */
  oauthLogin(provider: OAuthProvider): Promise<AuthSession | null>;
  refresh(): Promise<AuthSession>;
  logout(): Promise<void>;
  getCurrentUser(): Promise<AuthUser>;
}
