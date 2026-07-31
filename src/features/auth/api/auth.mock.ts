import { authError } from "@/shared/api/errors";
import type {
  AuthService,
  AuthSession,
  AuthTokens,
  AuthUser,
  LoginInput,
  OAuthProvider,
} from "./auth.contract";

/**
 * 개발용 Mock. 실제 계약과 동일한 타입을 반환한다(docs/10 §6).
 * 운영 build에서는 auth.service.ts가 이 구현을 선택하지 않는다.
 */
const DEMO_EMAIL = "demo@standin.app";
const DEMO_PASSWORD = "password";

const demoUser: AuthUser = {
  id: "user_demo",
  email: DEMO_EMAIL,
  displayName: "데모 작가",
};

// Mock 세션을 모듈 메모리에 유지해 refresh/getCurrentUser 동작을 흉내낸다.
let mockSession: AuthSession | null = null;

function delay(ms = 500): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function makeSession(user: AuthUser = demoUser): AuthSession {
  const expires = new Date(Date.now() + 15 * 60 * 1000).toISOString();
  return {
    accessToken: `mock_access_${Date.now()}`,
    accessTokenExpiresAt: expires,
    // 실제 서버처럼 매번 새 값을 준다(회전형).
    refreshToken: `mock_refresh_${Date.now()}`,
    user,
  };
}

export const authMock: AuthService = {
  async login(input: LoginInput): Promise<AuthSession> {
    await delay();
    if (input.email !== DEMO_EMAIL || input.password !== DEMO_PASSWORD) {
      throw authError("이메일 또는 비밀번호가 올바르지 않습니다.");
    }
    mockSession = makeSession();
    return mockSession;
  },

  async oauthLogin(provider: OAuthProvider): Promise<AuthSession> {
    await delay();
    const labels: Record<OAuthProvider, string> = {
      google: "Google",
      kakao: "카카오",
      naver: "네이버",
    };
    mockSession = makeSession({
      id: `user_${provider}_demo`,
      email: `${provider}@standin.app`,
      displayName: `${labels[provider]} 데모`,
    });
    return mockSession;
  },

  async exchangeOAuthCode(code: string): Promise<AuthSession> {
    await delay(300);
    if (!code) throw authError("로그인 정보가 만료되었습니다. 다시 시도해 주세요.");
    mockSession = makeSession();
    return mockSession;
  },

  async refresh(refreshToken: string): Promise<AuthTokens> {
    await delay(300);
    // 실제 서버처럼 저장된 토큰과 다르면 거부한다(회전형 재사용 감지).
    if (!mockSession || refreshToken !== mockSession.refreshToken) {
      throw authError("세션이 만료되었습니다. 다시 로그인해 주세요.");
    }
    mockSession = makeSession(mockSession.user);
    // 실제 서버처럼 user는 빼고 토큰만 돌려준다.
    return {
      accessToken: mockSession.accessToken,
      accessTokenExpiresAt: mockSession.accessTokenExpiresAt,
      refreshToken: mockSession.refreshToken,
    };
  },

  async logout(): Promise<void> {
    await delay(200);
    mockSession = null;
  },

  async getCurrentUser(): Promise<AuthUser> {
    await delay(200);
    if (!mockSession) throw authError("세션이 만료되었습니다. 다시 로그인해 주세요.");
    return mockSession.user;
  },

  async resendVerification(): Promise<void> {
    await delay(300);
  },
};
