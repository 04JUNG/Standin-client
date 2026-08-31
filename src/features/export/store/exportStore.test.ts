import { beforeEach, describe, expect, it } from "vitest";
import { useExportStore } from "./exportStore";

describe("exportStore.beginJob", () => {
  beforeEach(() => {
    useExportStore.getState().reset();
    useExportStore.setState({ folder: "/downloads" });
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

  it("폴더는 영속하되 job은 영속하지 않는다", () => {
    expect(useExportStore.persist.getOptions().partialize?.(useExportStore.getState())).toEqual({
      folder: "/downloads",
    });
  });
});
