import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { beforeEach, expect, it, vi } from "vitest";
import { ApiError } from "@/shared/api/client";
import type { AnalysisResult } from "@/features/pose-viewer/api/pose.contract";
import { catalog, selection } from "./fixtures";
const mocks = vi.hoisted(() => ({ getCatalog: vi.fn(), get: vi.fn(), put: vi.fn() }));
vi.mock("@/features/body-selection/hooks", () => ({ useBodyOwner: () => "owner" }));
vi.mock("./api", () => ({
  getHandCatalog: mocks.getCatalog,
  getHandSelection: mocks.get,
  putHandSelection: mocks.put,
  handKeys: {
    catalog: (o: string) => ["hands", o, "catalog"],
    selection: (o: string, j: string, p: number) => ["hands", o, j, p],
  },
}));
import { useHands } from "./hooks";
const result = { jobId: "job", capabilities: { handSelection: true } } as AnalysisResult;
beforeEach(() => {
  vi.clearAllMocks();
  mocks.getCatalog.mockResolvedValue(catalog);
  mocks.get.mockResolvedValue(selection);
});
function setup(data = result, people = [0]) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const hook = renderHook(({ data }) => useHands(data, people, true), {
    initialProps: { data },
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    ),
  });
  return { ...hook, qc };
}
it("waits for server selection before allowing final review and commits only successful writes", async () => {
  let finish!: (value: unknown) => void;
  mocks.put.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const hook = setup();
  expect(hook.result.current.ready).toBe(false);
  await waitFor(() => expect(hook.result.current.ready).toBe(true));
  act(() => hook.result.current.change(selection, { left: "fist" }));
  await waitFor(() => expect(hook.result.current.pending).toBe(true));
  expect(hook.result.current.ready).toBe(false);
  expect(hook.result.current.entries[0]!.selection!.left).toBe("relaxed");
  await act(async () => {
    finish({ ...selection, left: "fist", revision: 1, changed: ["left"] });
  });
  await waitFor(() => expect(hook.result.current.entries[0]!.selection!.revision).toBe(1));
});
it("failed writes retain the server selection; conflicts reload catalog and selection", async () => {
  const hook = setup();
  await waitFor(() => expect(hook.result.current.ready).toBe(true));
  mocks.put.mockRejectedValue(new ApiError(409, "HAND_LIBRARY_CHANGED", "changed"));
  act(() => hook.result.current.change(selection, { left: "fist" }));
  await waitFor(() => expect(hook.result.current.changeError).toBeTruthy());
  expect(hook.result.current.entries[0]!.selection!.left).toBe("relaxed");
  await waitFor(() => expect(mocks.getCatalog).toHaveBeenCalledTimes(2));
  expect(mocks.get).toHaveBeenCalledTimes(2);
});
it("old servers do not cause any hand network calls", () => {
  const hook = setup({ ...result, capabilities: {} } as AnalysisResult);
  expect(hook.result.current.enabled).toBe(false);
  expect(mocks.getCatalog).not.toHaveBeenCalled();
  expect(mocks.get).not.toHaveBeenCalled();
});

it("blocks final review when a saved selection and cached catalog use different libraries", async () => {
  mocks.get.mockResolvedValue({ ...selection, library_sha256: "b".repeat(64) });
  const hook = setup();
  await waitFor(() => expect(hook.result.current.error).toBe(true));
  expect(hook.result.current.ready).toBe(false);
});

function scoped(scopes: string[]): AnalysisResult {
  return {
    ...result,
    people: scopes.map((scope, index) => ({
      index,
      outputScope: {
        selection: "auto",
        detected: scope,
        meshScope: scope,
        resolved: scope,
        detectionSource: "vlm_person",
        resolutionSource: "auto",
      },
    })),
  } as AnalysisResult;
}
it.each(["head", "shoulder_head", "bust"])(
  "does not query, apply or wait for hands on %s meshes even with stale cached hands",
  (scope) => {
    const hook = setup(scoped([scope]));
    hook.qc.setQueryData(["hands", "owner", "job", 0], selection);
    expect(hook.result.current.enabled).toBe(false);
    expect(hook.result.current.ready).toBe(true);
    expect(hook.result.current.entries).toEqual([]);
    act(() => hook.result.current.change(selection, { left: "fist" }));
    expect(mocks.getCatalog).not.toHaveBeenCalled();
    expect(mocks.get).not.toHaveBeenCalled();
    expect(mocks.put).not.toHaveBeenCalled();
  },
);
it("queries only the hand-bearing person in a head/body scene", async () => {
  const hook = setup(scoped(["head", "half"]), [0, 1]);
  await waitFor(() => expect(hook.result.current.ready).toBe(true));
  expect(hook.result.current.entries.map((e) => e.personIndex)).toEqual([1]);
  expect(mocks.get).toHaveBeenCalledTimes(1);
  expect(mocks.get.mock.calls[0]?.slice(0, 2)).toEqual(["job", 1]);
});
it("preserves saved hands across full → head → full, revalidating when hands return", async () => {
  const saved = { ...selection, left: "fist", revision: 4, changed: ["left"] };
  mocks.get.mockResolvedValue(saved);
  const hook = setup(scoped(["full"]));
  await waitFor(() => expect(hook.result.current.entries[0]?.selection?.revision).toBe(4));
  hook.rerender({ data: scoped(["head"]) });
  expect(hook.result.current.entries).toEqual([]);
  expect(hook.result.current.ready).toBe(true);
  expect(hook.qc.getQueryData(["hands", "owner", "job", 0])).toEqual(saved);
  hook.rerender({ data: scoped(["full"]) });
  await waitFor(() => expect(mocks.get).toHaveBeenCalledTimes(2));
  expect(hook.result.current.entries[0]?.selection?.left).toBe("fist");
});

// Production 2026-11-12 15:25 UTC: an idle review page re-read hands while the BFF was
// stalled by another user's legacy v1 job. Both reads failed with 503 once, the page showed
// "손 선택을 불러오지 못했습니다", download fell back to "파일 준비 중", and nothing retried.
it("a busy server while re-reading held hands keeps the cards and readiness, then recovers alone", async () => {
  const hook = setup();
  await waitFor(() => expect(hook.result.current.ready).toBe(true));
  const busy = new ApiError(503, "HANDS_UNAVAILABLE", "손 적용 서비스를 확인하지 못했습니다.");
  mocks.getCatalog.mockRejectedValueOnce(busy);
  mocks.get.mockRejectedValueOnce(busy);
  const reads = mocks.get.mock.calls.length;
  await act(async () => {
    await hook.qc.refetchQueries({ queryKey: ["hands"] }, { throwOnError: false }).catch(() => {});
  });
  // Retries are in flight: the held selection still drives the page.
  expect(hook.result.current.ready).toBe(true);
  expect(hook.result.current.error).toBe(false);
  expect(hook.result.current.entries[0]!.selection).toEqual(selection);
  await waitFor(() => expect(mocks.get.mock.calls.length).toBe(reads + 2), { timeout: 3000 });
  await waitFor(() =>
    expect(hook.qc.getQueryState(["hands", "owner", "job", 0])?.status).toBe("success"),
  );
  expect(hook.result.current.ready).toBe(true);
  expect(hook.result.current.error).toBe(false);
});

it("library changes and a disabled feature are not retried", async () => {
  mocks.get.mockRejectedValue(new ApiError(409, "HAND_LIBRARY_CHANGED", "changed"));
  const hook = setup();
  await waitFor(() => expect(hook.result.current.error).toBe(true));
  expect(mocks.get).toHaveBeenCalledTimes(1);
  expect(hook.result.current.ready).toBe(false);
  vi.clearAllMocks();
  mocks.getCatalog.mockRejectedValue(new ApiError(503, "HAND_SELECTION_DISABLED", "disabled"));
  mocks.get.mockResolvedValue(selection);
  const disabled = setup();
  await waitFor(() => expect(disabled.result.current.error).toBe(true));
  expect(mocks.getCatalog).toHaveBeenCalledTimes(1);
});

it("an invalidated selection (a change that may have committed) still waits for the new answer", async () => {
  const hook = setup();
  await waitFor(() => expect(hook.result.current.ready).toBe(true));
  let answer!: (value: unknown) => void;
  mocks.get.mockImplementationOnce(() => new Promise((resolve) => (answer = resolve)));
  act(() => {
    void hook.qc.invalidateQueries({ queryKey: ["hands", "owner", "job", 0] });
  });
  await waitFor(() => expect(hook.result.current.ready).toBe(false));
  await act(async () => answer({ ...selection, revision: 1, left: "fist", changed: ["left"] }));
  await waitFor(() => expect(hook.result.current.ready).toBe(true));
  expect(hook.result.current.entries[0]!.selection!.revision).toBe(1);
});

it("a read that exhausts its retries shows the error and keeps healing every 15 s", async () => {
  vi.useFakeTimers();
  try {
    mocks.get.mockRejectedValue(new ApiError(503, "HANDS_UNAVAILABLE", "busy"));
    const hook = setup();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(8_000);
    });
    expect(mocks.get).toHaveBeenCalledTimes(4);
    expect(hook.result.current.error).toBe(true);
    expect(hook.result.current.ready).toBe(false);
    mocks.get.mockResolvedValue(selection);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(16_000);
    });
    expect(hook.result.current.error).toBe(false);
    expect(hook.result.current.ready).toBe(true);
  } finally {
    vi.useRealTimers();
  }
});
