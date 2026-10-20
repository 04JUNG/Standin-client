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
  /** 인물마다 다른 체형으로 저장했는가. 그러면 이름 하나로 뭉뚱그릴 수 없다. */
  mixedCharacters?: boolean;
}): { text: string; isDowngrade: boolean } | null {
  const { characterName, requestedCharacterName, downgradeReason, mixedCharacters } = input;

  if (downgradeReason === null) {
    // 인물마다 다른 체형을 골랐으면 이름 하나를 대는 것이 곧 거짓말이 된다.
    if (mixedCharacters) {
      return { text: "인물마다 고른 체형으로 저장했어요.", isDowngrade: false };
    }
    return characterName
      ? { text: `${characterName} 체형으로 저장했어요.`, isDowngrade: false }
      : null;
  }

  const wanted = requestedCharacterName ?? "선택한";
  switch (downgradeReason) {
    case "bvh":
      return {
        text: "BVH에는 동작만 저장돼요. 고른 체형은 FBX 파일에 적용돼요.",
        isDowngrade: true,
      };
    case "server":
      return {
        text: `고른 체형을 지금은 사용할 수 없어 기본 체형으로 저장했어요. (고른 체형: ${wanted})`,
        isDowngrade: true,
      };
    case "unavailable":
      return {
        text: `${wanted} 체형은 아직 준비 중이라 기본 체형으로 저장했어요.`,
        isDowngrade: true,
      };
  }
}
