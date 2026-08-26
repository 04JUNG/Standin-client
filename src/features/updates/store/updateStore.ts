import { create } from "zustand";
import { updateService } from "../api/update.service";
import type { UpdateAvailability } from "../api/update.contract";

/**
 * 업데이트 확인 결과를 앱 전역에서 공유한다(ADR-011).
 *
 * 배너(시작 시 자동 확인)와 설정 화면(수동 확인)이 같은 결과를 본다. 각자 확인하면
 * 배너를 보고 설정으로 넘어온 사용자가 같은 버튼을 한 번 더 눌러야 하고, 확인 요청도
 * 두 번 나간다.
 *
 * 영속하지 않는다. "나중에"로 닫은 배너는 다음 실행에 다시 떠야 한다 — 업데이트를
 * 미룬 것과 영영 숨기는 것은 다르다.
 */

type CheckPhase = "idle" | "checking" | "done" | "error";

type UpdateState = {
  /** 실행 중인 앱 버전. 피드 설정 여부와 무관하게 채운다. */
  version: string | null;
  /** 이 빌드에 업데이트 피드가 있는지. 확인 전에는 null. */
  configured: boolean | null;
  phase: CheckPhase;
  result: UpdateAvailability | null;
  error: string | null;
  bannerDismissed: boolean;

  /** 버전과 피드 설정 여부를 읽는다. 이미 읽었으면 다시 부르지 않는다. */
  loadInfo(): Promise<void>;
  /** 업데이트를 확인한다. 피드가 없으면 아무것도 하지 않는다. */
  check(): Promise<void>;
  dismissBanner(): void;
  reset(): void;
};

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  return "업데이트를 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.";
}

const initial = {
  version: null,
  configured: null,
  phase: "idle",
  result: null,
  error: null,
  bannerDismissed: false,
} satisfies Omit<UpdateState, "loadInfo" | "check" | "dismissBanner" | "reset">;

export const useUpdateStore = create<UpdateState>((set, get) => ({
  ...initial,

  async loadInfo() {
    if (get().configured !== null) return;
    const [version, configured] = await Promise.all([
      updateService.currentVersion().catch(() => null),
      updateService.isConfigured().catch(() => false),
    ]);
    set({ version, configured });
  },

  async check() {
    await get().loadInfo();
    // 피드가 없는 빌드에서는 확인 자체를 하지 않는다. 실패를 보여줄 이유가 없다.
    if (!get().configured) return;
    if (get().phase === "checking") return;

    set({ phase: "checking", error: null });
    try {
      const result = await updateService.check();
      // 새 결과가 오면 이전에 닫은 배너를 되살린다. 다른 버전이면 다시 알려야 한다.
      set({ phase: "done", result, bannerDismissed: false });
    } catch (error) {
      set({ phase: "error", error: errorMessage(error) });
    }
  },

  dismissBanner() {
    set({ bannerDismissed: true });
  },

  reset() {
    set({ ...initial });
  },
}));

/** 배너에 띄울 업데이트. 없으면 null. */
export function pendingUpdate(state: UpdateState): { version: string; notes?: string } | null {
  if (state.bannerDismissed) return null;
  if (state.result?.kind !== "available") return null;
  return { version: state.result.version, notes: state.result.notes };
}
