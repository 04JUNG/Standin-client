import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { PropsWithChildren } from "react";
import { act, renderHook as baseRenderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AnalysisResult, PersonResult } from "../api/pose.contract";

function renderHook<T>(callback: () => T) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return baseRenderHook(callback, {
    wrapper: ({ children }: PropsWithChildren) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  });
}
const refineSelection = vi.fn();
vi.mock("../api/refine.service", () => ({
  refineService: { refineSelection: (...args: unknown[]) => refineSelection(...args) },
}));

const { useRefineSelection } = await import("./useRefineSelection");
const { usePoseSelectionStore } = await import("../store/poseSelectionStore");

function person(overrides: Partial<PersonResult> & { index: number }): PersonResult {
  return {
    candidates: [
      { id: `cand-${overrides.index}` },
      { id: "old-candidate" },
    ] as PersonResult["candidates"],
    confidence: "high",
    skeletonState: "valid",
    skeletonSource: "full_image",
    coverageClass: "full",
    fallbackMode: "none",
    refineAllowed: true,
    refinableLimbs: ["left_arm"],
    ...overrides,
  };
}

function analysis(people: PersonResult[], refine = true): AnalysisResult {
  return {
    jobId: "server-job",
    people,
    capabilities: { refine, fbxExport: false, characterSelection: false },
  };
}

describe("useRefineSelection", () => {
  beforeEach(() => {
    refineSelection.mockReset();
    refineSelection.mockImplementation(
      async ({
        jobId,
        personIndex,
        candidateId,
      }: {
        jobId: string;
        personIndex: number;
        candidateId: string;
      }) => ({
        jobId,
        personIndex,
        candidateId,
        refined: true,
        reasonCode: "ok_partial",
        adjustedLimbs: ["left_arm"],
        exportUrl: `/v1/export/${personIndex}`,
        previewUrl: `data:image/png;base64,PERSON${personIndex}`,
      }),
    );
    usePoseSelectionStore.setState({
      serverJobId: "server-job",
      selectedByPerson: {},
      refineByPerson: {},
    });
  });

  afterEach(() => {
    usePoseSelectionStore.setState({
      serverJobId: null,
      selectedByPerson: {},
      refineByPerson: {},
    });
  });

  it("선택한 인물의 조정 결과를 저장한다", async () => {
    usePoseSelectionStore.setState({ selectedByPerson: { 0: "cand-0" } });
    const { result } = renderHook(() => useRefineSelection(analysis([person({ index: 0 })])));

    await waitFor(() => expect(result.current.status).toBe("done"));
    expect(refineSelection).toHaveBeenCalledTimes(1);
    expect(result.current.refineByPerson[0]?.exportUrl).toBe("/v1/export/0");
    expect(result.current.appliedCount).toBe(1);
  });

  it("RC4 capability re-extracts a single owned original despite legacy refine denial", async () => {
    const p = person({ index: 0, refineAllowed: false });
    p.candidates = [
      {
        id: "cand-0",
        poseId: "original",
        source: "library",
        sourceBvhSha256: "a".repeat(64),
        lookupAllowed: true,
        manualExportAllowed: true,
        bvhAvailable: true,
        refineAllowed: false,
      },
    ] as PersonResult["candidates"];
    const data = analysis([p], false);
    data.capabilities.refineRelease = true;
    usePoseSelectionStore.setState({ selectedByPerson: { 0: "cand-0" } });
    const { result } = renderHook(() => useRefineSelection(data));
    await waitFor(() => expect(result.current.status).toBe("done"));
    expect(refineSelection).toHaveBeenCalledWith(
      expect.objectContaining({ releaseVersion: "RC4", candidateId: "cand-0" }),
    );
  });

  // FE-02/FE-03. 저신뢰 인물은 후보를 고르고 베이스로 저장할 수 있지만 refine은 금지다.
  it("refineAllowed=false인 인물은 호출하지 않는다", async () => {
    usePoseSelectionStore.setState({ selectedByPerson: { 0: "cand-0", 1: "cand-1" } });
    const { result } = renderHook(() =>
      useRefineSelection(
        analysis([person({ index: 0 }), person({ index: 1, refineAllowed: false })]),
      ),
    );

    await waitFor(() => expect(result.current.status).toBe("done"));
    expect(refineSelection).toHaveBeenCalledTimes(1);
    expect(refineSelection.mock.calls[0][0]).toMatchObject({ personIndex: 0 });
    expect(result.current.refineByPerson[1]).toBeUndefined();
  });

  // OPS-02. 서버가 refine을 노출하지 않으면 클라이언트는 자기 판단으로 호출하지 않는다.
  it("서버 capability가 꺼져 있으면 아무도 호출하지 않는다", async () => {
    usePoseSelectionStore.setState({ selectedByPerson: { 0: "cand-0" } });
    const { result } = renderHook(() =>
      useRefineSelection(analysis([person({ index: 0 })], false)),
    );

    await waitFor(() => expect(result.current.status).toBe("done"));
    expect(refineSelection).not.toHaveBeenCalled();
  });

  // FE-03. refine 실패가 저장 흐름을 멈추면 안 된다 — 베이스 포즈는 그대로 저장 가능하다.
  it("호출이 실패해도 흐름을 멈추지 않고 다른 인물은 계속 처리한다", async () => {
    refineSelection.mockImplementation(
      async ({ personIndex, candidateId }: { personIndex: number; candidateId: string }) => {
        if (personIndex === 0) throw new Error("timeout");
        return {
          jobId: "server-job",
          personIndex,
          candidateId,
          refined: false,
          reasonCode: "no_gain",
          adjustedLimbs: [],
          exportUrl: `/v1/export/${personIndex}`,
        };
      },
    );
    usePoseSelectionStore.setState({ selectedByPerson: { 0: "cand-0", 1: "cand-1" } });
    const { result } = renderHook(() =>
      useRefineSelection(analysis([person({ index: 0 }), person({ index: 1 })])),
    );

    await waitFor(() => expect(result.current.status).toBe("done"));
    // 실패한 인물은 결과가 없다 → 저장 단계가 후보의 베이스 URL을 쓴다. 그게 원하는 폴백이다.
    expect(result.current.refineByPerson[0]).toBeUndefined();
    expect(result.current.refineByPerson[1]?.refined).toBe(false);
    expect(result.current.appliedCount).toBe(0);
  });

  it("후보를 바꾸면 이전 후보의 조정 결과를 버린다", async () => {
    usePoseSelectionStore.setState({ selectedByPerson: { 0: "cand-0" } });
    const { result } = renderHook(() => useRefineSelection(analysis([person({ index: 0 })])));
    await waitFor(() => expect(result.current.refineByPerson[0]).toBeDefined());

    // 남겨 두면 저장 단계가 고르지 않은 포즈의 exportUrl을 내려받는다.
    usePoseSelectionStore.getState().selectCandidate(0, "cand-other");
    expect(usePoseSelectionStore.getState().refineByPerson[0]).toBeUndefined();
  });

  it("화면을 떠난 뒤 도착한 이전 후보의 조정 결과를 버린다", async () => {
    let resolveOld!: (value: {
      jobId: string;
      personIndex: number;
      candidateId: string;
      refined: boolean;
      reasonCode: string;
      adjustedLimbs: string[];
      exportUrl: string;
    }) => void;
    refineSelection.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveOld = resolve;
        }),
    );
    usePoseSelectionStore.setState({ selectedByPerson: { 0: "old-candidate" } });
    const { unmount } = renderHook(() => useRefineSelection(analysis([person({ index: 0 })])));
    await waitFor(() => expect(refineSelection).toHaveBeenCalledTimes(1));

    unmount();
    usePoseSelectionStore.getState().selectCandidate(0, "new-candidate");
    await act(async () => {
      resolveOld({
        jobId: "server-job",
        personIndex: 0,
        candidateId: "old-candidate",
        refined: true,
        reasonCode: "ok_partial",
        adjustedLimbs: ["left_arm"],
        exportUrl: "/v1/export/old-candidate",
      });
    });

    expect(usePoseSelectionStore.getState().refineByPerson[0]).toBeUndefined();
  });

  it("다른 서버 job의 조정 결과를 버린다", async () => {
    refineSelection.mockResolvedValue({
      jobId: "stale-server-job",
      personIndex: 0,
      candidateId: "cand-0",
      refined: true,
      reasonCode: "ok_partial",
      adjustedLimbs: ["left_arm"],
      exportUrl: "/v1/export/stale",
    });
    usePoseSelectionStore.setState({ selectedByPerson: { 0: "cand-0" } });
    const { result } = renderHook(() => useRefineSelection(analysis([person({ index: 0 })])));

    await waitFor(() => expect(result.current.status).toBe("done"));
    expect(result.current.refineByPerson[0]).toBeUndefined();
  });
});

it("body-only review revisits reuse the same refined BVH", async () => {
  const saved = {
    jobId: "server-job",
    personIndex: 0,
    candidateId: "cand-0",
    refined: true,
    reasonCode: "ok_partial",
    adjustedLimbs: [],
    exportUrl: "/v1/old-refined",
    previewUrl: "",
  };
  usePoseSelectionStore.setState({
    serverJobId: "server-job",
    selectedByPerson: { 0: "cand-0" },
    refineByPerson: { 0: saved },
  });
  refineSelection.mockClear();
  const data = analysis([person({ index: 0 })]);
  data.capabilities.bodyPreviews = true;
  const { result, unmount } = renderHook(() => useRefineSelection(data));
  await waitFor(() => expect(result.current.status).toBe("done"));
  expect(refineSelection).not.toHaveBeenCalled();
  expect(result.current.refineByPerson[0]).toEqual(saved);
  unmount();
  usePoseSelectionStore.getState().clearSelection();
});

it("review-only candidates never call refine even when person permission is stale", async () => {
  refineSelection.mockClear();
  usePoseSelectionStore.setState({
    serverJobId: "server-job",
    refineByPerson: {},
    selectedByPerson: { 0: "dynamic::pose" },
  });
  const { result } = renderHook(() =>
    useRefineSelection(
      analysis([
        person({
          index: 0,
          refineAllowed: true,
          candidates: [
            {
              id: "dynamic::pose",
              source: "dynamic",
              releaseAllowed: false,
            } as PersonResult["candidates"][number],
          ],
        }),
      ]),
    ),
  );
  await waitFor(() => expect(result.current.status).toBe("done"));
  expect(refineSelection).not.toHaveBeenCalled();
});

it("explicit qualified library selection refines despite soft search confidence and manual release", async () => {
  refineSelection.mockClear();
  usePoseSelectionStore.setState({
    serverJobId: "server-job",
    refineByPerson: {},
    selectedByPerson: { 0: "qualified" },
  });
  const data = analysis([
    person({
      index: 0,
      confidence: "low",
      fallbackMode: "soft",
      candidates: [
        {
          id: "qualified",
          source: "library",
          refineAllowed: true,
          manualExportAllowed: true,
          lookupAllowed: true,
          releaseAllowed: false,
          presentationKind: "library_match",
          notExactMatch: false,
          sourceBvhSha256: "a".repeat(64),
        } as PersonResult["candidates"][number],
      ],
    }),
  ]);
  const { result, unmount } = renderHook(() => useRefineSelection(data));
  await waitFor(() => expect(result.current.status).toBe("done"));
  expect(refineSelection).toHaveBeenCalledTimes(1);
  expect(refineSelection.mock.calls[0][0]).toMatchObject({
    candidateId: "qualified",
    personIndex: 0,
  });
  unmount();
  usePoseSelectionStore.getState().clearSelection();
});

it("shares real execution across app/bar remount and ignores late progress after a job change", async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: PropsWithChildren) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  usePoseSelectionStore.setState({
    serverJobId: "server-job",
    selectedByPerson: { 0: "cand-0" },
    refineByPerson: {},
  });
  let input!: Parameters<import("../api/refine.contract").RefineService["refineSelection"]>[0];
  let resolve!: (outcome: import("../api/refine.contract").RefineOutcome) => void;
  refineSelection.mockReset();
  refineSelection.mockImplementation((request) => {
    input = request;
    return new Promise((r) => {
      resolve = r;
    });
  });
  const data = analysis([person({ index: 0 })]);
  const app = baseRenderHook(() => useRefineSelection(data), { wrapper });
  await waitFor(() => expect(refineSelection).toHaveBeenCalledOnce());
  expect(app.result.current.selectedRefineProgress[0].status).toBe("requested");
  act(() => input.onProgress?.("refining"));
  await waitFor(() => expect(app.result.current.selectedRefineProgress[0].status).toBe("refining"));
  app.unmount();
  const bar = baseRenderHook(() => useRefineSelection(data), { wrapper });
  expect(bar.result.current.selectedRefineProgress[0].status).toBe("refining");
  expect(refineSelection).toHaveBeenCalledOnce();
  act(() =>
    usePoseSelectionStore.setState({ serverJobId: "new-job", selectedByPerson: { 0: "new" } }),
  );
  expect(input.signal?.aborted).toBe(true);
  await act(async () => {
    input.onProgress?.("refining");
    resolve({
      jobId: "server-job",
      personIndex: 0,
      candidateId: "cand-0",
      refined: true,
      reasonCode: "ok",
      adjustedLimbs: [],
      exportUrl: "old",
      previewUrl: "",
    });
  });
  expect(usePoseSelectionStore.getState().refineByPerson).toEqual({});
  expect(bar.result.current.selectedRefineProgress).toEqual([]);
  bar.unmount();
  client.clear();
  usePoseSelectionStore.getState().clearSelection();
});

it("semantic selections never request automatic refinement", async () => {
  refineSelection.mockClear();
  usePoseSelectionStore.setState({
    serverJobId: "server-job",
    selectedByPerson: { 0: "cand-0" },
    refineByPerson: {},
  });
  const data = { ...analysis([person({ index: 0 })]), source: "semantic" as const };
  const hook = renderHook(() => useRefineSelection(data));
  await waitFor(() => expect(hook.result.current.status).toBe("done"));
  expect(refineSelection).not.toHaveBeenCalled();
  expect(hook.result.current.selectedRefineProgress[0]?.status).toBe("skipped");
  hook.unmount();
  usePoseSelectionStore.getState().clearSelection();
});

it("keeps concurrent people and completed-request callbacks separate", async () => {
  usePoseSelectionStore.setState({
    serverJobId: "server-job",
    selectedByPerson: { 0: "cand-0", 1: "cand-1" },
    refineByPerson: {},
  });
  type Input = Parameters<import("../api/refine.contract").RefineService["refineSelection"]>[0];
  const requests: Input[] = [];
  const resolvers: ((outcome: import("../api/refine.contract").RefineOutcome) => void)[] = [];
  refineSelection.mockReset();
  refineSelection.mockImplementation((input: Input) => {
    requests[input.personIndex] = input;
    return new Promise((resolve) => {
      resolvers[input.personIndex] = resolve;
    });
  });
  const hook = renderHook(() =>
    useRefineSelection(analysis([person({ index: 0 }), person({ index: 1 })])),
  );
  await waitFor(() => expect(refineSelection).toHaveBeenCalledTimes(2));
  act(() => requests[1].onProgress?.("refining"));
  await waitFor(() =>
    expect(hook.result.current.selectedRefineProgress.map((p) => p.status)).toEqual([
      "requested",
      "refining",
    ]),
  );
  await act(async () => {
    for (const personIndex of [0, 1])
      resolvers[personIndex]({
        jobId: "server-job",
        personIndex,
        candidateId: `cand-${personIndex}`,
        refined: false,
        reasonCode: "no_gain",
        adjustedLimbs: [],
        exportUrl: "base",
        previewUrl: "",
      });
  });
  await waitFor(() => expect(hook.result.current.status).toBe("done"));
  act(() => requests[1].onProgress?.("refining"));
  expect(hook.result.current.selectedRefineProgress.map((p) => p.status)).toEqual([
    "unchanged",
    "unchanged",
  ]);
  hook.unmount();
  usePoseSelectionStore.getState().clearSelection();
});
