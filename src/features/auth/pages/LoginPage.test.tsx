import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { ApiError } from "@/shared/api/errors";

const service = vi.hoisted(() => ({
  login: vi.fn(),
  oauthLogin: vi.fn(),
  exchangeOAuthCode: vi.fn(),
  refresh: vi.fn(),
  logout: vi.fn(),
  getCurrentUser: vi.fn(),
  resendVerification: vi.fn(),
}));

const storage = vi.hoisted(() => ({
  getRefreshToken: vi.fn(async () => null),
  setRefreshToken: vi.fn(async () => {}),
  clear: vi.fn(async () => {}),
}));

vi.mock("../api/auth.service", () => ({ authService: service }));
vi.mock("../lib/authStorage", () => ({ authStorage: storage }));
vi.mock("@/shared/api/client", () => ({ setAccessToken: vi.fn() }));
vi.mock("@/shared/lib/openExternal", () => ({ openExternal: vi.fn(async () => {}) }));

const { LoginPage } = await import("./LoginPage");
const { useAuthStore } = await import("../store/authStore");

const session = {
  accessToken: "access-1",
  accessTokenExpiresAt: new Date(Date.now() + 900_000).toISOString(),
  refreshToken: "refresh-1",
  user: { id: "user_1", email: "a@b.com" },
};

/** 로그인 성공 시 어디로 갔는지 확인할 수 있게 홈 라우트를 함께 그린다. */
function renderLogin(initialEntry: { pathname: string; state?: unknown } = { pathname: "/auth/login" }) {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/auth/login" element={<LoginPage />} />
        <Route path="/app/home" element={<div>홈 화면</div>} />
        <Route path="/app/settings" element={<div>설정 화면</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  window.localStorage.clear();
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

describe("LoginPage", () => {
  it("빈 값으로 제출하면 서버를 부르지 않고 입력 오류를 보여준다", async () => {
    const user = userEvent.setup();
    renderLogin();

    await user.click(screen.getByRole("button", { name: "로그인" }));

    expect(await screen.findAllByText("이메일과 비밀번호를 입력해 주세요.")).not.toHaveLength(0);
    expect(service.login).not.toHaveBeenCalled();
  });

  it("제출 중에는 버튼이 비활성화돼 중복 제출되지 않는다", async () => {
    // docs/06 §9 "로그인 버튼 연타" 시나리오.
    const user = userEvent.setup();
    let resolveLogin: (value: typeof session) => void = () => {};
    service.login.mockReturnValue(
      new Promise<typeof session>((resolve) => {
        resolveLogin = resolve;
      }),
    );
    renderLogin();

    await user.type(screen.getByLabelText("이메일"), "a@b.com");
    await user.type(screen.getByLabelText("비밀번호"), "password");

    const submit = screen.getByRole("button", { name: "로그인" });
    await user.click(submit);
    await waitFor(() => expect(submit).toBeDisabled());

    await user.click(submit);
    await user.click(submit);

    resolveLogin(session);
    await waitFor(() => expect(service.login).toHaveBeenCalledTimes(1));
  });

  it("인증 실패 시 서버 원문이 아니라 앱 문구를 보여준다", async () => {
    const user = userEvent.setup();
    service.login.mockRejectedValue(
      new ApiError(401, "INVALID_CREDENTIALS", "no user row for that email"),
    );
    renderLogin();

    await user.type(screen.getByLabelText("이메일"), "a@b.com");
    await user.type(screen.getByLabelText("비밀번호"), "wrong-password");
    await user.click(screen.getByRole("button", { name: "로그인" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("이메일 또는 비밀번호가 올바르지 않습니다.");
    expect(alert).not.toHaveTextContent("no user row");
  });

  it("이메일 미인증이면 인증 메일 재발송 버튼을 띄운다", async () => {
    const user = userEvent.setup();
    service.login.mockRejectedValue(new ApiError(403, "EMAIL_NOT_VERIFIED", "not verified"));
    service.resendVerification.mockResolvedValue(undefined);
    renderLogin();

    await user.type(screen.getByLabelText("이메일"), "a@b.com");
    await user.type(screen.getByLabelText("비밀번호"), "password");
    await user.click(screen.getByRole("button", { name: "로그인" }));

    await user.click(await screen.findByRole("button", { name: "인증 메일 다시 보내기" }));

    expect(service.resendVerification).toHaveBeenCalledWith("a@b.com");
    expect(await screen.findByText(/인증 메일을 다시 보냈습니다/)).toBeInTheDocument();
  });

  it("가드가 막아 세운 경로로 로그인 후 되돌아간다", async () => {
    // 로그아웃 상태에서 /app/settings로 들어오면 로그인 후 홈이 아니라 거기로 가야 한다.
    const user = userEvent.setup();
    service.login.mockResolvedValue(session);
    renderLogin({ pathname: "/auth/login", state: { from: "/app/settings" } });

    await user.type(screen.getByLabelText("이메일"), "a@b.com");
    await user.type(screen.getByLabelText("비밀번호"), "password");
    await user.click(screen.getByRole("button", { name: "로그인" }));

    expect(await screen.findByText("설정 화면")).toBeInTheDocument();
  });

  it("목적지가 없으면 홈으로 간다", async () => {
    const user = userEvent.setup();
    service.login.mockResolvedValue(session);
    renderLogin();

    await user.type(screen.getByLabelText("이메일"), "a@b.com");
    await user.type(screen.getByLabelText("비밀번호"), "password");
    await user.click(screen.getByRole("button", { name: "로그인" }));

    expect(await screen.findByText("홈 화면")).toBeInTheDocument();
  });

  it("화면을 떠나면 이전 오류가 남지 않는다", async () => {
    const user = userEvent.setup();
    service.login.mockRejectedValue(new ApiError(401, "INVALID_CREDENTIALS", "x"));
    const { unmount } = renderLogin();

    await user.type(screen.getByLabelText("이메일"), "a@b.com");
    await user.type(screen.getByLabelText("비밀번호"), "wrong");
    await user.click(screen.getByRole("button", { name: "로그인" }));
    await screen.findByRole("alert");

    unmount();

    expect(useAuthStore.getState().loginError).toBeNull();
  });
});
