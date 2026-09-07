import type { CharacterDowngradeReason } from "@/features/models/lib/resolveCharacter";

/**
 * 저장 화면이 모델에 대해 할 말을 고른다(ADR-013).
 *
 * 고른 대로 저장됐으면 어떤 체형이었는지 알리고, 아니면 **왜 아닌지**를 말한다.
 * 어느 쪽도 확실하지 않으면(`null`) 아무 말도 하지 않는다 — 확인되지 않은 것을
 * 단정하지 않는다(CLAUDE.md §10).
 */
export function characterNotice(input: {
  characterName: string | null;
  requestedCharacterName: string | null;
  downgradeReason: CharacterDowngradeReason | null;
}): { text: string; isDowngrade: boolean } | null {
  const { characterName, requestedCharacterName, downgradeReason } = input;

  if (downgradeReason === null) {
    return characterName
      ? { text: `${characterName} 모델로 저장했습니다.`, isDowngrade: false }
      : null;
  }

  const wanted = requestedCharacterName ?? "선택한";
  switch (downgradeReason) {
    case "bvh":
      return {
        text: "BVH는 동작만 담아 모델 선택이 적용되지 않습니다.",
        isDowngrade: true,
      };
    case "server":
      return {
        text: `지금 연결된 서버는 모델 선택을 아직 제공하지 않아 기본 모델로 저장했습니다. (${wanted} 모델 선택됨)`,
        isDowngrade: true,
      };
    case "unavailable":
      return {
        text: `${wanted} 모델은 아직 준비 중이라 기본 모델로 저장했습니다.`,
        isDowngrade: true,
      };
  }
}
