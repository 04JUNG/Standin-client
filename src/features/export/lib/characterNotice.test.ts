import { describe, expect, it } from "vitest";
import { characterNotice } from "./characterNotice";

describe("characterNotice", () => {
  it("고른 대로 저장됐으면 어떤 체형이었는지 알린다", () => {
    expect(
      characterNotice({
        characterName: "기본 여성",
        requestedCharacterName: "기본 여성",
        downgradeReason: null,
      }),
    ).toEqual({ text: "기본 여성 모델로 저장했습니다.", isDowngrade: false });
  });

  it("이름을 모르면 아무 말도 하지 않는다 — 확인되지 않은 것을 단정하지 않는다", () => {
    expect(
      characterNotice({
        characterName: null,
        requestedCharacterName: null,
        downgradeReason: null,
      }),
    ).toBeNull();
  });

  it.each([
    ["server", "서버"],
    ["unavailable", "준비 중"],
  ] as const)("%s 사유는 고른 체형 이름과 함께 이유를 말한다", (reason, fragment) => {
    const notice = characterNotice({
      characterName: "기본 남성",
      requestedCharacterName: "기본 여성",
      downgradeReason: reason,
    });
    expect(notice?.isDowngrade).toBe(true);
    expect(notice?.text).toContain("기본 여성");
    expect(notice?.text).toContain(fragment);
  });

  it("BVH는 체형이 적용되지 않는다고 말한다", () => {
    expect(
      characterNotice({
        characterName: "기본 남성",
        requestedCharacterName: "기본 여성",
        downgradeReason: "bvh",
      })?.text,
    ).toContain("모델 선택이 적용되지 않습니다");
  });
});
