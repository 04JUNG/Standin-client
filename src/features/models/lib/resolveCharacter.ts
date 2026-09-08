import type { ModelCatalog, ModelCharacter } from "../api/models.contract";

/**
 * 고른 모델을 저장에 쓰지 못한 이유.
 *
 * - `server` — 이 배포의 BFF가 아직 characterId를 존중하지 않는다
 * - `unavailable` — 카탈로그에 있지만 지금 만들 수 없는 체형이다
 * - `bvh` — BVH는 동작만 담아 체형이 들어갈 자리가 없다
 */
export type CharacterDowngradeReason = "server" | "unavailable" | "bvh";

export type ResolvedCharacter = {
  /**
   * export URL에 실을 값. `null`이면 **파라미터를 붙이지 않는다** — 그러면 BFF가 자기
   * 기본 캐릭터를 쓰고, 이 기능이 없던 때와 바이트까지 같은 결과가 나온다.
   */
  characterId: string | null;
  /** 사용자가 의도한 모델. 문구에 이름을 쓰기 위해 다운그레이드된 경우에도 채운다. */
  chosen: ModelCharacter | null;
  downgradeReason: CharacterDowngradeReason | null;
};

/**
 * 최종 저장 모델을 정한다. 순수 함수 — 저장 경로와 화면 문구가 같은 답을 보게 하는
 * 유일한 자리다(ADR-013).
 *
 * 게이트 두 개(`카탈로그 availability`, `capabilities.characterSelection`)가 **서로 독립적으로**
 * 기본 닫힘이다. 서버가 카탈로그만 먼저 배포하고 export를 아직 안 고친 창에서도
 * 여성 FBX가 나온 척하지 않는다(CLAUDE.md §10).
 */
export function resolveCharacter(input: {
  /** 이 작업에 고정된 값. 흐름 시작 시점의 설정값이다. */
  pinned: string | null;
  /** 현재 설정값. 고정되지 않은 작업(기록 재진입 등)에서 쓴다. */
  preferred: string | null;
  catalog: ModelCatalog | undefined;
  format: "fbx" | "bvh";
  serverSupportsCharacterSelection: boolean;
}): ResolvedCharacter {
  const { pinned, preferred, catalog, format, serverSupportsCharacterSelection } = input;

  // 카탈로그를 아직 못 받았으면 아무것도 주장하지 않는다 — 기본 모델로 저장된다.
  if (!catalog) return { characterId: null, chosen: null, downgradeReason: null };

  const wanted = pinned ?? preferred ?? catalog.defaultCharacterId;
  // 서버 목록에서 사라진 모델을 고른 채로 남아 있을 수 있다. 그때는 기본값으로 돌아간다.
  const chosen =
    catalog.characters.find((item) => item.characterId === wanted) ??
    catalog.characters.find((item) => item.characterId === catalog.defaultCharacterId) ??
    null;

  const isDefault = chosen === null || chosen.characterId === catalog.defaultCharacterId;
  /** 기본 모델이면 설명할 것이 없다. 사유를 붙이면 화면이 잡음으로 가득 찬다. */
  const reason = (value: CharacterDowngradeReason) => (isDefault ? null : value);

  if (format === "bvh") {
    return { characterId: null, chosen, downgradeReason: reason("bvh") };
  }
  if (!serverSupportsCharacterSelection) {
    return { characterId: null, chosen, downgradeReason: reason("server") };
  }
  if (chosen === null || chosen.availability !== "available") {
    return { characterId: null, chosen, downgradeReason: reason("unavailable") };
  }
  return { characterId: chosen.characterId, chosen, downgradeReason: null };
}
