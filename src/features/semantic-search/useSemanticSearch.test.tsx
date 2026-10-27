import { featureAction } from "@/features/analytics/featureJourney";
import { clearSearchDrafts } from "./searchDraft";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, useLocation } from "react-router-dom";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { useSemanticSearch } from "./useSemanticSearch";
import { usePoseSelectionStore } from "@/features/pose-viewer/store/poseSelectionStore";
vi.mock("@/features/analytics/featureJourney", async (original) => ({
  ...(await original<typeof import("@/features/analytics/featureJourney")>()),
  featureAction: vi.fn(),
}));
const api = vi.hoisted(() => ({
  searchCapabilities: vi.fn(),
  searchPoses: vi.fn(),
  loadResult: vi.fn(),
}));
vi.mock("./api", () => api);
vi.mock("@/features/pose-viewer/api/pose.service", () => ({
  poseService: { loadResult: api.loadResult },
}));
function setup(surface: "app" | "bar" = "app") {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const hook = renderHook(
    () => ({ ...useSemanticSearch("이전 문장", surface), path: useLocation().pathname }),
    {
      wrapper: ({ children }) => (
        <QueryClientProvider client={qc}>
          <MemoryRouter initialEntries={[surface === "bar" ? "/bar/candidates" : "/app/search"]}>
            {children}
          </MemoryRouter>
        </QueryClientProvider>
      ),
    },
  );
  return { ...hook, qc };
}
beforeEach(() => {
  vi.mocked(featureAction).mockClear();
  clearSearchDrafts();
  vi.useRealTimers();
  api.searchCapabilities.mockResolvedValue({
    available: true,
    maxTopK: 20,
    supportsAllResults: true,
  });
  api.searchPoses.mockReset().mockResolvedValue({ status: "no_result", jobId: null });
  api.loadResult
    .mockReset()
    .mockResolvedValue({ source: "semantic", jobId: "job_new", people: [] });
  usePoseSelectionStore.getState().clearSelection();
});
afterEach(() => vi.useRealTimers());
it("typing pauses and Korean composition never search until explicit submission", async () => {
  const { result } = setup();
  await waitFor(() => expect(result.current.ready).toBe(true));
  expect(api.searchPoses).not.toHaveBeenCalled();
  vi.useFakeTimers();
  for (const text of ["하늘을", "하늘을 올라가고 있는 포즈", "한쪽 손을 뻗은 형태"]) {
    act(() => result.current.edit(text));
    await act(async () => vi.advanceTimersByTime(2000));
    expect(api.searchPoses).not.toHaveBeenCalled();
  }
  act(() => {
    result.current.setComposing(true);
    result.current.edit("앉은 자세");
  });
  act(() => result.current.submit());
  expect(api.searchPoses).not.toHaveBeenCalled();
  act(() => result.current.setComposing(false));
  await act(async () => vi.advanceTimersByTime(2000));
  expect(api.searchPoses).not.toHaveBeenCalled();
  await act(async () => result.current.submit());
  expect(api.searchPoses).toHaveBeenCalledOnce();
  expect(api.searchPoses).toHaveBeenCalledWith("앉은 자세", expect.any(AbortSignal), null);
});
it("explicit submission ignores duplicates while pending; unmount aborts the request", async () => {
  api.searchPoses.mockImplementation(() => new Promise(() => {}));
  const { result, unmount } = setup();
  await waitFor(() => expect(result.current.ready).toBe(true));
  vi.useFakeTimers();
  act(() => result.current.edit("걷는 자세"));
  act(() => {
    result.current.submit();
    result.current.submit();
  });
  await act(async () => vi.advanceTimersByTime(1000));
  expect(api.searchPoses).toHaveBeenCalledTimes(1);
  const signal = api.searchPoses.mock.calls[0][1] as AbortSignal;
  unmount();
  expect(signal.aborted).toBe(true);
});
it.each(["app", "bar"] as const)(
  "only the newest fully loaded result can replace selections (%s)",
  async (surface) => {
    let finishOld!: (value: unknown) => void;
    api.searchPoses.mockResolvedValue({ status: "ok", jobId: "job_new" });
    api.loadResult.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishOld = resolve;
        }),
    );
    const { result, qc } = setup(surface);
    await waitFor(() => expect(result.current.ready).toBe(true));
    act(() => result.current.edit("옛 문장"));
    act(() => result.current.submit());
    await waitFor(() => expect(api.loadResult).toHaveBeenCalledTimes(1));
    const signal = api.searchPoses.mock.calls[0][1] as AbortSignal;
    act(() => result.current.edit("새 문장"));
    expect(signal.aborted).toBe(true);
    act(() => result.current.submit());
    await waitFor(() => expect(usePoseSelectionStore.getState().jobId).toBe("job_new"));
    await act(async () => finishOld({ source: "semantic", jobId: "job_old", people: [] }));
    expect(usePoseSelectionStore.getState().jobId).toBe("job_new");
    expect(qc.getQueryData(["analysis", "result", "job_old"])).toBeUndefined();
    expect(result.current.path).toBe(surface === "bar" ? "/bar/candidates" : "/app/jobs/job_new");
  },
);

it("changing the displayed history job aborts pending search and synchronizes the input", async () => {
  let finish!: (value: unknown) => void;
  api.searchPoses.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const qc = new QueryClient();
  const { result, rerender } = renderHook(({ text, job }) => useSemanticSearch(text, "app", job), {
    initialProps: { text: "기존 작업 문장", job: "job_before" },
    wrapper: ({ children }) => (
      <QueryClientProvider client={qc}>
        <MemoryRouter>{children}</MemoryRouter>
      </QueryClientProvider>
    ),
  });
  await waitFor(() => expect(result.current.ready).toBe(true));
  act(() => result.current.edit("검색 중인 문장"));
  act(() => result.current.submit());
  await waitFor(() => expect(api.searchPoses).toHaveBeenCalledOnce());
  const signal = api.searchPoses.mock.calls[0][1] as AbortSignal;
  rerender({ text: "돌아간 작업 문장", job: "job_history" });
  expect(signal.aborted).toBe(true);
  expect(result.current.query).toBe("돌아간 작업 문장");
  await act(async () => finish({ status: "ok", jobId: "job_late" }));
  expect(usePoseSelectionStore.getState().jobId).not.toBe("job_late");
  expect(api.loadResult).not.toHaveBeenCalled();
});

it("an empty Enter result does not trigger another request while idle", async () => {
  const { result } = setup();
  await waitFor(() => expect(result.current.ready).toBe(true));
  vi.useFakeTimers();
  act(() => result.current.edit("찾을 문장"));
  await act(async () => result.current.submit());
  await act(async () => vi.advanceTimersByTime(1000));
  expect(api.searchPoses).toHaveBeenCalledOnce();
});

it("records zero results and repeated attempts with shared IDs, without search text", async () => {
  const { result } = setup("bar");
  await waitFor(() => expect(result.current.ready).toBe(true));
  act(() => result.current.submit());
  await waitFor(() => expect(result.current.noResult).toBe(true));
  const calls = vi.mocked(featureAction).mock.calls;
  const start = calls.find((c) => c[1] === "search_started")!;
  const done = calls.find((c) => c[1] === "search_completed")!;
  expect(start[3]).toMatchObject({ searchOrdinal: 1, source: "semantic", surface: "bar" });
  expect(done[3]).toMatchObject({ attemptId: start[3]!.attemptId, resultCount: 0 });
  expect(JSON.stringify(calls)).not.toContain("이전 문장");
  act(() => result.current.submit());
  await waitFor(() => expect(api.searchPoses).toHaveBeenCalledTimes(2));
  expect(
    vi.mocked(featureAction).mock.calls.filter((c) => c[1] === "search_started")[1][3],
  ).toMatchObject({ searchOrdinal: 2 });
});
