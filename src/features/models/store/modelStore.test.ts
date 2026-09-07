import { beforeEach, describe, expect, it } from "vitest";
import { useModelStore } from "./modelStore";

describe("modelStore", () => {
  beforeEach(() => {
    useModelStore.setState({ preferredCharacterId: null });
  });

  it("초기값은 null이다 — 서버가 정한 기본 체형을 따른다는 뜻", () => {
    // 하드코딩된 id로 시작하면 converter 기본 캐릭터가 바뀔 때 앱을 다시 배포해야 한다.
    expect(useModelStore.getState().preferredCharacterId).toBeNull();
  });

  it("고른 값을 기억한다", () => {
    useModelStore.getState().setPreferredCharacterId("standin-female-v2-lbs");
    expect(useModelStore.getState().preferredCharacterId).toBe("standin-female-v2-lbs");
  });

  it("저장 폴더와 같은 이름 공간을 쓰지 않는다", () => {
    // persist 키가 겹치면 한쪽 rehydrate가 다른 쪽을 덮어쓴다.
    expect(useModelStore.persist.getOptions().name).toBe("standin-model");
  });
});
