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
   * 크기 표(BAR_SIZES)는 측정 전 기본값이다. 측정 후에는 내용에 맞춰 줄이거나 키우되
   * 상태별 상한을 지킨다. 실제 크기는 WindowModeSync 한 곳에서만 적용한다.
   */
  barContentHeight: number | null;
  setBarContentHeight(height: number | null): void;
  /** 화면이 필요로 하는 너비. 검색 대기는 좁게, 후보 비교는 카드 너비를 확보한다. */
  barContentWidth: number | null;
  setBarContentWidth(width: number | null): void;
  reset(): void;
};

export const useWindowModeStore = create<WindowModeState>()(
  persist(
    (set) => ({
      barPosition: null,
      barContentHeight: null,
      barContentWidth: null,
      setBarPosition: (barPosition) => set({ barPosition }),
      setBarContentHeight: (barContentHeight) => set({ barContentHeight }),
      setBarContentWidth: (barContentWidth) => set({ barContentWidth }),
      reset: () => set({ barPosition: null, barContentHeight: null, barContentWidth: null }),
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
