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

/**
 * 토큰만 담은 응답. 서버의 refresh는 유저를 돌려주지 않는다(ADR-002 서버 확인 결과).
 * refreshToken은 회전형(1회용)이라 받을 때마다 저장소를 덮어써야 한다.
 */
export type AuthTokens = {
  accessToken: string;
  accessTokenExpiresAt: string;
  refreshToken?: string;
};

/** 토큰 + 유저. login과 소셜 코드 교환이 이 형태를 돌려준다. */
export type AuthSession = AuthTokens & {
  user: AuthUser;
};

export interface AuthService {
  login(input: LoginInput): Promise<AuthSession>;
  /**
   * 소셜 로그인 시작.
   * - 즉시 세션을 반환하면(예: Mock) 그대로 로그인 완료.
   * - `null`을 반환하면 외부 브라우저에서 흐름이 이어지고, 세션은 콜백에서 받은
   *   1회용 코드를 `exchangeOAuthCode`로 교환해 완성된다(HTTP).
   */
  oauthLogin(provider: OAuthProvider): Promise<AuthSession | null>;
  /** 소셜 콜백이 넘긴 1회용 코드를 토큰으로 교환한다. 코드는 60초·1회만 유효하다. */
  exchangeOAuthCode(code: string): Promise<AuthSession>;
  /** 회전형이므로 반드시 저장된 refresh token을 넘겨야 한다. 유저는 따로 조회한다. */
  refresh(refreshToken: string): Promise<AuthTokens>;
  /** 서버 측 refresh token 폐기. 토큰이 없으면 서버 호출 없이 끝난다. */
  logout(refreshToken: string | null): Promise<void>;
  getCurrentUser(): Promise<AuthUser>;
  /** 이메일 인증 메일 재발송. 계정 존재 여부를 노출하지 않도록 항상 성공한다. */
  resendVerification(email: string): Promise<void>;
}
