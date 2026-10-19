import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { SearchPage } from "./SearchPage";
import { usePoseSelectionStore } from "@/features/pose-viewer/store/poseSelectionStore";
import { ApiError } from "@/shared/api/client";

const loadResult = vi.hoisted(() => vi.fn());
vi.mock("@/features/pose-viewer/api/pose.service", () => ({ poseService: { loadResult } }));
const api = vi.hoisted(() => ({ searchCapabilities: vi.fn(), searchPoses: vi.fn() }));
vi.mock("./api", () => api);
vi.mock("@/shared/components/AppShell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <main>{children}</main>,
}));

function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/app/search"]}>
        <Routes>
          <Route path="/app/search" element={<SearchPage />} />
          <Route path="/app/jobs/:jobId" element={<p>후보 화면</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
beforeEach(() => {
  api.searchCapabilities.mockResolvedValue({
    available: true,
    maxQueryLength: 500,
    maxTopK: 20,
    supportsAllResults: true,
  });
  api.searchPoses.mockReset();
  loadResult.mockResolvedValue({ jobId: "job_new", source: "semantic", people: [] });
  usePoseSelectionStore.getState().clearSelection();
});
afterEach(() => vi.clearAllMocks());
it("empty input stays disabled; examples fill text without making a request", async () => {
  setup();
  await screen.findByRole("textbox");
  expect(screen.getByRole("button", { name: "포즈 찾기" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "야구공을 던지는 자세" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "포즈 찾기" })).toBeEnabled());
  expect(api.searchPoses).not.toHaveBeenCalled();
  expect(screen.getByRole("textbox")).toHaveAttribute("maxlength", "500");
});
it("IME composition does not submit; Enter after composition submits", async () => {
  api.searchPoses.mockResolvedValue({ status: "no_result", jobId: null });
  setup();
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "던지는 자세" } });
  await waitFor(() => expect(screen.getByRole("button", { name: "포즈 찾기" })).toBeEnabled());
  fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter", isComposing: true, keyCode: 229 });
  expect(api.searchPoses).not.toHaveBeenCalled();
  fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter", keyCode: 13 });
  await screen.findByText("조건에 맞는 후보를 찾지 못했어요");
  expect(screen.getByRole("textbox")).toHaveValue("던지는 자세");
});
it("unavailable service cannot submit and can be checked again", async () => {
  api.searchCapabilities.mockResolvedValue({
    available: false,
    maxQueryLength: 500,
    maxTopK: 20,
    supportsAllResults: true,
  });
  setup();
  await screen.findByRole("alert");
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "서 있는 자세" } });
  expect(screen.getByRole("button", { name: "포즈 찾기" })).toBeDisabled();
  api.searchCapabilities.mockResolvedValue({
    available: true,
    maxQueryLength: 500,
    maxTopK: 20,
    supportsAllResults: true,
  });
  fireEvent.click(screen.getByRole("button", { name: "다시 확인" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "포즈 찾기" })).toBeEnabled());
});
it("editing aborts the old request; a late result cannot navigate away", async () => {
  let resolve!: (value: unknown) => void;
  api.searchPoses.mockImplementation(
    () =>
      new Promise((r) => {
        resolve = r;
      }),
  );
  setup();
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "이전 문장" } });
  await waitFor(() => expect(screen.getByRole("button", { name: "포즈 찾기" })).toBeEnabled());
  fireEvent.click(screen.getByRole("button", { name: "포즈 찾기" }));
  await waitFor(() => expect(api.searchPoses).toHaveBeenCalledTimes(1));
  const signal = api.searchPoses.mock.calls[0]![1] as AbortSignal;
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "바꾼 문장" } });
  expect(signal.aborted).toBe(true);
  await act(async () => resolve({ status: "ok", jobId: "job_old" }));
  expect(screen.getByRole("textbox")).toHaveValue("바꾼 문장");
  expect(screen.queryByText("후보 화면")).not.toBeInTheDocument();
});
it("a successful search opens the issued job without selecting the first candidate", async () => {
  api.searchPoses.mockResolvedValue({ status: "ok", jobId: "job_new" });
  setup();
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "던지는 자세" } });
  await waitFor(() => expect(screen.getByRole("button", { name: "포즈 찾기" })).toBeEnabled());
  fireEvent.click(screen.getByRole("button", { name: "포즈 찾기" }));
  await screen.findByText("후보 화면");
  expect(api.searchPoses).toHaveBeenCalledWith("던지는 자세", expect.any(AbortSignal), null);
  expect(usePoseSelectionStore.getState().jobId).toBe("job_new");
  expect(usePoseSelectionStore.getState().selectedByPerson).toEqual({});
});
it("server errors use the safe app message and differ from an empty result", async () => {
  api.searchPoses.mockRejectedValue(
    new ApiError(503, "SEMANTIC_UNAVAILABLE", "secret internal path"),
  );
  setup();
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "던지는 자세" } });
  await waitFor(() => expect(screen.getByRole("button", { name: "포즈 찾기" })).toBeEnabled());
  fireEvent.click(screen.getByRole("button", { name: "포즈 찾기" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "지금은 문장 검색을 사용할 수 없습니다",
  );
  expect(screen.queryByText("조건에 맞는 후보를 찾지 못했어요")).not.toBeInTheDocument();
  expect(screen.queryByText("secret internal path")).not.toBeInTheDocument();
});

it("waits for the all-results BFF capability during rollout", async () => {
  api.searchCapabilities.mockResolvedValue({
    available: true,
    maxQueryLength: 500,
    maxTopK: 20,
    supportsAllResults: false,
  });
  setup();
  await screen.findByRole("alert");
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "던지는 자세" } });
  expect(screen.getByRole("button", { name: "포즈 찾기" })).toBeDisabled();
  expect(api.searchPoses).not.toHaveBeenCalled();
});
