import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AnalysisResult, PoseCandidate } from "../api/pose.contract";
import type { RefineOutcome } from "../api/refine.contract";

const analysisState: {
  data: AnalysisResult | undefined;
  selectedByPerson: Record<number, string>;
} = { data: undefined, selectedByPerson: {} };
const refineState: { status: string; refineByPerson: Record<number, RefineOutcome> } = {
  status: "done",
  refineByPerson: {},
};

vi.mock("./useAnalysisResult", () => ({ useAnalysisResult: () => analysisState }));
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
      capabilities: { refine: true, fbxExport: false },
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

  // 서버가 그림을 못 준 경우다. 이때 저장되는 것은 실제로 그 후보의 베이스 포즈이므로
  // 후보 썸네일은 "비슷한 그림"이 아니라 맞는 그림이다.
  it("조정 그림이 없으면 고른 후보의 썸네일로 폴백한다", () => {
    refineState.refineByPerson = { 0: outcome({ previewUrl: "" }) };
    const { result } = renderHook(() => useSelectionReview("job-1"));
    expect(result.current.items[0]?.previewUrl).toBe("data:image/png;base64,CANDIDATE");
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
