import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { Accelerator, ShortcutId } from "@/shared/types/shortcuts";
import { normalizeAccelerator } from "@/shared/lib/accelerator";
import { safeStorage } from "@/shared/lib/safeStorage";
import { DEFAULT_BINDINGS, SHORTCUTS_BY_ID } from "@/shared/lib/shortcutRegistry";

/**
 * 단축키 바인딩과 전역 등록 상태(docs/02 §5 "사용자 설정"·"단축키 표시 상태", docs/07 §7).
 *
 * features/settings가 아니라 shared/stores에 두는 이유: 바인딩을 shared/hooks와
 * shared/components가 읽으므로 features에 두면 shared → features 역의존이 생긴다.
 *
 * bindings만 영속화한다. 키바인딩은 비밀정보가 아니라 localStorage로 충분하다
 * (토큰 평문 저장 금지 규칙 docs/06 §6의 대상이 아니다).
 */

export type GlobalRegistrationStatus =
  | "idle"
  | "registering"
  | "registered"
  | "failed"
  /** 브라우저 개발 모드 등 네이티브 등록 자체가 불가능한 환경. */
  | "unavailable";

type ShortcutState = {
  bindings: Record<ShortcutId, Accelerator>;
  /** 등록 실패 시 되돌릴 직전 전역 바인딩. */
  previousGlobal: Accelerator | null;
  globalStatus: GlobalRegistrationStatus;
  globalError: string | null;
  cheatSheetOpen: boolean;
  setBinding(id: ShortcutId, accelerator: Accelerator): void;
  resetBinding(id: ShortcutId): void;
  revertGlobal(): void;
  setGlobalStatus(status: GlobalRegistrationStatus, error?: string | null): void;
  openCheatSheet(): void;
  closeCheatSheet(): void;
  toggleCheatSheet(): void;
  reset(): void;
};

/**
 * 영속값을 정제한다. 레지스트리에 없는 id, 파싱 불가한 accelerator는 버린다.
 * 손상·조작된 localStorage가 앱을 깨뜨리지 않게 하는 방어선이다(docs/11 §3).
 */
export function sanitizeBindings(persisted: unknown): Partial<Record<ShortcutId, Accelerator>> {
  const raw = (persisted as { bindings?: unknown } | null)?.bindings;
  if (!raw || typeof raw !== "object") return {};

  const out: Partial<Record<ShortcutId, Accelerator>> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!Object.prototype.hasOwnProperty.call(SHORTCUTS_BY_ID, key)) continue;
    if (typeof value !== "string") continue;
    const normalized = normalizeAccelerator(value);
    if (!normalized) continue;
    out[key as ShortcutId] = normalized;
  }
  return out;
}

/**
 * v1까지 쓰던 전역 캡처 기본값. 클립스튜디오 "다른 이름으로 저장"과 충돌해 v2에서 버렸다.
 */
const V1_CAPTURE_DEFAULT = "Mod+Shift+KeyS";

/**
 * v1 → v2: 기본값을 그대로 쓰던 사용자만 새 기본값으로 옮긴다.
 *
 * 직접 바꾼 바인딩은 건드리지 않는다 — 사용자가 고른 키를 앱이 마음대로 되돌리면
 * 설정이 사라진 것처럼 보인다. 기본값 항목은 아예 지워서 merge가 새 기본값을 채우게 한다.
 */
export function migrateShortcuts(persisted: unknown, version: number): unknown {
  if (version >= 2) return persisted;

  const bindings = (persisted as { bindings?: unknown } | null)?.bindings;
  if (!bindings || typeof bindings !== "object") return persisted;

  const next = { ...(bindings as Record<string, unknown>) };
  if (next["capture.start"] === V1_CAPTURE_DEFAULT) {
    delete next["capture.start"];
  }
  return { ...(persisted as object), bindings: next };
}

export const useShortcutStore = create<ShortcutState>()(
  persist(
    (set, get) => ({
      bindings: { ...DEFAULT_BINDINGS },
      previousGlobal: null,
      globalStatus: "idle",
      globalError: null,
      cheatSheetOpen: false,

      setBinding: (id, accelerator) => {
        const normalized = normalizeAccelerator(accelerator);
        if (!normalized) return;
        const def = SHORTCUTS_BY_ID[id];
        // 별칭(mirrorOf)은 원본을 따라가므로 직접 지정하지 않는다.
        if (!def || def.mirrorOf) return;
        set((s) => ({
          previousGlobal: def.scope === "global" ? s.bindings[id] : s.previousGlobal,
          bindings: { ...s.bindings, [id]: normalized },
        }));
      },

      resetBinding: (id) => {
        const fallback = DEFAULT_BINDINGS[id];
        if (!fallback) return;
        set((s) => ({
          previousGlobal: s.bindings[id] ?? s.previousGlobal,
          bindings: { ...s.bindings, [id]: fallback },
        }));
      },

      revertGlobal: () => {
        const { previousGlobal } = get();
        if (!previousGlobal) return;
        set((s) => ({
          bindings: { ...s.bindings, "capture.start": previousGlobal },
          previousGlobal: null,
          globalError: null,
        }));
      },

      setGlobalStatus: (status, error = null) => set({ globalStatus: status, globalError: error }),

      openCheatSheet: () => set({ cheatSheetOpen: true }),
      closeCheatSheet: () => set({ cheatSheetOpen: false }),
      toggleCheatSheet: () => set((s) => ({ cheatSheetOpen: !s.cheatSheetOpen })),

      reset: () =>
        set({
          bindings: { ...DEFAULT_BINDINGS },
          previousGlobal: null,
          globalStatus: "idle",
          globalError: null,
          cheatSheetOpen: false,
        }),
    }),
    {
      name: "standin-shortcuts",
      version: 2,
      // 프라이빗 모드·테스트 환경에서 경고 없이 메모리로 폴백한다.
      storage: createJSONStorage(() => safeStorage),
      partialize: (state) => ({ bindings: state.bindings }),
      migrate: migrateShortcuts,
      // 레지스트리에 항목이 추가되면 영속값에는 없으므로 항상 기본값과 병합한다.
      merge: (persisted, current) => ({
        ...current,
        bindings: { ...DEFAULT_BINDINGS, ...sanitizeBindings(persisted) },
      }),
    },
  ),
);

/**
 * 훅이 아닌 순수 조회. React 밖(전역 단축키 초기화)에서도 같은 값을 읽어야 한다.
 */
export function currentBindings(): Record<ShortcutId, Accelerator> {
  return useShortcutStore.getState().bindings;
}
