import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AnalysisResult, PersonResult } from "../api/pose.contract";

const refineSelection = vi.fn();
vi.mock("../api/refine.service", () => ({
  refineService: { refineSelection: (...args: unknown[]) => refineSelection(...args) },
}));

const { useRefineSelection } = await import("./useRefineSelection");
const { usePoseSelectionStore } = await import("../store/poseSelectionStore");

function person(overrides: Partial<PersonResult> & { index: number }): PersonResult {
  return {
    candidates: [],
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
  return { jobId: "server-job", people, capabilities: { refine, fbxExport: false } };
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
