import { useModelCatalog } from "./useModelCatalog";
import { useModelStore } from "../store/modelStore";
import type { ModelCharacter } from "../api/models.contract";

/**
 * 선택 UI 세 곳(홈·입력 미리보기·바)이 공유하는 상태.
 *
 * 세 곳 모두 **설정값을 바꿀 뿐 작업에 고정하지 않는다.** 고정은 흐름 시작 지점에서만
 * 일어난다(`startJob`) — 그래서 세 화면이 서로를 몰라도 값이 언제나 일치한다.
 */
export function useSelectedModel() {
  const { data: catalog, isPending, isError, error, refetch } = useModelCatalog();
  const preferred = useModelStore((s) => s.preferredCharacterId);
  const setPreferred = useModelStore((s) => s.setPreferredCharacterId);

  const selectedId = preferred ?? catalog?.defaultCharacterId ?? null;
  const selected: ModelCharacter | null =
    catalog?.characters.find((item) => item.characterId === selectedId) ?? null;

  return {
    catalog,
    characters: catalog?.characters ?? [],
    isPending,
    isError,
    error,
    refetch,
    selectedId,
    selected,
    select: setPreferred,
  };
}
