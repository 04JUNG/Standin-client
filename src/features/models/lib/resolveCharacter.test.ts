import { describe, expect, it } from "vitest";
import { resolveCharacter } from "./resolveCharacter";
import type { ModelCatalog, ModelCharacter } from "../api/models.contract";

function character(partial: Partial<ModelCharacter> & { characterId: string }): ModelCharacter {
  return {
    displayName: partial.characterId,
    gender: "unspecified",
    availability: "available",
    source: "builtin",
    isDefault: false,
    rigProfile: null,
    revision: null,
    previewUrl: null,
    description: null,
    ...partial,
  };
}

const MALE = character({ characterId: "male", displayName: "기본 남성", isDefault: true });
const FEMALE = character({ characterId: "female", displayName: "기본 여성" });
const LOCKED = character({
  characterId: "teen",
  displayName: "청소년",
  availability: "coming_soon",
});

const CATALOG: ModelCatalog = {
  characters: [MALE, FEMALE, LOCKED],
  defaultCharacterId: "male",
  origin: "server",
};

const BASE = {
  pinned: null,
  preferred: null,
  catalog: CATALOG,
  format: "fbx",
  serverSupportsCharacterSelection: true,
} as const;

describe("resolveCharacter", () => {
  it("고정값이 설정값을 이긴다 — 분석 중 설정을 바꿔도 그 작업은 처음 고른 체형으로 저장된다", () => {
    const result = resolveCharacter({ ...BASE, pinned: "female", preferred: "male" });
    expect(result.characterId).toBe("female");
    expect(result.downgradeReason).toBeNull();
  });

  it("고정값이 없으면 설정값을, 설정값도 없으면 카탈로그 기본값을 쓴다", () => {
    expect(resolveCharacter({ ...BASE, preferred: "female" }).characterId).toBe("female");
    expect(resolveCharacter(BASE).characterId).toBe("male");
  });

  it("서버 목록에서 사라진 체형을 고른 상태면 기본값으로 돌아간다", () => {
    const result = resolveCharacter({ ...BASE, pinned: "gone" });
    expect(result.characterId).toBe("male");
    expect(result.downgradeReason).toBeNull();
  });

  // 여기부터가 이 파일의 존재 이유다: 고른 체형과 다른 FBX가 조용히 나가면 안 된다.
  it("서버가 모델 선택을 모르면 파라미터를 붙이지 않고 이유를 남긴다", () => {
    const result = resolveCharacter({
      ...BASE,
      pinned: "female",
      serverSupportsCharacterSelection: false,
    });
    expect(result.characterId).toBeNull();
    expect(result.downgradeReason).toBe("server");
    // 안내에 이름을 쓰려면 고른 체형을 알아야 한다.
    expect(result.chosen?.displayName).toBe("기본 여성");
  });

  it("아직 준비되지 않은 체형은 파라미터를 붙이지 않고 이유를 남긴다", () => {
    const result = resolveCharacter({ ...BASE, pinned: "teen" });
    expect(result.characterId).toBeNull();
    expect(result.downgradeReason).toBe("unavailable");
  });

  it("BVH에는 체형이 들어갈 자리가 없다 — 파라미터를 붙이지 않는다", () => {
    const result = resolveCharacter({ ...BASE, pinned: "female", format: "bvh" });
    expect(result.characterId).toBeNull();
    expect(result.downgradeReason).toBe("bvh");
  });

  it("기본 모델이면 다운그레이드 사유를 만들지 않는다 — 설명할 것이 없다", () => {
    for (const extra of [{ serverSupportsCharacterSelection: false }, { format: "bvh" as const }]) {
      const result = resolveCharacter({ ...BASE, pinned: "male", ...extra });
      expect(result.characterId).toBeNull();
      expect(result.downgradeReason).toBeNull();
    }
  });

  it("카탈로그를 아직 못 받았으면 아무것도 주장하지 않는다", () => {
    const result = resolveCharacter({ ...BASE, pinned: "female", catalog: undefined });
    expect(result.characterId).toBeNull();
    expect(result.chosen).toBeNull();
    expect(result.downgradeReason).toBeNull();
  });
});
