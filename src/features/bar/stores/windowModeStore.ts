import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { safeStorage } from "@/shared/lib/safeStorage";
import type { WindowPosition } from "../api/windowMode.contract";

/**
 * 바 위치 영속화(docs/09). 사용자가 옮긴 자리를 다음 실행에서도 유지한다.
 *
 * 창 모드 자체는 여기 두지 않는다 — 라우트에서 파생하므로 store에 두면 진실 공급원이
 * 둘이 된다(ADR-008).
 */
type WindowModeState = {
  /** 사용자가 마지막으로 옮긴 바 위치. 없으면 OS 기본 위치. */
  barPosition: WindowPosition | null;
  setBarPosition(position: WindowPosition): void;
  /**
   * 바 내용이 실제로 차지하는 높이(px). 화면이 측정해 올린다.
   *
   * 크기 표(BAR_SIZES)는 평상시 높이만 담는다. 오류 안내처럼 그때만 생기는 줄까지
   * 표에 넣을 수는 없으므로, 표보다 내용이 크면 이 값으로 창을 키운다. 창을 키우는
   * 것은 여전히 WindowModeSync 하나뿐이다 — 크기를 쓰는 곳이 둘이 되면 서로 덮어쓴다.
   */
  barContentHeight: number | null;
  setBarContentHeight(height: number | null): void;
  reset(): void;
};

export const useWindowModeStore = create<WindowModeState>()(
  persist(
    (set) => ({
      barPosition: null,
      barContentHeight: null,
      setBarPosition: (barPosition) => set({ barPosition }),
      setBarContentHeight: (barContentHeight) => set({ barContentHeight }),
      reset: () => set({ barPosition: null, barContentHeight: null }),
    }),
    {
      name: "standin-window",
      version: 1,
      storage: createJSONStorage(() => safeStorage),
      partialize: (state) => ({ barPosition: state.barPosition }),
      // 손상된 값은 버린다. 화면 밖 좌표는 Rust가 모니터 영역으로 클램프한다.
      merge: (persisted, current) => ({
        ...current,
        barPosition: sanitizePosition(persisted),
      }),
    },
  ),
);

export function sanitizePosition(persisted: unknown): WindowPosition | null {
  const raw = (persisted as { barPosition?: unknown } | null)?.barPosition;
  if (!raw || typeof raw !== "object") return null;
  const { x, y } = raw as { x?: unknown; y?: unknown };
  if (typeof x !== "number" || typeof y !== "number") return null;
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return { x, y };
}
