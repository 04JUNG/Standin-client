import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * 저장 상태(docs/09 §2 ExportDraft에 대응).
 *
 * `folder`는 **기본 저장 폴더**다. 설정 화면에서만 바꾸고 영속화해서 모든 저장에 쓴다
 * (ADR-009). 저장 화면의 "다른 폴더에 저장"은 이 값을 바꾸지 않고 save 호출에만
 * 대상 폴더를 넘긴다.
 *
 * reset()은 folder는 유지하고 나머지만 idle로 되돌린다 — 다음 장면도 같은 폴더에 저장한다.
 */
export type ExportStatus = "idle" | "saving" | "saved" | "error";

type ExportState = {
  folder: string | null;
  fileName: string;
  status: ExportStatus;
  /** 인물마다 파일을 하나씩 저장하므로 배열이다. */
  savedPaths: string[];
  error: string | null;
  setFolder(folder: string): void;
  setFileName(fileName: string): void;
  startSaving(): void;
  setSaved(paths: string[]): void;
  setError(message: string): void;
  clearError(): void;
  reset(): void;
};

export const useExportStore = create<ExportState>()(
  persist(
    (set) => ({
      folder: null,
      fileName: "",
      status: "idle",
      savedPaths: [],
      error: null,
      setFolder: (folder) => set({ folder }),
      setFileName: (fileName) => set({ fileName }),
      startSaving: () => set({ status: "saving", error: null }),
      setSaved: (paths) => set({ status: "saved", savedPaths: paths, error: null }),
      setError: (message) => set({ status: "error", error: message }),
      clearError: () => set({ status: "idle", error: null }),
      reset: () => set({ fileName: "", status: "idle", savedPaths: [], error: null }),
    }),
    {
      name: "standin-export-folder",
      partialize: (state) => ({ folder: state.folder }),
    },
  ),
);
