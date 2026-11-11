import { act, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useNavigate } from "react-router-dom";
import { beforeEach, expect, it, vi } from "vitest";
import { BarSearchPage } from "./BarSearchPage";
import { useSemanticSearch } from "@/features/semantic-search/useSemanticSearch";
import { clearSearchDrafts, readSearchDraft } from "@/features/semantic-search/searchDraft";
import { usePoseSelectionStore } from "@/features/pose-viewer/store/poseSelectionStore";
const api = vi.hoisted(() => ({
  searchCapabilities: vi.fn(),
  searchPoses: vi.fn(),
  loadResult: vi.fn(),
}));
vi.mock("@/features/semantic-search/api", () => api);
vi.mock("@/features/pose-viewer/api/pose.service", () => ({
  poseService: { loadResult: api.loadResult },
}));
vi.mock("../components/BarShell", () => ({
  BarShell: ({ children, footer }: { children: React.ReactNode; footer?: React.ReactNode }) => (
    <section>
      {children}
      {footer}
    </section>
  ),
}));
beforeEach(() => {
  clearSearchDrafts();
  api.searchCapabilities.mockResolvedValue({
    available: true,
    maxTopK: 20,
    maxQueryLength: 500,
    supportsAllResults: true,
  });
  api.searchPoses.mockReset().mockResolvedValue({ status: "no_result", jobId: null });
  api.loadResult
    .mockReset()
    .mockResolvedValue({ source: "semantic", jobId: "job_new", people: [] });
  usePoseSelectionStore.getState().clearSelection();
});
it("search starts and ends in the bar without an old-result notice", async () => {
  api.searchPoses.mockResolvedValue({ status: "ok", jobId: "job_new" });
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={["/bar/search"]}>
        <Routes>
          <Route path="/bar/search" element={<BarSearchPage />} />
          <Route path="/bar/candidates" element={<p>바 결과</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  fireEvent.change(screen.getByRole("searchbox"), { target: { value: "공을 던지는 자세" } });
  await waitFor(() => expect(screen.getByRole("button", { name: "포즈 찾기" })).toBeEnabled());
  fireEvent.keyDown(screen.getByRole("searchbox"), { key: "Enter", keyCode: 13 });
  await screen.findByText("바 결과");
  expect(api.searchPoses).toHaveBeenCalledWith("공을 던지는 자세", expect.any(AbortSignal), null);
  expect(screen.queryByText(/이전 검색 결과/)).toBeNull();
});
it("a mode switch restores text and aborts the previous request without searching again", async () => {
  let finishOld!: (value: unknown) => void;
  api.searchPoses.mockImplementationOnce(
    () =>
      new Promise((r) => {
        finishOld = r;
      }),
  );
  const qc = new QueryClient();
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>
  );
  const app = renderHook(() => useSemanticSearch("", "app"), { wrapper });
  await waitFor(() => expect(app.result.current.ready).toBe(true));
  act(() => app.result.current.edit("앉아 있는 자세"));
  act(() => app.result.current.submit());
  await waitFor(() => expect(api.searchPoses).toHaveBeenCalledOnce());
  const signal = api.searchPoses.mock.calls[0][1] as AbortSignal;
  app.unmount();
  expect(signal.aborted).toBe(true);
  const bar = renderHook(() => useSemanticSearch("", "bar"), { wrapper });
  expect(bar.result.current.query).toBe("앉아 있는 자세");
  await act(async () => new Promise((r) => setTimeout(r, 350)));
  expect(api.searchPoses).toHaveBeenCalledOnce();
  act(() => bar.result.current.submit());
  await waitFor(() => expect(api.searchPoses).toHaveBeenCalledTimes(2));
  await act(async () => finishOld({ status: "ok", jobId: "job_old" }));
  expect(api.loadResult).not.toHaveBeenCalled();
  expect(usePoseSelectionStore.getState().jobId).not.toBe("job_old");
  expect(readSearchDraft(undefined, "entry", "")?.query).toBe("앉아 있는 자세");
  bar.unmount();
});
it("switching an already submitted empty result does not search again", async () => {
  const qc = new QueryClient();
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>
  );
  const app = renderHook(() => useSemanticSearch("", "app"), { wrapper });
  await waitFor(() => expect(app.result.current.ready).toBe(true));
  act(() => app.result.current.edit("특별한 자세"));
  act(() => app.result.current.submit());
  await waitFor(() => expect(app.result.current.noResult).toBe(true));
  app.unmount();
  const bar = renderHook(() => useSemanticSearch("", "bar"), { wrapper });
  expect(bar.result.current.query).toBe("특별한 자세");
  await act(async () => new Promise((r) => setTimeout(r, 350)));
  expect(api.searchPoses).toHaveBeenCalledOnce();
  bar.unmount();
});

it("a real route transition keeps the draft without automatically resubmitting", async () => {
  api.searchPoses.mockImplementationOnce(() => new Promise(() => {}));
  function Entry({ surface }: { surface: "app" | "bar" }) {
    const search = useSemanticSearch("", surface);
    const navigate = useNavigate();
    return (
      <>
        <input
          aria-label="문장"
          value={search.query}
          onChange={(e) => search.edit(e.target.value)}
        />
        <button disabled={!search.ready} onClick={search.submit}>
          검색
        </button>
        <button onClick={() => navigate("/bar/search")}>바 전환</button>
      </>
    );
  }
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={["/app/search"]}>
        <Routes>
          <Route path="/app/search" element={<Entry key="app" surface="app" />} />
          <Route path="/bar/search" element={<Entry key="bar" surface="bar" />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  await waitFor(() => expect(screen.getByText("검색")).toBeEnabled());
  fireEvent.change(screen.getByLabelText("문장"), { target: { value: "손을 올린 자세" } });
  fireEvent.click(screen.getByText("검색"));
  await waitFor(() => expect(api.searchPoses).toHaveBeenCalledOnce());
  const signal = api.searchPoses.mock.calls[0][1] as AbortSignal;
  fireEvent.click(screen.getByText("바 전환"));
  expect(screen.getByLabelText("문장")).toHaveValue("손을 올린 자세");
  expect(signal.aborted).toBe(true);
  await act(async () => new Promise((r) => setTimeout(r, 350)));
  expect(api.searchPoses).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByText("검색"));
  await waitFor(() => expect(api.searchPoses).toHaveBeenCalledTimes(2));
});
it("session clear cannot resurrect a pending draft or publish its late response", async () => {
  let finish!: (value: unknown) => void;
  api.searchPoses.mockImplementationOnce(
    () =>
      new Promise((r) => {
        finish = r;
      }),
  );
  const qc = new QueryClient();
  const hook = renderHook(() => useSemanticSearch("", "app"), {
    wrapper: ({ children }) => (
      <QueryClientProvider client={qc}>
        <MemoryRouter>{children}</MemoryRouter>
      </QueryClientProvider>
    ),
  });
  await waitFor(() => expect(hook.result.current.ready).toBe(true));
  act(() => hook.result.current.edit("비공개 문장"));
  act(() => hook.result.current.submit());
  await waitFor(() => expect(api.searchPoses).toHaveBeenCalledOnce());
  clearSearchDrafts();
  await act(async () => finish({ status: "ok", jobId: "job_late" }));
  expect(usePoseSelectionStore.getState().jobId).not.toBe("job_late");
  hook.unmount();
  expect(readSearchDraft(undefined, "entry", "")).toBeUndefined();
});

it("has a bottom back action returning to the bar main screen while keeping the text draft", async () => {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={["/auth/login", "/bar/search"]}>
        <Routes>
          <Route path="/bar/search" element={<BarSearchPage />} />
          <Route path="/bar/actions" element={<p>바 메인</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  fireEvent.change(screen.getByRole("searchbox"), { target: { value: "돌아서는 자세" } });
  fireEvent.click(screen.getByRole("button", { name: "뒤로가기" }));
  expect(await screen.findByText("바 메인")).toBeInTheDocument();
  expect(readSearchDraft(undefined, "entry", "")?.query).toBe("돌아서는 자세");
});
