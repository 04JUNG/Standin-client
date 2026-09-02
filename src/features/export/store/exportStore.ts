import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * 저장 상태(docs/09 §2 ExportDraft에 대응).
 *
 * `folder`와 `format`은 **사용자 설정값**이다. 설정 화면에서만 바꾸고 영속화해서 모든
 * 저장에 쓴다(ADR-009). 저장 화면의 "다른 폴더에 저장"과 "다른 포맷으로도 저장"은 그
 * 회차에만 적용되고 이 값들을 바꾸지 않는다.
 *
 * reset()은 folder·format은 유지하고 나머지만 idle로 되돌린다 — 다음 장면도 같은 폴더에
 * 같은 포맷으로 저장한다.
 */
export type ExportStatus = "idle" | "saving" | "saved" | "error";

/**
 * 저장 포맷. 기본은 FBX다 — 클립스튜디오가 리깅된 3D 소재로 바로 받는 형식이고,
 * BVH는 3.1.0 이상에서만 열린다.
 *
 * 서버가 FBX를 노출하지 않는 배포(`capabilities.fbxExport=false`)에서는 이 값이 fbx여도
 * 저장은 BVH로 내려간다. 설정값은 "가능하면 이 포맷"이라는 뜻이고, 실제 가능 여부는
 * 서버가 정한다.
 */
export type ExportFormat = "fbx" | "bvh";

type ExportState = {
  folder: string | null;
  /**
   * 이 저장 상태가 어느 job의 것인가. 영속하지 않는다 — 앱을 다시 켜면 저장 화면부터
   * 시작하는 흐름이 없다.
   */
  jobId: string | null;
  format: ExportFormat;
  fileName: string;
  status: ExportStatus;
  /** 인물마다 파일을 하나씩 저장하므로 배열이다. */
  savedPaths: string[];
  error: string | null;
  setFolder(folder: string): void;
  beginJob(jobId: string): void;
  setFormat(format: ExportFormat): void;
  setFileName(fileName: string): void;
  startSaving(): void;
  setSaved(paths: string[]): void;
  addSaved(paths: string[]): void;
  setError(message: string): void;
  clearError(): void;
  reset(): void;
};

export const useExportStore = create<ExportState>()(
  persist(
    (set) => ({
      folder: null,
      jobId: null,
      format: "fbx",
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
       *
       * ⚠ `format`을 비우지 않는다. 폴더와 같은 사용자 설정값이라 job이 바뀐다고
       *   되돌아가면 안 된다.
       */
      beginJob: (jobId) =>
        set((state) =>
          state.jobId === jobId
            ? state
            : { jobId, fileName: "", status: "idle", savedPaths: [], error: null },
        ),
      setFormat: (format) => set({ format }),
      setFileName: (fileName) => set({ fileName }),
      startSaving: () => set({ status: "saving", error: null }),
      setSaved: (paths) => set({ status: "saved", savedPaths: paths, error: null }),
      /**
       * 이미 저장한 목록에 이어 붙인다. 앞선 저장이 **유효한 채로** 파일이 더 생기는
       * 경우에만 쓴다 — 지금은 "다른 포맷으로도 저장" 하나다.
       *
       * setSaved로 교체하면 먼저 저장한 파일이 디스크에는 남는데 목록에서만 사라져,
       * 저장이 취소된 것처럼 보인다. 반대로 재시도·다른 폴더 저장은 앞선 결과를 대체하는
       * 것이 맞으므로 그쪽은 계속 setSaved를 쓴다.
       */
      addSaved: (paths) =>
        set((state) => ({
          status: "saved",
          savedPaths: [...state.savedPaths, ...paths],
          error: null,
        })),
      setError: (message) => set({ status: "error", error: message }),
      clearError: () => set({ status: "idle", error: null }),
      reset: () => set({ jobId: null, fileName: "", status: "idle", savedPaths: [], error: null }),
    }),
    {
      name: "standin-export-folder",
      partialize: (state) => ({ folder: state.folder, format: state.format }),
    },
  ),
);
