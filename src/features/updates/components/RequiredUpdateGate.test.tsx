import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useRequiredUpdateStore } from "@/shared/stores/requiredUpdateStore";
import { RequiredUpdateGate } from "./RequiredUpdateGate";

const native = vi.hoisted(() => ({ value: false }));
vi.mock("@tauri-apps/api/core", () => ({ isTauri: () => native.value }));
vi.mock("./AppUpdateSection", () => ({
  AppUpdateSection: () => <div>설치와 재시작</div>,
}));
vi.mock("@/shared/api/client", () => ({
  apiFetch: vi.fn().mockResolvedValue({ minimumVersion: "0.2.0" }),
}));
afterEach(() => vi.unstubAllEnvs());

function renderGate() {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <RequiredUpdateGate>
        <button>분석 시작</button>
      </RequiredUpdateGate>
    </QueryClientProvider>,
  );
}
beforeEach(() => {
  vi.stubEnv("VITE_APP_VERSION", "0.2.0");
  native.value = false;
  useRequiredUpdateStore.setState({ minimumVersion: null });
});
it("supported sessions keep the app available", () => {
  renderGate();
  expect(screen.getByRole("button", { name: "분석 시작" })).toBeInTheDocument();
});
it("a server-required update replaces all application routes with installation UI", () => {
  useRequiredUpdateStore.getState().requireUpdate("0.2.0");
  const view = renderGate();
  expect(screen.queryByRole("button", { name: "분석 시작" })).not.toBeInTheDocument();
  expect(screen.getByText("업데이트가 필요합니다")).toBeInTheDocument();
  expect(screen.getByText("설치와 재시작")).toBeInTheDocument();
  expect(screen.queryByText("나중에")).not.toBeInTheDocument();
  view.rerender(
    <QueryClientProvider client={new QueryClient()}>
      <RequiredUpdateGate>다른 화면</RequiredUpdateGate>
    </QueryClientProvider>,
  );
  expect(screen.queryByText("다른 화면")).not.toBeInTheDocument();
});
it("native old builds are blocked before any server response", async () => {
  vi.stubEnv("VITE_APP_VERSION", "0.1.9");
  native.value = true;
  renderGate();
  expect(screen.queryByRole("button", { name: "분석 시작" })).not.toBeInTheDocument();
  await waitFor(() => expect(useRequiredUpdateStore.getState().minimumVersion).toBe("0.2.0"));
});

it("native supported builds keep the app available", () => {
  native.value = true;
  vi.stubEnv("VITE_APP_VERSION", "0.2.3");
  renderGate();
  expect(screen.getByRole("button", { name: "분석 시작" })).toBeInTheDocument();
});
