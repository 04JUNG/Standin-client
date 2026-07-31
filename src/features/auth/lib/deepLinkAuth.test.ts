import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const navigate = vi.hoisted(() => vi.fn(async () => {}));
vi.mock("@/app/router", () => ({ router: { navigate } }));

const service = vi.hoisted(() => ({
  exchangeOAuthCode: vi.fn(),
  refresh: vi.fn(),
  logout: vi.fn(),
  login: vi.fn(),
  oauthLogin: vi.fn(),
  getCurrentUser: vi.fn(),
  resendVerification: vi.fn(),
}));
vi.mock("../api/auth.service", () => ({ authService: service }));
vi.mock("./authStorage", () => ({
  authStorage: {
    getRefreshToken: vi.fn(async () => null),
    setRefreshToken: vi.fn(async () => {}),
    clear: vi.fn(async () => {}),
  },
}));
vi.mock("@/shared/api/client", () => ({ setAccessToken: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ isTauri: () => false }));

const { handleUrl } = await import("./deepLinkAuth");
const { useAuthStore } = await import("../store/authStore");

beforeEach(() => {
  useAuthStore.setState({
    status: "unauthenticated",
    user: null,
    loginError: null,
    unverifiedEmail: null,
  });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("딥링크 수신", () => {
  it("standin://open 은 조용히 무시한다", () => {
    // 웹 가입 완료 페이지의 "앱으로 돌아가기"가 이 URL을 연다. 창을 앞으로 가져오는 일은
    // Rust single-instance가 하므로 여기서는 아무 것도 하지 않아야 한다 —
    // 오류 문구가 뜨거나 화면이 튀면 안 된다.
    handleUrl("standin://open");

    expect(useAuthStore.getState().loginError).toBeNull();
    expect(navigate).not.toHaveBeenCalled();
    expect(service.exchangeOAuthCode).not.toHaveBeenCalled();
  });

  it("소셜 콜백은 코드를 교환해 세션을 만든다", async () => {
    service.exchangeOAuthCode.mockResolvedValue({
      accessToken: "a",
      accessTokenExpiresAt: new Date().toISOString(),
      refreshToken: "r",
      user: { id: "u1", email: "a@b.com" },
    });

    handleUrl("standin://auth/callback?code=abc123");
    await vi.waitFor(() => expect(navigate).toHaveBeenCalled());

    expect(service.exchangeOAuthCode).toHaveBeenCalledWith("abc123");
    expect(useAuthStore.getState().status).toBe("authenticated");
  });

  it("코드 없는 콜백은 조용히 넘기지 않고 사유를 남긴다", () => {
    handleUrl("standin://auth/callback");

    expect(useAuthStore.getState().loginError).toBeTruthy();
    expect(navigate).toHaveBeenCalledWith("/auth/login", { replace: true });
  });

  it("URL이 아니면 무시한다", () => {
    handleUrl("not a url");
    expect(navigate).not.toHaveBeenCalled();
  });
});
