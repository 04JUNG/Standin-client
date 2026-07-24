import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * 저장 화면 상태(docs/09 §2 ExportDraft에 대응). folder만 영속화해서 다음 저장 때
 * 기본값으로 재사용한다(docs/12 §4). reset()은 folder는 유지하고 나머지만 idle로 되돌린다.
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
