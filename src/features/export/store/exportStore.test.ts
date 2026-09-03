import { beforeEach, describe, expect, it } from "vitest";
import { useExportStore } from "./exportStore";

describe("exportStore.beginJob", () => {
  beforeEach(() => {
    useExportStore.getState().reset();
    // reset()은 사용자 설정값(folder·format)을 건드리지 않으므로 여기서 되돌린다.
    // 없으면 포맷을 바꾸는 테스트가 뒤 테스트로 새어 순서에 의존하게 된다.
    useExportStore.setState({ folder: "/downloads", format: "fbx" });
  });

  it("job이 바뀌면 앞선 저장 결과를 비운다", () => {
    // 저장을 마치고 "새 장면"을 누르지 않은 채 작업 기록에서 다른 작업으로 들어가는
    // 흐름. 비우지 않으면 자동 저장이 `status !== "idle"`에 걸려 조용히 건너뛴다.
    const store = useExportStore.getState();
    store.beginJob("job_a");
    store.setFileName("rough_a.bvh");
    store.setSaved(["/downloads/rough_a.bvh"]);

    useExportStore.getState().beginJob("job_b");

    const next = useExportStore.getState();
    expect(next.status).toBe("idle");
    expect(next.fileName).toBe("");
    expect(next.savedPaths).toEqual([]);
    // 폴더는 유지한다 — 다음 장면도 같은 폴더에 저장한다.
    expect(next.folder).toBe("/downloads");
  });

  it("같은 job이면 저장 결과를 건드리지 않는다", () => {
    // 앱↔바 전환으로 화면이 다시 마운트될 때마다 같은 포즈를 또 저장하면 안 된다.
    const store = useExportStore.getState();
    store.beginJob("job_a");
    store.setSaved(["/downloads/rough_a.bvh"]);

    useExportStore.getState().beginJob("job_a");

    expect(useExportStore.getState().status).toBe("saved");
    expect(useExportStore.getState().savedPaths).toEqual(["/downloads/rough_a.bvh"]);
  });

  it("다른 포맷으로 더 저장하면 앞선 목록에 이어 붙인다", () => {
    // 교체하면 먼저 저장한 파일이 디스크에는 남는데 목록에서만 사라져, 저장이 취소된
    // 것처럼 보인다. "…로도 저장"이라는 문구와도 어긋난다.
    const store = useExportStore.getState();
    store.beginJob("job_a");
    store.setSaved(["/downloads/rough.fbx"]);

    useExportStore.getState().addSaved(["/downloads/rough.bvh"]);

    const next = useExportStore.getState();
    expect(next.savedPaths).toEqual(["/downloads/rough.fbx", "/downloads/rough.bvh"]);
    expect(next.status).toBe("saved");
  });

  it("job이 바뀌어도 저장 포맷은 유지한다", () => {
    // 포맷은 폴더와 같은 사용자 설정값이다. job이 바뀐다고 기본값으로 돌아가면 작가가
    // 설정에서 고른 포맷이 작업을 옮길 때마다 조용히 풀린다.
    const store = useExportStore.getState();
    store.setFormat("bvh");
    store.beginJob("job_a");

    useExportStore.getState().beginJob("job_b");

    expect(useExportStore.getState().format).toBe("bvh");
  });

  it("job은 영속하지 않는다", () => {
    // 지켜야 할 불변식은 `jobId`가 빠지는 것 하나뿐이다. 영속되면 앱을 다시 켰을 때
    // beginJob이 "같은 job"으로 보고 no-op으로 빠지고, 자동 저장이 `status !== "idle"`에
    // 걸려 조용히 스킵된다.
    //
    // 전체 객체 동등 비교로 쓰지 않는다 — 사용자 설정값(folder·format…)이 하나 늘 때마다
    // 이 단언이 기대값을 따라가야 하고, 그러면 정작 지키려던 것이 무엇인지 흐려진다.
    const persisted = useExportStore.persist.getOptions().partialize?.(useExportStore.getState());
    expect(persisted).not.toHaveProperty("jobId");
    expect(persisted).toHaveProperty("folder");
  });
});
