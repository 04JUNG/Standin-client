import { createElement } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { waitFor, renderHook as renderHookBase } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AnalysisResult, PoseCandidate } from "../api/pose.contract";
import type { RefineOutcome } from "../api/refine.contract";

function renderHook<T>(hook: () => T) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return renderHookBase(hook, {
    wrapper: ({ children }) => createElement(QueryClientProvider, { client }, children),
  });
}

const poster = vi.hoisted(() => vi.fn());
vi.mock("../api/posePoster", () => ({ loadPosePoster: poster }));

const analysisState: {
  bodyMode?: boolean;
  data: AnalysisResult | undefined;
  selectedByPerson: Record<number, string>;
} = { data: undefined, selectedByPerson: {} };
const refineState: { status: string; refineByPerson: Record<number, RefineOutcome> } = {
  status: "done",
  refineByPerson: {},
};

vi.mock("./useAnalysisResult", () => ({
  useAnalysisResult: () => ({
    ...analysisState,
    bodies: { enabled: analysisState.bodyMode ?? false, entries: [], ready: true },
  }),
}));
vi.mock("./useRefineSelection", () => ({ useRefineSelection: () => refineState }));

const { useSelectionReview } = await import("./useSelectionReview");

function candidate(overrides: Partial<PoseCandidate> = {}): PoseCandidate {
  return {
    id: "pose-1::front",
    poseId: "pose-1",
    rank: 1,
    title: "포즈 pose-1",
    tags: [],
    matchLevel: "high",
    thumbnailUrl: "data:image/png;base64,CANDIDATE",
    previewImages: [],
    bvhAvailable: true,
    bvhUrl: "/v1/base.bvh",
    ...overrides,
  };
}

function outcome(overrides: Partial<RefineOutcome> = {}): RefineOutcome {
  return {
    jobId: "server-job",
    personIndex: 0,
    candidateId: "pose-1::front",
    refined: true,
    reasonCode: "ok_partial",
    adjustedLimbs: ["left_arm"],
    exportUrl: "/v1/refined.bvh",
    previewUrl: "data:image/png;base64,REFINED",
    ...overrides,
  };
}

describe("useSelectionReview", () => {
  beforeEach(() => {
    poster.mockReset();
    analysisState.bodyMode = false;
    analysisState.data = {
      jobId: "server-job",
      people: [
        {
          index: 0,
          candidates: [candidate()],
          confidence: "high",
          skeletonState: "valid",
          skeletonSource: "full_image",
          coverageClass: "full",
          fallbackMode: "none",
          refineAllowed: true,
          refinableLimbs: ["left_arm"],
        },
      ],
      capabilities: { refine: true, fbxExport: false, characterSelection: false },
    };
    analysisState.selectedByPerson = { 0: "pose-1::front" };
    refineState.status = "done";
    refineState.refineByPerson = {};
  });

  it("조정 결과의 그림이 있으면 그것을 보여준다", () => {
    refineState.refineByPerson = { 0: outcome() };
    const { result } = renderHook(() => useSelectionReview("job-1"));
    expect(result.current.items[0]?.previewUrl).toBe("data:image/png;base64,REFINED");
    expect(result.current.items[0]?.refined).toBe(true);
  });

  it("조정 그림이 없으면 다른 포즈인 원본 썸네일을 보여주지 않는다", () => {
    refineState.refineByPerson = { 0: outcome({ previewUrl: "" }) };
    const { result } = renderHook(() => useSelectionReview("job-1"));
    expect(result.current.items[0]?.previewUrl).toBe("");
    expect(result.current.items[0]?.exportUrl).toBe("/v1/refined.bvh");
  });

  // refine을 아예 시도하지 않은 인물(저신뢰·기능 off)도 확인 화면에는 그림이 있어야 한다.
  it("refine을 건너뛴 인물도 후보 썸네일을 보여준다", () => {
    const { result } = renderHook(() => useSelectionReview("job-1"));
    expect(result.current.items[0]?.skipped).toBe(true);
    expect(result.current.items[0]?.previewUrl).toBe("data:image/png;base64,CANDIDATE");
    expect(result.current.items[0]?.exportUrl).toBe("/v1/base.bvh");
  });

  // 화면을 떠났다 돌아와 선택이 바뀐 경우. 이전 조정본의 그림이 새 선택에 붙으면
  // 저장될 것과 다른 그림을 보여주게 된다.
  it("다른 후보의 조정 결과는 그림도 export URL도 쓰지 않는다", () => {
    refineState.refineByPerson = { 0: outcome({ candidateId: "pose-9::front" }) };
    const { result } = renderHook(() => useSelectionReview("job-1"));
    expect(result.current.items[0]?.previewUrl).toBe("data:image/png;base64,CANDIDATE");
    expect(result.current.items[0]?.exportUrl).toBe("/v1/base.bvh");
  });
});

describe("selected original BVH reference", () => {
  beforeEach(() => {
    poster.mockReset();
  });
  it.each([false, true])(
    "legacy history without a camera loads only the selected original poster (body=%s)",
    async (bodyMode) => {
      const { useExportStore } = await import("@/features/export/store/exportStore");
      useExportStore.setState({ format: "bvh" });
      analysisState.bodyMode = bodyMode;
      analysisState.data = {
        jobId: "job_history",
        capabilities: { refine: false, fbxExport: true, characterSelection: false },
        people: [
          {
            index: 0,
            candidates: [
              candidate({ thumbnailUrl: "", deferredThumbnailUrl: undefined, posterScope: "head" }),
            ],
          },
        ],
      } as AnalysisResult;
      analysisState.selectedByPerson = { 0: "pose-1::front" };
      refineState.status = "done";
      refineState.refineByPerson = {};
      poster.mockResolvedValue({ url: "data:image/png;base64,REFERENCE", kind: "default-body" });
      const h = renderHook(() => useSelectionReview("job_history"));
      await waitFor(() =>
        expect(h.result.current.items[0].previewUrl).toBe("data:image/png;base64,REFERENCE"),
      );
      expect(poster).toHaveBeenCalledOnce();
      expect(poster.mock.calls[0][0]).toContain("scope=head");
      expect(poster.mock.calls[0][3]).toBe("head");
      expect(h.result.current.items[0].previewReference).toBe(true);
      h.unmount();
    },
  );
  it("never substitutes the original poster for an unavailable refined preview", () => {
    poster.mockClear();
    refineState.refineByPerson = {
      0: outcome({ jobId: analysisState.data!.jobId, previewUrl: "" }),
    };
    const h = renderHook(() => useSelectionReview("job_history"));
    expect(h.result.current.items[0].refined).toBe(true);
    expect(h.result.current.items[0].previewUrl).toBe("");
    expect(poster).not.toHaveBeenCalled();
    h.unmount();
  });
});
