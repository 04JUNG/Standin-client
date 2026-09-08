import type { ModelCatalog, ModelCharacter } from "../api/models.contract";

/**
 * ⚠ BFF의 `CONVERTER_CHARACTER_ID` 기본값과 같아야 한다
 * (`Standin-app-server/src/config.ts`). 레포가 달라 컴파일러가 지켜주지 못하는 불변식이다.
 */
export const FALLBACK_DEFAULT_ID = "standin-master-v2";

function character(partial: Partial<ModelCharacter> & { characterId: string }): ModelCharacter {
  return {
    displayName: partial.characterId,
    gender: "unspecified",
    availability: "coming_soon",
    source: "builtin",
    isDefault: false,
    rigProfile: null,
    revision: null,
    previewUrl: null,
    description: null,
    ...partial,
  };
}

/**
 * 서버가 `/v1/models`를 모르는 배포에서 쓰는 목록.
 *
 * 여성을 `available`로 두지 않는다. 이 목록이 쓰인다는 것은 서버가 모델 선택을 모른다는
 * 뜻이고, 그 배포에서 여성을 고르게 하면 남성 FBX가 조용히 저장된다(CLAUDE.md §10).
 * 카드는 보여주되 "준비 중"으로 잠근다 — 목록에서 빼면 기능 자체가 없는 것처럼 보인다.
 */
export const FALLBACK_CATALOG: ModelCatalog = {
  origin: "fallback",
  defaultCharacterId: FALLBACK_DEFAULT_ID,
  characters: [
    character({
      characterId: FALLBACK_DEFAULT_ID,
      displayName: "기본 남성",
      gender: "male",
      availability: "available",
      isDefault: true,
      description: "표준 남성 체형입니다.",
    }),
    character({
      characterId: "standin-female-v2-lbs",
      displayName: "기본 여성",
      gender: "female",
      description: "표준 여성 체형입니다.",
    }),
  ],
};
