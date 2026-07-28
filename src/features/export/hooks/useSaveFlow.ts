import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useUploadStore } from "@/features/upload/store/uploadStore";
import { usePoseSelectionStore } from "@/features/pose-viewer/store/poseSelectionStore";
import { poseQueryKeys } from "@/features/pose-viewer/queryKeys";
import type { AnalysisResult } from "@/features/pose-viewer/api/pose.contract";
import { exportService } from "../api/export.service";
import { ExportError } from "../api/export.contract";
import { defaultFileName, personFileName } from "../lib/defaultFileName";
import { mockBvhContent } from "../lib/mockBvhContent";
import { useExportStore } from "../store/exportStore";

/** 후보의 실 서버 bvh_url에서 원본 BVH 내용을 받아온다. 없으면(Mock 후보) placeholder로 대체. */
async function resolveBvhContent(bvhUrl: string | undefined, candidateId: string): Promise<string> {
  if (!bvhUrl) return mockBvhContent(candidateId);
  let res: Response;
  try {
    res = await fetch(bvhUrl);
  } catch {
    throw new Error("BVH 파일을 서버에서 받아오지 못했습니다.");
  }
  if (!res.ok) throw new Error(`BVH 다운로드에 실패했습니다. (HTTP ${res.status})`);
  return res.text();
}

/**
 * 저장 오케스트레이션(docs/12 §3~4).
 *
 * 앱 모드(SavePage)와 바 모드(BarSavePage)가 이 훅을 공유하고 뷰만 다르다.
 * 폴더 선택은 네이티브 대화상자라 작은 창에서도 그대로 동작한다.
 */
export function useSaveFlow(jobId: string | undefined) {
  const queryClient = useQueryClient();
  const draft = useUploadStore((s) => s.draft);
  const clearDraft = useUploadStore((s) => s.clearDraft);
  const selectedByPerson = usePoseSelectionStore((s) => s.selectedByPerson);
  const clearSelection = usePoseSelectionStore((s) => s.clearSelection);

  const folder = useExportStore((s) => s.folder);
  const fileName = useExportStore((s) => s.fileName);
  const status = useExportStore((s) => s.status);
  const savedPaths = useExportStore((s) => s.savedPaths);
  const error = useExportStore((s) => s.error);
  const setFolder = useExportStore((s) => s.setFolder);
  const setFileName = useExportStore((s) => s.setFileName);
  const startSaving = useExportStore((s) => s.startSaving);
  const setSaved = useExportStore((s) => s.setSaved);
  const setError = useExportStore((s) => s.setError);
  const clearError = useExportStore((s) => s.clearError);
  const reset = useExportStore((s) => s.reset);

  useEffect(() => {
    if (!folder) {
      exportService
        .getDefaultFolder()
        .then(setFolder)
        .catch(() => {});
    }
    if (!fileName) {
      setFileName(defaultFileName(draft?.originalName));
    }
    // 마운트 시 1회만 기본값을 채운다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selections = Object.entries(selectedByPerson);
  const isSaved = status === "saved" && savedPaths.length > 0;
  const canSave = Boolean(folder && fileName) && status !== "saving";

  async function chooseFolder() {
    const picked = await exportService.chooseFolder(folder ?? undefined);
    if (picked) setFolder(picked);
  }

  async function save() {
    if (!folder || !fileName || !jobId || selections.length === 0) return;
    startSaving();
    try {
      const analysisResult = queryClient.getQueryData<AnalysisResult>(poseQueryKeys.result(jobId));
      const files = await Promise.all(
        selections.map(async ([personIndexStr, candidateId]) => {
          const personIndex = Number(personIndexStr);
          const candidate = analysisResult?.people
            .find((p) => p.index === personIndex)
            ?.candidates.find((c) => c.id === candidateId);
          const content = await resolveBvhContent(candidate?.bvhUrl, candidateId);
          return { fileName: personFileName(fileName, personIndex, selections.length), content };
        }),
      );
      const results = await exportService.saveCandidates({ folder, files });
      setSaved(results.map((r) => r.path));
    } catch (err) {
      setError(
        err instanceof ExportError
          ? err.message
          : err instanceof Error
            ? err.message
            : "알 수 없는 오류로 저장하지 못했습니다.",
      );
    }
  }

  async function resetToDownloads() {
    const dir = await exportService.getDefaultFolder();
    setFolder(dir);
    clearError();
  }

  /** 저장을 마치고 새 장면을 시작한다. 목적지는 호출부가 정한다. */
  function newScene() {
    reset();
    clearSelection();
    clearDraft();
  }

  function revealSaved() {
    if (savedPaths[0]) void exportService.revealInFolder(savedPaths[0]);
  }

  return {
    folder,
    fileName,
    status,
    savedPaths,
    error,
    selections,
    isSaved,
    canSave,
    setFileName,
    chooseFolder,
    save,
    resetToDownloads,
    newScene,
    revealSaved,
  };
}
