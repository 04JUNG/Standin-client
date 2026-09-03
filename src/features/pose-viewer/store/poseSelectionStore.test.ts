import { beforeEach, describe, expect, it } from "vitest";
import { usePoseSelectionStore } from "./poseSelectionStore";

const JOB = "job_0f1e2d3c-4b5a-4968-8778-695a4b3c2d1e";

describe("poseSelectionStore.restoreSelections", () => {
  beforeEach(() => {
    usePoseSelectionStore.setState({
      jobId: null,
      serverJobId: null,
      selectedByPerson: {},
      refineByPerson: {},
    });
  });

  it("기록에서 연 작업의 지난 선택을 되살린다", () => {
    usePoseSelectionStore.getState().setJobId(JOB);
    usePoseSelectionStore.getState().restoreSelections(JOB, { 0: "cand-1", 1: "cand-4" });

    expect(usePoseSelectionStore.getState().selectedByPerson).toEqual({
      0: "cand-1",
      1: "cand-4",
    });
  });

  it("다른 job의 늦은 응답은 무시한다", () => {
    // 화면을 떠난 뒤 도착한 응답이 다음 job의 선택을 덮으면 안 된다.
    usePoseSelectionStore.getState().setJobId("job_other");
    usePoseSelectionStore.getState().restoreSelections(JOB, { 0: "cand-1" });

    expect(usePoseSelectionStore.getState().selectedByPerson).toEqual({});
  });

  it("사용자가 이미 고른 뒤에는 덮어쓰지 않는다", () => {
    usePoseSelectionStore.getState().setJobId(JOB);
    usePoseSelectionStore.getState().selectCandidate(0, "cand-3");
    usePoseSelectionStore.getState().restoreSelections(JOB, { 0: "cand-1" });

    expect(usePoseSelectionStore.getState().selectedByPerson).toEqual({ 0: "cand-3" });
  });
});
