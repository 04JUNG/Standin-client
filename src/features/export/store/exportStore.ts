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
  /**
   * 이 저장 상태가 어느 job의 것인가. 영속하지 않는다 — 앱을 다시 켜면 저장 화면부터
   * 시작하는 흐름이 없다.
   */
  jobId: string | null;
  fileName: string;
  status: ExportStatus;
  /** 인물마다 파일을 하나씩 저장하므로 배열이다. */
  savedPaths: string[];
  error: string | null;
  setFolder(folder: string): void;
  beginJob(jobId: string): void;
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
      jobId: null,
      fileName: "",
      status: "idle",
      savedPaths: [],
      error: null,
      setFolder: (folder) => set({ folder }),
      /**
       * 다른 job의 저장을 시작한다. job이 바뀌었을 때만 앞선 결과를 지운다.
       *
       * 이게 없으면 저장을 마치고("saved") "새 장면"을 누르지 않은 채 작업 기록에서
       * 다른 작업으로 들어가 저장할 때, 자동 저장이 `status !== "idle"` 조건에 걸려
       * 조용히 건너뛴다. 파일 이름도 앞 작업의 것이 남는다.
       *
       * 같은 job이면 아무것도 하지 않는다 — 앱↔바 전환으로 화면이 다시 마운트될 때마다
       * 같은 포즈를 또 저장하면 안 된다.
       */
      beginJob: (jobId) =>
        set((state) =>
          state.jobId === jobId
            ? state
            : { jobId, fileName: "", status: "idle", savedPaths: [], error: null },
        ),
      setFileName: (fileName) => set({ fileName }),
      startSaving: () => set({ status: "saving", error: null }),
      setSaved: (paths) => set({ status: "saved", savedPaths: paths, error: null }),
      setError: (message) => set({ status: "error", error: message }),
      clearError: () => set({ status: "idle", error: null }),
      reset: () => set({ jobId: null, fileName: "", status: "idle", savedPaths: [], error: null }),
    }),
    {
      name: "standin-export-folder",
      partialize: (state) => ({ folder: state.folder }),
    },
  ),
);
