import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { AccessGate } from "./AccessGate";
import { apiFetch } from "@/shared/api/client";
import { useAccessStore } from "@/shared/stores/accessStore";

vi.mock("@/shared/api/client", () => ({ apiFetch: vi.fn() }));
vi.mock("@/shared/lib/env", () => ({ env: { useMockApi: false, isProduction: true } }));
vi.mock("@/features/installation/installationStore", () => ({
  useInstallationStore: (selector: (state: unknown) => unknown) =>
    selector({ status: "registered", credentials: { installationId: "inst_test" } }),
}));
beforeEach(() => {
  vi.mocked(apiFetch).mockReset();
  useAccessStore.setState({ phase: "unknown" });
});
it("existing beta installation must redeem before seeing the product", async () => {
  vi.mocked(apiFetch).mockResolvedValueOnce({ required: true, allowed: false, role: null });
  render(<AccessGate><span>PRODUCT</span></AccessGate>);
  expect(screen.queryByText("PRODUCT")).not.toBeInTheDocument();
  expect(await screen.findByText("오픈베타가 종료되었습니다")).toBeInTheDocument();
  vi.mocked(apiFetch).mockResolvedValueOnce({ required: true, allowed: true, role: "supporter" });
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
  vi.mocked(apiFetch).mockRejectedValueOnce(Error("offline"));
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
  vi.mocked(apiFetch).mockResolvedValueOnce({ required: true, allowed: false, role: null });
  fireEvent(window, new Event("focus"));
  await waitFor(() => expect(screen.queryByText("PRODUCT")).not.toBeInTheDocument());
});
