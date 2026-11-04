import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useInstallationStore } from "@/features/installation/installationStore";
import { __resetApiClient, setInstallationCredentials } from "@/shared/api/client";
import { toAnalysisResult } from "@/features/pose-viewer/api/pose.http";
import { poseQueryKeys } from "@/features/pose-viewer/queryKeys";
import { mergeSemanticPage, pauseSemanticPages, useSemanticPages } from "./useSemanticPages";
const snapshotId = "ce9f82dc-3795-461c-8e17-21e4a8ba65aa";
function raw(start: number, end: number) {
  return {
    jobId: "job_test",
    source: "semantic" as const,
    semantic: {
      query: "앉은 자세",
      index: {},
      paging: {
        snapshotId,
        loaded: end,
        total: 45,
        matches: 45,
        near: 0,
        pageSize: 20,
        nextCursor: end < 45 ? `${snapshotId}.${end}` : null,
      },
    },
    notes: [],
    capabilities: {},
    candidatesByPerson: [
      {
        personIndex: 0,
        box: null,
        tags: {},
        refineAllowed: false,
        candidates: Array.from({ length: end - start }, (_, i) => ({
          id: `c${start + i}`,
          poseId: `pose${start + i}`,
          rank: start + i + 1,
          view: "front",
          tags: [],
          matchLevel: "medium" as const,
          bvhAvailable: true,
          source: "semantic" as const,
          manualExportAllowed: true,
          lookupAllowed: true,
          sourceBvhSha256: "a".repeat(64),
          semantic: { familyId: `pose${start + i}`, alternate: false, description: "앉은 자세" },
        })),
        posePresentation: {
          library_candidates: Array.from({ length: end - start }, (_, i) => ({
            candidate_id: `c${start + i}`,
          })),
          review_candidates: [],
          generated_candidates: [],
        },
      },
    ],
  } as unknown as Parameters<typeof toAnalysisResult>[0];
}
beforeEach(() => {
  __resetApiClient();
  useInstallationStore.setState({
    credentials: { installationId: "owner", deviceToken: "device", consentVersion: "test" },
  });
  setInstallationCredentials({ installationId: "owner", deviceToken: "device" });
});
afterEach(() => vi.unstubAllGlobals());
async function setup() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  qc.setQueryData(
    poseQueryKeys.result("job_test"),
    await toAnalysisResult(raw(0, 20), new AbortController().signal),
  );
  const hook = renderHook(() => useSemanticPages("job_test"), {
    wrapper: ({ children }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>,
  });
  return { ...hook, qc };
}
it("loads exactly one next page, retries failure, appends without replacing earlier candidates, and ends", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(
      Response.json({ error: { code: "TEMPORARY", message: "retry" } }, { status: 503 }),
    )
    .mockResolvedValueOnce(Response.json(raw(20, 40)))
    .mockResolvedValueOnce(Response.json(raw(40, 45)));
  vi.stubGlobal("fetch", fetcher);
  const { result, qc, unmount } = await setup();
  await act(async () => {
    await result.current!.loadMore();
  });
  await waitFor(() => expect(result.current!.error).toBeTruthy());
  expect(result.current!.info.loaded).toBe(20);
  await act(async () => {
    await Promise.all([result.current!.loadMore(), result.current!.loadMore()]);
  });
  await waitFor(() => expect(result.current!.info.loaded).toBe(40));
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(
    qc.getQueryData<Awaited<ReturnType<typeof toAnalysisResult>>>(poseQueryKeys.result("job_test"))!
      .people[0].candidates[0].id,
  ).toBe("c0");
  await act(async () => {
    await result.current!.loadMore();
  });
  await waitFor(() => expect(result.current!.info.nextCursor).toBeNull());
  expect(result.current!.info.loaded).toBe(45);
  await act(async () => {
    await result.current!.loadMore();
  });
  expect(fetcher).toHaveBeenCalledTimes(3);
  unmount();
  qc.clear();
});
it("rejects cross-snapshot and duplicate pages without altering the current result", async () => {
  const signal = new AbortController().signal;
  const first = await toAnalysisResult(raw(0, 20), signal),
    next = await toAnalysisResult(raw(20, 40), signal);
  expect(() =>
    mergeSemanticPage(first, {
      ...next,
      semantic: {
        ...next.semantic!,
        paging: { ...next.semantic!.paging!, snapshotId: crypto.randomUUID() },
      },
    }),
  ).toThrow();
  next.people[0].candidates[0] = first.people[0].candidates[0];
  expect(() => mergeSemanticPage(first, next)).toThrow();
  expect(first.people[0].candidates).toHaveLength(20);
});
it("editing cancels an in-flight page and ignores a response that arrives after cancellation", async () => {
  let finish!: (r: Response) => void, signal: AbortSignal | undefined;
  vi.stubGlobal(
    "fetch",
    vi.fn((_url, options) => {
      signal = options.signal;
      return new Promise<Response>((r) => {
        finish = r;
      });
    }),
  );
  const { result, qc, unmount } = await setup();
  let pending!: Promise<void>;
  act(() => {
    pending = result.current!.loadMore();
  });
  await waitFor(() => expect(finish).toBeTypeOf("function"));
  act(() => pauseSemanticPages(qc, "job_test"));
  expect(signal!.aborted).toBe(true);
  await act(async () => {
    finish(Response.json(raw(20, 40)));
    await pending;
  });
  expect(result.current!.info.loaded).toBe(20);
  expect(result.current!.paused).toBe(true);
  unmount();
  qc.clear();
});
