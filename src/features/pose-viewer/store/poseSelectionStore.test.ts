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

describe("poseSelectionStore 내보내기", () => {
  beforeEach(() => {
    usePoseSelectionStore.setState({
      jobId: "job-x",
      serverJobId: "server-x",
      selectedByPerson: {},
      refineByPerson: {},
      excludedPeople: {},
    });
  });

  it("끄면 선택과 조정본을 빼고, 다시 켜면 고른 후보를 되살린다", () => {
    const store = usePoseSelectionStore.getState();
    store.selectCandidate(0, "pose-a");
    store.setPersonIncluded(0, false);
    let state = usePoseSelectionStore.getState();
    expect(state.selectedByPerson).toEqual({});
    expect(state.excludedPeople).toEqual({ 0: "pose-a" });

    // 끈 동안에는 고를 수 없다(단축키·늦은 클릭).
    state.selectCandidate(0, "pose-b");
    expect(usePoseSelectionStore.getState().selectedByPerson).toEqual({});

    usePoseSelectionStore.getState().setPersonIncluded(0, true);
    state = usePoseSelectionStore.getState();
    expect(state.selectedByPerson).toEqual({ 0: "pose-a" });
    expect(state.excludedPeople).toEqual({});
  });

  it("새 작업을 열면 끈 인물 목록도 비운다", () => {
    usePoseSelectionStore.getState().setPersonIncluded(1, false);
    usePoseSelectionStore.getState().setJobId("job-y");
    expect(usePoseSelectionStore.getState().excludedPeople).toEqual({});
  });
});

it("keeps the exact generated pick through exclusion, job changes and history reentry, scoped to the installation", async () => {
  const { useInstallationStore } = await import("@/features/installation/installationStore");
  usePoseSelectionStore.getState().clearSelection();
  usePoseSelectionStore.setState({ jobId: null });
  useInstallationStore.setState({
    credentials: { installationId: "owner", deviceToken: "test", consentVersion: "test" },
  });
  const id = "preview_" + "a".repeat(64);
  usePoseSelectionStore.getState().startJob("job_a", "female");
  usePoseSelectionStore.getState().setServerJobId("job_server_a");
  usePoseSelectionStore.getState().selectCandidate(0, id);
  usePoseSelectionStore.getState().setPersonIncluded(0, false);
  usePoseSelectionStore.getState().setJobId("job_b");
  expect(usePoseSelectionStore.getState().selectedByPerson).toEqual({});
  usePoseSelectionStore.getState().setJobId("job_a");
  expect(usePoseSelectionStore.getState().excludedPeople).toEqual({ 0: id });
  usePoseSelectionStore.getState().restoreSelections("job_a", { 0: "old-confirmed" });
  expect(usePoseSelectionStore.getState().selectedByPerson).toEqual({});
  usePoseSelectionStore.getState().setPersonIncluded(0, true);
  expect(usePoseSelectionStore.getState().selectedByPerson).toEqual({ 0: id });
  expect(usePoseSelectionStore.getState().refineByPerson).toEqual({});
  usePoseSelectionStore.getState().setJobId("job_b");
  usePoseSelectionStore.getState().setJobId("job_server_a");
  expect(usePoseSelectionStore.getState().selectedByPerson).toEqual({ 0: id });
  usePoseSelectionStore.getState().setJobId("job_b");
  useInstallationStore.setState({
    credentials: { installationId: "other", deviceToken: "test", consentVersion: "test" },
  });
  usePoseSelectionStore.getState().setJobId("job_a");
  expect(usePoseSelectionStore.getState().selectedByPerson).toEqual({});
  useInstallationStore.setState({ credentials: null });
  usePoseSelectionStore.getState().clearSelection();
});
