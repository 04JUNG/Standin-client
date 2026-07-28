import { create } from "zustand";
import type { UploadDraft } from "@/shared/types/upload";
import type { FlowOrigin } from "@/features/bar/lib/flowOrigin";

/**
 * 현재 입력 초안(docs/09 §1 앱 전역 상태). 한 번에 하나의 입력만 다룬다(docs/03 §5).
 * object URL 누수를 막기 위해 교체·삭제 시 previewUrl을 revoke한다(docs/11 §6).
 *
 * origin은 이 입력이 앱 창에서 시작됐는지 플로팅 바에서 시작됐는지 기억한다.
 * 이후 단계(분석·후보·저장)가 각자 분기하지 않고 목적지를 계산할 수 있게 한다(ADR-008).
 */
type UploadState = {
  draft: UploadDraft | null;
  origin: FlowOrigin;
  setDraft(draft: UploadDraft, origin?: FlowOrigin): void;
  clearDraft(): void;
};

function revoke(draft: UploadDraft | null): void {
  if (draft && draft.previewUrl.startsWith("blob:")) {
    URL.revokeObjectURL(draft.previewUrl);
  }
}

export const useUploadStore = create<UploadState>((set, get) => ({
  draft: null,
  origin: "app",
  setDraft(draft, origin = "app") {
    revoke(get().draft);
    set({ draft, origin });
  },
  clearDraft() {
    revoke(get().draft);
    set({ draft: null });
  },
}));
