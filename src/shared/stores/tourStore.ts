import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { safeStorage } from "@/shared/lib/safeStorage";
import { TOUR_STEP_IDS, type TourStepId } from "@/shared/types/tour";

/**
 * 앱 사용법 투어의 상태.
 *
 * features/tour가 아니라 shared/stores에 두는 이유는 shortcutStore와 같다 — AppShell
 * (shared/components)의 헤더 버튼이 투어를 시작해야 하는데, shared는 features를
 * import할 수 없다(CLAUDE.md §8).
 *
 * 진행 중 상태(active, acknowledged)는 영속화하지 않는다. 투어를 다시 켜면 언제나
 * 처음부터다 — 중간부터 시작하는 투어는 맥락이 끊긴다. 영속되는 것은 "이미 봤는가"뿐이다.
 */

type TourState = {
  /** 지금 투어가 떠 있는가. */
  active: boolean;
  /**
   * '다음'으로 넘긴 설명 스텝들. 사용자가 직접 해야 하는 스텝은 여기 쌓이지 않고
   * 매번 현재 화면 상태로 판정한다(features/tour/lib/resolveActiveStep.ts).
   */
  acknowledged: TourStepId[];
  /** 끝까지 본 시각(ISO). */
  completedAt: string | null;
  /** 중간에 그만둔 시각(ISO). */
  dismissedAt: string | null;
  start(): void;
  acknowledge(id: TourStepId): void;
  unacknowledge(id: TourStepId): void;
  finish(): void;
  dismiss(): void;
};

/** 자동 시작 여부. 한 번이라도 보거나 그만뒀으면 다시 자동으로 뜨지 않는다. */
export function hasSeenTour(state: Pick<TourState, "completedAt" | "dismissedAt">): boolean {
  return state.completedAt !== null || state.dismissedAt !== null;
}

/**
 * 영속값 정제. 손상·조작된 localStorage가 앱을 깨뜨리지 않게 하는 방어선이다
 * (docs/11 §3, shortcutStore와 같은 규칙).
 */
export function sanitizeTourState(persisted: unknown): Partial<TourState> {
  const raw = persisted as Record<string, unknown> | null;
  if (!raw || typeof raw !== "object") return {};
  const iso = (value: unknown) =>
    typeof value === "string" && !Number.isNaN(Date.parse(value)) ? value : null;
  return { completedAt: iso(raw.completedAt), dismissedAt: iso(raw.dismissedAt) };
}

function isStepId(value: unknown): value is TourStepId {
  return typeof value === "string" && (TOUR_STEP_IDS as readonly string[]).includes(value);
}

export const useTourStore = create<TourState>()(
  persist(
    (set) => ({
      active: false,
      acknowledged: [],
      completedAt: null,
      dismissedAt: null,

      // 다시 보기는 언제나 처음부터. 이전 기록도 지워 '봤음' 표시가 남지 않게 한다.
      start: () => set({ active: true, acknowledged: [] }),

      acknowledge: (id) =>
        set((s) =>
          !isStepId(id) || s.acknowledged.includes(id)
            ? s
            : { acknowledged: [...s.acknowledged, id] },
        ),

      unacknowledge: (id) =>
        set((s) => ({ acknowledged: s.acknowledged.filter((step) => step !== id) })),

      finish: () => set({ active: false, acknowledged: [], completedAt: new Date().toISOString() }),

      dismiss: () =>
        set({ active: false, acknowledged: [], dismissedAt: new Date().toISOString() }),
    }),
    {
      name: "standin-tour",
      version: 1,
      storage: createJSONStorage(() => safeStorage),
      partialize: (state) => ({
        completedAt: state.completedAt,
        dismissedAt: state.dismissedAt,
      }),
      merge: (persisted, current) => ({ ...current, ...sanitizeTourState(persisted) }),
    },
  ),
);
