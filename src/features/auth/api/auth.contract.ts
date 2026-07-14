/**
 * 인증 계약. UI 타입과 서버 응답을 직접 결합하지 않고 이 계약을 통해 다룬다(docs/06 §5).
 */
export type LoginInput = {
  email: string;
  password: string;
};

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
  refresh(): Promise<AuthSession>;
  logout(): Promise<void>;
  getCurrentUser(): Promise<AuthUser>;
}
