import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * 저장할 모델(체형) 설정값(docs/09).
 *
 * 의미는 `useExportStore.format`과 같다 — **"가능하면 이 모델"**이다. 실제로 그 체형으로
 * 만들 수 있는지는 서버가 정한다(카탈로그 availability + `capabilities.characterSelection`).
 *
 * 이 값은 "지금 설정"이지 "이 작업이 약속한 값"이 아니다. 진행 중인 작업이 어떤 모델로
 * 저장될지는 흐름 시작 시점에 `poseSelectionStore`가 고정한다(ADR-013).
 */
type ModelState = {
  /**
   * `null`은 "카탈로그 기본값을 따른다"는 뜻이다. 하드코딩된 id로 시작하지 않는 이유:
   * 모델 화면을 한 번도 열지 않은 사용자는 서버가 정한 기본값을 따라야 하고, 그래야
   * converter 기본 캐릭터가 바뀌어도 앱을 새로 배포할 필요가 없다.
   */
  preferredCharacterId: string | null;
  setPreferredCharacterId(characterId: string | null): void;
};

export const useModelStore = create<ModelState>()(
  persist(
    (set) => ({
      preferredCharacterId: null,
      setPreferredCharacterId: (preferredCharacterId) => set({ preferredCharacterId }),
    }),
    {
      name: "standin-model",
      partialize: (state) => ({ preferredCharacterId: state.preferredCharacterId }),
    },
  ),
);
