import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { AccessGate } from "./AccessGate";
import { apiFetch } from "@/shared/api/client";
import { ApiError, networkError } from "@/shared/api/errors";
import { useAccessStore } from "@/shared/stores/accessStore";

const { reloadCredentials } = vi.hoisted(() => ({ reloadCredentials: vi.fn() }));

vi.mock("@/shared/api/client", () => ({ apiFetch: vi.fn() }));
vi.mock("@/shared/lib/env", () => ({ env: { useMockApi: false, isProduction: true } }));
vi.mock("@/features/installation/installationStore", () => ({
  useInstallationStore: (selector: (state: unknown) => unknown) =>
    selector({ status: "registered", credentials: { installationId: "inst_test" }, reloadCredentials }),
}));
beforeEach(() => {
  vi.mocked(apiFetch).mockReset();
  reloadCredentials.mockReset().mockResolvedValue(true);
  useAccessStore.setState({ phase: "unknown" });
});
it("existing beta installation must redeem before seeing the product", async () => {
  vi.mocked(apiFetch).mockResolvedValueOnce({ required: true, allowed: false, role: null, showBetaEndedNotice: true, codeRegistered: false });
  render(<AccessGate><span>PRODUCT</span></AccessGate>);
  expect(screen.queryByText("PRODUCT")).not.toBeInTheDocument();
  expect(await screen.findByText("오픈베타가 종료되었습니다")).toBeInTheDocument();
  expect(screen.queryByLabelText("이용 코드")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "확인" }));
  expect(screen.queryByText("오픈베타가 종료되었습니다")).not.toBeInTheDocument();
  expect(screen.queryByText(/서포터즈/)).not.toBeInTheDocument();
  vi.mocked(apiFetch).mockResolvedValueOnce({ required: true, allowed: true, role: "supporter", codeRegistered: true, showBetaEndedNotice: false });
  fireEvent.change(screen.getByLabelText("이용 코드"), { target: { value: "test-code" } });
  fireEvent.click(screen.getByRole("button", { name: "코드 등록" }));
  expect(await screen.findByText("PRODUCT")).toBeInTheDocument();
  expect(apiFetch).toHaveBeenLastCalledWith("/v1/installations/current/access/redeem",
    { auth: false, method: "POST", body: { code: "test-code" } });
});
it("operator needs no code, and later denial closes an already-open app", async () => {
  vi.mocked(apiFetch).mockResolvedValue({ required: true, allowed: true, role: "operator" });
  render(<AccessGate><span>PRODUCT</span></AccessGate>);
  expect(await screen.findByText("PRODUCT")).toBeInTheDocument();
  act(() => useAccessStore.getState().setPhase("blocked"));
  expect(screen.queryByText("PRODUCT")).not.toBeInTheDocument();
  expect(screen.getByLabelText("이용 코드")).toBeInTheDocument();
});
it("offline status never grants access and retry can recover", async () => {
  vi.mocked(apiFetch).mockRejectedValueOnce(networkError());
  render(<AccessGate><span>PRODUCT</span></AccessGate>);
  expect(await screen.findByRole("alert")).toHaveTextContent("인터넷 연결");
  expect(screen.queryByText("PRODUCT")).not.toBeInTheDocument();
  vi.mocked(apiFetch).mockResolvedValueOnce({ required: false, allowed: true, role: null });
  fireEvent.click(screen.getByRole("button", { name: "다시 확인" }));
  expect(await screen.findByText("PRODUCT")).toBeInTheDocument();
});
it("server revocation is applied on focus", async () => {
  vi.mocked(apiFetch).mockResolvedValueOnce({ required: true, allowed: true, role: "supporter" });
  render(<AccessGate><span>PRODUCT</span></AccessGate>);
  await screen.findByText("PRODUCT");
  vi.mocked(apiFetch).mockResolvedValueOnce({ required: true, allowed: false, role: null, codeRegistered: true, showBetaEndedNotice: false });
  fireEvent(window, new Event("focus"));
  await waitFor(() => expect(screen.queryByText("PRODUCT")).not.toBeInTheDocument());
  expect(screen.getByText("이용 권한이 종료되었습니다")).toBeInTheDocument();
  expect(screen.queryByLabelText("이용 코드")).not.toBeInTheDocument();
  expect(screen.queryByText("오픈베타가 종료되었습니다")).not.toBeInTheDocument();
});

it("new installations go directly to code entry without beta or supporter copy", async () => {
  vi.mocked(apiFetch).mockResolvedValue({ required: true, allowed: false, role: null, codeRegistered: false, showBetaEndedNotice: false });
  render(<AccessGate><span>PRODUCT</span></AccessGate>);
  expect(await screen.findByLabelText("이용 코드")).toBeInTheDocument();
  expect(screen.queryByText("오픈베타가 종료되었습니다")).not.toBeInTheDocument();
  expect(screen.queryByText(/서포터즈/)).not.toBeInTheDocument();
});
it("a status refresh preserves the acknowledged notice and an unfinished code", async () => {
  vi.mocked(apiFetch).mockResolvedValue({ required: true, allowed: false, role: null, codeRegistered: false, showBetaEndedNotice: true });
  render(<AccessGate><span>PRODUCT</span></AccessGate>);
  await screen.findByText("오픈베타가 종료되었습니다");
  fireEvent.click(screen.getByRole("button", { name: "확인" }));
  fireEvent.change(screen.getByLabelText("이용 코드"), { target: { value: "unfinished" } });
  fireEvent(window, new Event("focus"));
  await waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(2));
  expect(screen.getByLabelText("이용 코드")).toHaveValue("unfinished");
  expect(screen.queryByText("오픈베타가 종료되었습니다")).not.toBeInTheDocument();
});
it("a previously redeemed installation skips both screens after restarting", async () => {
  vi.mocked(apiFetch).mockResolvedValue({ required: true, allowed: true, role: "supporter", codeRegistered: true, showBetaEndedNotice: false });
  const first = render(<AccessGate><span>PRODUCT</span></AccessGate>);
  await screen.findByText("PRODUCT");
  first.unmount();
  useAccessStore.setState({ phase: "unknown" });
  render(<AccessGate><span>PRODUCT</span></AccessGate>);
  await screen.findByText("PRODUCT");
  expect(screen.queryByLabelText("이용 코드")).not.toBeInTheDocument();
  expect(screen.queryByText("오픈베타가 종료되었습니다")).not.toBeInTheDocument();
});

it("restores stored device credentials once after an installation authentication failure", async () => {
  vi.mocked(apiFetch)
    .mockRejectedValueOnce(new ApiError(401, "INVALID_INSTALLATION", "private server message"))
    .mockResolvedValueOnce({ required: true, allowed: true, role: "operator" });
  render(<AccessGate><span>PRODUCT</span></AccessGate>);
  await screen.findByText("PRODUCT");
  expect(reloadCredentials).toHaveBeenCalledTimes(1);
  expect(apiFetch).toHaveBeenCalledTimes(2);
});
it("persistent invalid authentication stays closed without retry loops, and manual retry restores credentials", async () => {
  vi.mocked(apiFetch).mockRejectedValue(new ApiError(401, "INVALID_INSTALLATION", "secret must not appear"));
  render(<AccessGate><span>PRODUCT</span></AccessGate>);
  expect(await screen.findByRole("alert")).toHaveTextContent("인증정보");
  expect(screen.getByRole("alert")).not.toHaveTextContent("인터넷");
  expect(screen.queryByText("PRODUCT")).not.toBeInTheDocument();
  expect(apiFetch).toHaveBeenCalledTimes(2);
  expect(reloadCredentials).toHaveBeenCalledTimes(1);
  vi.mocked(apiFetch).mockResolvedValueOnce({ required: true, allowed: true, role: "supporter", codeRegistered: true });
  fireEvent.click(screen.getByRole("button", { name: "다시 확인" }));
  await screen.findByText("PRODUCT");
  expect(reloadCredentials).toHaveBeenCalledTimes(2);
  expect(apiFetch).toHaveBeenCalledTimes(3);
});
it("restoring device credentials never grants permission without a server allow response", async () => {
  vi.mocked(apiFetch).mockRejectedValueOnce(new ApiError(401, "INSTALLATION_REQUIRED", "missing"))
    .mockResolvedValueOnce({ required: true, allowed: false, role: null });
  render(<AccessGate><span>PRODUCT</span></AccessGate>);
  await screen.findByLabelText("이용 코드");
  expect(screen.queryByText("PRODUCT")).not.toBeInTheDocument();
});
it("server errors have a server message instead of an internet warning", async () => {
  vi.mocked(apiFetch).mockRejectedValue(new ApiError(503, "INTERNAL", "private server message"));
  render(<AccessGate><span>PRODUCT</span></AccessGate>);
  expect(await screen.findByRole("alert")).toHaveTextContent("서버에서 이용 권한");
  expect(screen.getByRole("alert")).not.toHaveTextContent("인터넷");
  expect(screen.getByRole("alert")).not.toHaveTextContent("private");
  expect(reloadCredentials).not.toHaveBeenCalled();
});
it("a malformed status response is not presented as a connection error", async () => {
  vi.mocked(apiFetch).mockResolvedValue({ allowed: "true" });
  render(<AccessGate><span>PRODUCT</span></AccessGate>);
  expect(await screen.findByRole("alert")).toHaveTextContent("앱 업데이트");
  expect(screen.queryByText("PRODUCT")).not.toBeInTheDocument();
});
it("an online event retries a transient connection failure without restarting the app", async () => {
  vi.mocked(apiFetch).mockRejectedValueOnce(networkError());
  render(<AccessGate><span>PRODUCT</span></AccessGate>);
  await screen.findByRole("alert");
  vi.mocked(apiFetch).mockResolvedValueOnce({ required: false, allowed: true, role: null });
  fireEvent(window, new Event("online"));
  await screen.findByText("PRODUCT");
});
it("an authentication error arriving after unmount cannot restore credentials", async () => {
  let reject: (error: unknown) => void = () => {};
  vi.mocked(apiFetch).mockImplementationOnce(() => new Promise((_, fail) => { reject = fail; }));
  const view = render(<AccessGate><span>PRODUCT</span></AccessGate>);
  view.unmount();
  await act(async () => reject(new ApiError(401, "INVALID_INSTALLATION", "late")));
  expect(reloadCredentials).not.toHaveBeenCalled();
});
