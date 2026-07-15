import { authError } from "@/shared/api/errors";
import type { AuthService, AuthSession, AuthUser, LoginInput } from "./auth.contract";

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

function makeSession(): AuthSession {
  const expires = new Date(Date.now() + 15 * 60 * 1000).toISOString();
  return {
    accessToken: `mock_access_${Date.now()}`,
    accessTokenExpiresAt: expires,
    refreshToken: "mock_refresh_token",
    user: demoUser,
  };
}

export const authMock: AuthService = {
  async login(input: LoginInput): Promise<AuthSession> {
    await delay();
    if (input.email !== DEMO_EMAIL || input.password !== DEMO_PASSWORD) {
      throw authError("이메일 또는 비밀번호를 확인해 주세요.");
    }
    mockSession = makeSession();
    return mockSession;
  },

  async refresh(): Promise<AuthSession> {
    await delay(300);
    if (!mockSession) throw authError("세션이 만료되었습니다. 다시 로그인해 주세요.");
    mockSession = makeSession();
    return mockSession;
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
};
