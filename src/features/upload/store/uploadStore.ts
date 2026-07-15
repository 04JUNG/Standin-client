import { create } from "zustand";
import type { UploadDraft } from "@/shared/types/upload";

/**
 * 현재 입력 초안(docs/09 §1 앱 전역 상태). 한 번에 하나의 입력만 다룬다(docs/03 §5).
 * object URL 누수를 막기 위해 교체·삭제 시 previewUrl을 revoke한다(docs/11 §6).
 */
type UploadState = {
  draft: UploadDraft | null;
  setDraft(draft: UploadDraft): void;
  clearDraft(): void;
};

function revoke(draft: UploadDraft | null): void {
  if (draft && draft.previewUrl.startsWith("blob:")) {
    URL.revokeObjectURL(draft.previewUrl);
  }
}

export const useUploadStore = create<UploadState>((set, get) => ({
  draft: null,
  setDraft(draft) {
    revoke(get().draft);
    set({ draft });
  },
  clearDraft() {
    revoke(get().draft);
    set({ draft: null });
  },
}));
