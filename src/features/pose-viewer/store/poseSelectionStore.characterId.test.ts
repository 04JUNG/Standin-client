import { beforeEach, describe, expect, it } from "vitest";
import { usePoseSelectionStore } from "./poseSelectionStore";

/**
 * job별 모델 고정(ADR-013). 저장은 화면에 들어오면 자동으로 시작하므로(ADR-009),
 * 이 고정이 없으면 분석 중에 설정을 바꾸기만 해도 그 컷이 다른 체형으로 저장된다.
 */
describe("poseSelectionStore의 characterId", () => {
  beforeEach(() => {
    usePoseSelectionStore.setState({
      jobId: null,
      serverJobId: null,
      selectedByPerson: {},
      refineByPerson: {},
      characterId: null,
    });
  });

  it("startJob이 그 작업의 모델을 고정한다", () => {
    usePoseSelectionStore.getState().startJob("job-a", "female");
    expect(usePoseSelectionStore.getState().characterId).toBe("female");
  });

  it("같은 job으로 다시 부르면 아무것도 하지 않는다 — 앱↔바 전환마다 되감기면 안 된다", () => {
    const store = usePoseSelectionStore.getState();
    store.startJob("job-a", "female");
    store.selectCandidate(0, "pose-1");
    usePoseSelectionStore.getState().startJob("job-a", "male");

    expect(usePoseSelectionStore.getState().characterId).toBe("female");
    expect(usePoseSelectionStore.getState().selectedByPerson).toEqual({ 0: "pose-1" });
  });

  it("새 job이면 앞 작업의 고정값이 새지 않는다", () => {
    usePoseSelectionStore.getState().startJob("job-a", "female");
    usePoseSelectionStore.getState().setJobId("job-b");
    expect(usePoseSelectionStore.getState().characterId).toBeNull();
  });

  it("setCharacterId는 현재 작업의 고정값을 채운다 — 기록에서 연 작업의 안전망이다", () => {
    usePoseSelectionStore.getState().setJobId("job_server");
    usePoseSelectionStore.getState().setCharacterId("male");
    expect(usePoseSelectionStore.getState().characterId).toBe("male");
  });
});
