import { clearSearchDrafts } from "./searchDraft";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { SemanticSearchBar } from "./SemanticSearchBar";
import { usePoseSelectionStore } from "@/features/pose-viewer/store/poseSelectionStore";
import { ApiError } from "@/shared/api/client";

const loadResult = vi.hoisted(() => vi.fn());
vi.mock("@/features/pose-viewer/api/pose.service", () => ({ poseService: { loadResult } }));
const api = vi.hoisted(() => ({ searchCapabilities: vi.fn(), searchPoses: vi.fn() }));
vi.mock("./api", () => api);

function setup(surface: "app" | "bar" = "app") {
  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <MemoryRouter initialEntries={["/previous"]}>
        <Routes>
          <Route
            path="/previous"
            element={
              <>
                <SemanticSearchBar initialQuery="두 팔을 든 자세" surface={surface} />
                <p>이전 포즈 카드</p>
              </>
            }
          />
          <Route path="/app/jobs/:jobId" element={<p>새 앱 검색 결과</p>} />
          <Route path="/bar/candidates" element={<p>새 플로팅 바 검색 결과</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
async function ready() {
  await waitFor(() => expect(screen.getByRole("button", { name: "다시 검색" })).toBeEnabled());
  return screen.getByRole("searchbox");
}
beforeEach(() => {
  clearSearchDrafts();
  api.searchCapabilities.mockReset().mockResolvedValue({
    available: true,
    maxQueryLength: 500,
    maxTopK: 20,
    supportsAllResults: true,
  });
  api.searchPoses.mockReset();
  loadResult.mockReset().mockResolvedValue({ jobId: "job_new", source: "semantic", people: [] });
  usePoseSelectionStore.getState().clearSelection();
});
afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

it.each(["app", "bar"] as const)(
  "%s searches from the result screen and keeps the correct surface",
  async (surface) => {
    api.searchPoses.mockResolvedValue({ status: "ok", jobId: "job_new" });
    setup(surface);
    const input = await ready();
    expect(input).toHaveValue("두 팔을 든 자세");
    expect(input).toHaveAttribute("maxlength", "500");
    expect(screen.queryByText(/문장을? 바꿔 검색하기/)).toBeNull();
    fireEvent.change(input, { target: { value: "왼팔을 뻗은 자세" } });
    fireEvent.keyDown(input, { key: "Enter", keyCode: 13 });
    await screen.findByText(surface === "bar" ? "새 플로팅 바 검색 결과" : "새 앱 검색 결과");
    expect(api.searchPoses).toHaveBeenCalledWith("왼팔을 뻗은 자세", expect.any(AbortSignal), null);
    expect(usePoseSelectionStore.getState().selectedByPerson).toEqual({});
  },
);
it("composition Enter waits; button submits once while pending and labels old cards", async () => {
  api.searchPoses.mockImplementation(() => new Promise(() => {}));
  setup();
  const input = await ready();
  fireEvent.keyDown(input, { key: "Enter", isComposing: true, keyCode: 229 });
  expect(api.searchPoses).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "다시 검색" }));
  await waitFor(() => expect(api.searchPoses).toHaveBeenCalledTimes(1));
  fireEvent.keyDown(input, { key: "Enter", keyCode: 13 });
  expect(api.searchPoses).toHaveBeenCalledTimes(1);
  expect(screen.getByRole("button", { name: "찾는 중…" })).toBeDisabled();
  expect(screen.getByText("새 포즈를 찾고 있어요. 아래는 이전 검색 결과예요.")).toBeInTheDocument();
  expect(screen.getByText("이전 포즈 카드")).toBeInTheDocument();
});
it("typing or unmounting cancels old requests and a late result cannot replace the current screen", async () => {
  let resolve!: (value: unknown) => void;
  api.searchPoses.mockImplementation(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  const view = setup();
  const input = await ready();
  fireEvent.click(screen.getByRole("button", { name: "다시 검색" }));
  await waitFor(() => expect(api.searchPoses).toHaveBeenCalledTimes(1));
  const first = api.searchPoses.mock.calls[0]![1] as AbortSignal;
  fireEvent.change(input, { target: { value: "앉아 있는 자세" } });
  expect(first.aborted).toBe(true);
  await act(async () => resolve({ status: "ok", jobId: "job_old" }));
  expect(screen.getByRole("searchbox")).toHaveValue("앉아 있는 자세");
  expect(screen.queryByText("새 앱 검색 결과")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "다시 검색" }));
  await waitFor(() => expect(api.searchPoses).toHaveBeenCalledTimes(2));
  const second = api.searchPoses.mock.calls[1]![1] as AbortSignal;
  view.unmount();
  expect(second.aborted).toBe(true);
});
it("no matches and failures keep the previous result and selection, without exposing server errors", async () => {
  api.searchPoses.mockResolvedValueOnce({ status: "no_result", jobId: null });
  usePoseSelectionStore.getState().startJob("job_previous", null);
  usePoseSelectionStore.getState().selectCandidate(0, "previous_pick");
  setup();
  const input = await ready();
  fireEvent.change(input, { target: { value: "다른 자세" } });
  fireEvent.click(screen.getByRole("button", { name: "다시 검색" }));
  await screen.findByText(/새 검색어에 맞는 포즈가 없어요/);
  expect(usePoseSelectionStore.getState().selectedByPerson[0]).toBe("previous_pick");
  api.searchPoses.mockRejectedValueOnce(
    new ApiError(503, "SEMANTIC_UNAVAILABLE", "private internal path"),
  );
  fireEvent.change(input, { target: { value: "또 다른 자세" } });
  fireEvent.click(screen.getByRole("button", { name: "다시 검색" }));
  await screen.findByRole("alert");
  expect(screen.queryByText(/새 검색어에 맞는 포즈가 없어요/)).toBeNull();
  expect(screen.queryByText("private internal path")).toBeNull();
  expect(screen.getByText("이전 포즈 카드")).toBeInTheDocument();
  expect(usePoseSelectionStore.getState().jobId).toBe("job_previous");
});
it("empty text and unavailable service cannot search; retry keeps the all-results request", async () => {
  api.searchCapabilities.mockResolvedValueOnce({
    available: false,
    maxQueryLength: 500,
    maxTopK: 20,
    supportsAllResults: true,
  });
  setup("bar");
  await screen.findByRole("alert");
  expect(screen.getByRole("button", { name: "다시 검색" })).toBeDisabled();
  api.searchCapabilities.mockResolvedValueOnce({
    available: true,
    maxQueryLength: 500,
    maxTopK: 10,
    supportsAllResults: true,
  });
  fireEvent.click(screen.getByRole("button", { name: "다시 확인" }));
  const input = await ready();
  fireEvent.change(input, { target: { value: "   " } });
  fireEvent.keyDown(input, { key: "Enter", keyCode: 13 });
  expect(api.searchPoses).not.toHaveBeenCalled();
  api.searchPoses.mockResolvedValueOnce({ status: "no_result", jobId: null });
  fireEvent.change(input, { target: { value: "서 있는 자세" } });
  fireEvent.submit(screen.getByRole("search"));
  await waitFor(() =>
    expect(api.searchPoses).toHaveBeenCalledWith("서 있는 자세", expect.any(AbortSignal), null),
  );
});

it.each(["app", "bar"] as const)(
  "a new displayed job resets its own scroll while preserving the search input and focus (%s)",
  async (surface) => {
    const qc = new QueryClient();
    const view = (job: string, text: string) => (
      <QueryClientProvider client={qc}>
        <MemoryRouter>
          <div data-testid="scroller" style={{ overflowY: "auto" }}>
            <SemanticSearchBar resultKey={job} initialQuery={text} surface={surface} />
          </div>
        </MemoryRouter>
      </QueryClientProvider>
    );
    const r = render(view("job_first", "첫 문장"));
    const input = screen.getByRole("searchbox");
    await waitFor(() => expect(screen.getByRole("button", { name: "다시 검색" })).toBeEnabled());
    fireEvent.focus(input);
    input.focus();
    const scroll = screen.getByTestId("scroller");
    Object.defineProperty(scroll, "scrollHeight", { value: 5000 });
    Object.defineProperty(scroll, "clientHeight", { value: 400 });
    scroll.scrollTop = 1200;
    r.rerender(view("job_second", "다른 작업 문장"));
    expect(scroll.scrollTop).toBe(0);
    expect(screen.getByRole("searchbox")).toBe(input);
    expect(input).toHaveFocus();
    expect(input).toHaveValue("다른 작업 문장");
  },
);

it.each(["app", "bar"] as const)(
  "typing on a result screen never creates intermediate jobs (%s)",
  async (surface) => {
    api.searchPoses.mockResolvedValue({ status: "no_result", jobId: null });
    setup(surface);
    const input = await ready();
    vi.useFakeTimers();
    for (const text of ["하늘을", "하늘을 올라가고 있는 포즈", "한쪽 손을 뻗은 형태"]) {
      fireEvent.change(input, { target: { value: text } });
      await act(async () => vi.advanceTimersByTime(2000));
      expect(api.searchPoses).not.toHaveBeenCalled();
    }
    fireEvent.compositionStart(input);
    fireEvent.change(input, { target: { value: "한쪽 손을 뻗고 다른 손으로 잡는 자세" } });
    fireEvent.keyDown(input, { key: "Enter", isComposing: true, keyCode: 229 });
    fireEvent.compositionEnd(input);
    await act(async () => vi.advanceTimersByTime(2000));
    expect(api.searchPoses).not.toHaveBeenCalled();
    await act(async () => fireEvent.keyDown(input, { key: "Enter", keyCode: 13 }));
    expect(api.searchPoses).toHaveBeenCalledOnce();
    expect(api.searchPoses).toHaveBeenCalledWith(
      "한쪽 손을 뻗고 다른 손으로 잡는 자세",
      expect.any(AbortSignal),
      null,
    );
  },
);
