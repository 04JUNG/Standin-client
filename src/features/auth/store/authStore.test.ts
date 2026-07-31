import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/shared/api/errors";
import type { AuthService, AuthSession, AuthTokens } from "../api/auth.contract";

// store가 모듈 로드 시점에 서비스와 저장소를 잡으므로 import보다 먼저 mock해야 한다.
const service = vi.hoisted(() => ({
  login: vi.fn(),
  oauthLogin: vi.fn(),
  exchangeOAuthCode: vi.fn(),
  refresh: vi.fn(),
  logout: vi.fn(),
  getCurrentUser: vi.fn(),
  resendVerification: vi.fn(),
}));

const storage = vi.hoisted(() => {
  let token: string | null = null;
  return {
    getRefreshToken: vi.fn(async () => token),
    setRefreshToken: vi.fn(async (t: string) => {
      token = t;
    }),
    clear: vi.fn(async () => {
      token = null;
    }),
    __set: (t: string | null) => {
      token = t;
    },
    __get: () => token,
  };
});

const setAccessToken = vi.hoisted(() => vi.fn());

vi.mock("../api/auth.service", () => ({ authService: service as unknown as AuthService }));
vi.mock("../lib/authStorage", () => ({ authStorage: storage }));
vi.mock("@/shared/api/client", () => ({ setAccessToken }));

const { useAuthStore } = await import("./authStore");

const user = { id: "user_1", email: "a@b.com", displayName: "작가" };

function session(overrides: Partial<AuthSession> = {}): AuthSession {
  return {
    accessToken: "access-1",
    accessTokenExpiresAt: new Date(Date.now() + 900_000).toISOString(),
    refreshToken: "refresh-1",
    user,
    ...overrides,
  };
}

function tokens(overrides: Partial<AuthTokens> = {}): AuthTokens {
  return {
    accessToken: "access-2",
    accessTokenExpiresAt: new Date(Date.now() + 900_000).toISOString(),
    refreshToken: "refresh-2",
    ...overrides,
  };
}

beforeEach(() => {
  storage.__set(null);
  useAuthStore.setState({
    status: "initializing",
    user: null,
    loginError: null,
    unverifiedEmail: null,
  });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("login", () => {
  it("성공하면 인증 상태가 되고 refresh token을 저장한다", async () => {
    service.login.mockResolvedValue(session());

    await useAuthStore.getState().login({ email: "a@b.com", password: "pw" });

    expect(useAuthStore.getState().status).toBe("authenticated");
    expect(useAuthStore.getState().user).toEqual(user);
    expect(setAccessToken).toHaveBeenCalledWith("access-1");
    expect(storage.__get()).toBe("refresh-1");
  });

  it("실패하면 서버 원문이 아니라 코드로 고른 문구를 보여준다", async () => {
    // 서버 message는 언제든 바뀌고 기술적일 수 있어 화면에 쓰지 않는다(docs/06 §4).
    service.login.mockRejectedValue(
      new ApiError(401, "INVALID_CREDENTIALS", "invalid email or password", "req_9"),
    );

    await expect(
      useAuthStore.getState().login({ email: "a@b.com", password: "wrong" }),
    ).rejects.toThrow();

    const state = useAuthStore.getState();
    expect(state.status).not.toBe("authenticated");
    expect(state.loginError).toBe("이메일 또는 비밀번호가 올바르지 않습니다.");
    expect(state.loginError).not.toContain("invalid email");
  });

  it("이메일 미인증이면 재발송 안내를 띄울 수 있게 대상 이메일을 남긴다", async () => {
    service.login.mockRejectedValue(
      new ApiError(403, "EMAIL_NOT_VERIFIED", "email not verified"),
    );

    await expect(
      useAuthStore.getState().login({ email: "a@b.com", password: "pw" }),
    ).rejects.toThrow();

    expect(useAuthStore.getState().unverifiedEmail).toBe("a@b.com");
  });
});

describe("logout", () => {
  it("저장된 refresh token을 서버에 넘겨 폐기하고 로컬을 정리한다", async () => {
    storage.__set("refresh-1");
    useAuthStore.setState({ status: "authenticated", user });
    service.logout.mockResolvedValue(undefined);

    await useAuthStore.getState().logout();

    expect(service.logout).toHaveBeenCalledWith("refresh-1");
    expect(useAuthStore.getState().status).toBe("unauthenticated");
    expect(useAuthStore.getState().user).toBeNull();
    expect(setAccessToken).toHaveBeenCalledWith(null);
    expect(storage.__get()).toBeNull();
  });

  it("서버 로그아웃이 실패해도 로컬 세션은 지운다", async () => {
    // docs/06 §2 — 서버가 죽어도 사용자는 로그아웃할 수 있어야 한다.
    storage.__set("refresh-1");
    useAuthStore.setState({ status: "authenticated", user });
    service.logout.mockRejectedValue(new ApiError(500, "INTERNAL", "boom"));

    await useAuthStore.getState().logout();

    expect(useAuthStore.getState().status).toBe("unauthenticated");
    expect(storage.__get()).toBeNull();
  });
});

describe("restore", () => {
  it("저장된 토큰이 없으면 바로 미인증", async () => {
    await useAuthStore.getState().restore();

    expect(useAuthStore.getState().status).toBe("unauthenticated");
    expect(service.refresh).not.toHaveBeenCalled();
  });

  it("토큰이 있으면 재발급하고, 회전된 새 토큰을 저장한 뒤 유저를 따로 조회한다", async () => {
    // refresh 응답에는 user가 없다 — 예전에는 이걸 읽어서 user가 undefined였다.
    storage.__set("refresh-1");
    service.refresh.mockResolvedValue(tokens());
    service.getCurrentUser.mockResolvedValue(user);

    await useAuthStore.getState().restore();

    expect(service.refresh).toHaveBeenCalledWith("refresh-1");
    expect(storage.__get()).toBe("refresh-2");
    expect(useAuthStore.getState().status).toBe("authenticated");
    expect(useAuthStore.getState().user).toEqual(user);
  });

  it("refresh token이 만료·폐기됐으면 토큰을 지우고 미인증으로 떨어진다", async () => {
    storage.__set("stale");
    service.refresh.mockRejectedValue(new ApiError(401, "INVALID_TOKEN", "revoked"));

    await useAuthStore.getState().restore();

    expect(useAuthStore.getState().status).toBe("unauthenticated");
    expect(useAuthStore.getState().user).toBeNull();
    expect(storage.__get()).toBeNull();
  });
});

describe("completeOAuth", () => {
  it("1회용 코드를 토큰으로 교환해 세션을 만든다", async () => {
    service.exchangeOAuthCode.mockResolvedValue(session({ refreshToken: "refresh-oauth" }));

    await useAuthStore.getState().completeOAuth("code-abc");

    expect(service.exchangeOAuthCode).toHaveBeenCalledWith("code-abc");
    expect(useAuthStore.getState().status).toBe("authenticated");
    expect(storage.__get()).toBe("refresh-oauth");
  });
});

describe("endSession", () => {
  it("토큰 만료로 끊겼을 때 사유를 남기고 미인증으로 만든다", () => {
    useAuthStore.setState({ status: "authenticated", user });

    useAuthStore.getState().endSession("세션이 만료되었습니다. 다시 로그인해 주세요.");

    const state = useAuthStore.getState();
    expect(state.status).toBe("unauthenticated");
    expect(state.user).toBeNull();
    expect(state.loginError).toBe("세션이 만료되었습니다. 다시 로그인해 주세요.");
  });
});
