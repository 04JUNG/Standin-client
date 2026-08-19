import { useCallback, useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { apiFetchText } from "@/shared/api/client";
import { ApiError } from "@/shared/api/errors";
import { copyText } from "@/shared/lib/copyText";
import { useUploadStore } from "@/features/upload/store/uploadStore";
import { usePoseSelectionStore } from "@/features/pose-viewer/store/poseSelectionStore";
import { poseQueryKeys } from "@/features/pose-viewer/queryKeys";
import type { AnalysisResult } from "@/features/pose-viewer/api/pose.contract";
import { currentSurface, trackEvent } from "@/features/analytics/analyticsClient";
import { exportService } from "../api/export.service";
import { ExportError } from "../api/export.contract";
import { defaultFileName, personFileName } from "../lib/defaultFileName";
import { mockBvhContent } from "../lib/mockBvhContent";
import { useExportStore } from "../store/exportStore";

/** 후보의 실 서버 bvh_url에서 원본 BVH 내용을 받아온다. 없으면(Mock 후보) placeholder로 대체. */
async function resolveBvhContent(bvhUrl: string | undefined, candidateId: string): Promise<string> {
  if (!bvhUrl) return mockBvhContent(candidateId);
  try {
    return await apiFetchText(bvhUrl, { auth: false });
  } catch (error) {
    // 추론이 릴리스 시점에 격리한 포즈다. 후보 목록은 분석 때 확정되므로, 격리가 늘어나면
    // 화면에 이미 떠 있던 선택이 여기서 409로 돌아온다. **재시도로는 절대 풀리지 않으므로**
    // 일반 실패로 뭉치면 사용자는 영원히 실패하는 재시도 버튼만 누르게 된다.
    if (error instanceof ApiError && error.code === "POSE_UNAVAILABLE") {
      throw new Error("이 포즈는 더 이상 제공되지 않습니다. 후보 화면에서 다른 포즈를 선택해 주세요.");
    }
    throw new Error("BVH 파일을 서버에서 받아오지 못했습니다.");
  }
}

/**
 * 저장 오케스트레이션(docs/12 §3~4, ADR-009).
 *
 * 저장은 화면에 들어오면 **자동으로** 시작한다. 사용자가 폴더와 파일 이름을 확인하고
 * 저장 버튼을 누르는 단계를 없앴다 — 마찰의 대부분이 거기 있었기 때문이다. 저장 폴더는
 * 설정에서 한 번 정하고, 이 화면에서는 결과를 알리고 클립스튜디오로 넘기는 일만 한다.
 *
 * 앱 모드(SavePage)와 바 모드(BarSavePage)가 이 훅을 공유하고 뷰만 다르다.
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

  const selections = Object.entries(selectedByPerson);
  const selectionCount = selections.length;
  const isSaved = status === "saved" && savedPaths.length > 0;

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

  // 최신 값을 자동 저장 effect에서 읽되, effect가 값 변화마다 재실행되지는 않게 한다.
  const latest = useRef({ jobId, fileName, selections, queryClient });
  latest.current = { jobId, fileName, selections, queryClient };

  const runSave = useCallback(
    async (targetFolder: string) => {
      const { jobId: id, fileName: name, selections: picks, queryClient: qc } = latest.current;
      if (!targetFolder || !name || !id || picks.length === 0) return;

      startSaving();
      try {
        const analysisResult = qc.getQueryData<AnalysisResult>(poseQueryKeys.result(id));
        if (!analysisResult) {
          throw new Error("분석 결과를 찾지 못했습니다. 후보 화면에서 다시 시도해 주세요.");
        }
        const refineByPerson = usePoseSelectionStore.getState().refineByPerson;
        const files = await Promise.all(
          picks.map(async ([personIndexStr, candidateId]) => {
            const personIndex = Number(personIndexStr);
            const candidate = analysisResult?.people
              .find((p) => p.index === personIndex)
              ?.candidates.find((c) => c.id === candidateId);
            if (!candidate) {
              throw new Error("선택한 포즈를 분석 결과에서 찾지 못했습니다.");
            }
            // 조정 결과가 있으면 BFF가 확정한 URL이 최종이다. 확인 화면이 보여 준 것과
            // 같은 URL이어야 "본 것과 저장된 것이 다르다"가 생기지 않는다.
            // 어느 쪽이든 BFF 경로다 — 추론 서버의 /refined/{handle}는 그 태스크의 로컬
            // 디스크라 태스크가 교체되면 사라진다(FE-05).
            const outcome = refineByPerson[personIndex];
            const currentOutcome =
              outcome?.jobId === analysisResult.jobId && outcome.candidateId === candidateId
                ? outcome
                : undefined;
            const bvhUrl = currentOutcome?.exportUrl ?? candidate.bvhUrl;
            const content = await resolveBvhContent(bvhUrl, candidateId);
            return { fileName: personFileName(name, personIndex, picks.length), content };
          }),
        );
        const results = await exportService.saveCandidates({ folder: targetFolder, files });
        setSaved(results.map((r) => r.path));
        // 사용자 기준 성공은 BFF의 BVH 응답이 아니라 로컬 파일 저장이다.
        // 서버 export_events만 보면 저장 단계 실패가 성공으로 집계된다.
        trackEvent(
          "export_completed",
          { fileCount: results.length, surface: currentSurface() },
          usePoseSelectionStore.getState().serverJobId ?? undefined,
        );
      } catch (err) {
        setError(
          err instanceof ExportError
            ? err.message
            : err instanceof Error
              ? err.message
              : "알 수 없는 오류로 저장하지 못했습니다.",
        );
        trackEvent(
          "export_failed",
          {
            code: err instanceof ExportError ? err.code : "UNKNOWN",
            surface: currentSurface(),
          },
          usePoseSelectionStore.getState().serverJobId ?? undefined,
        );
      }
    },
    [startSaving, setSaved, setError],
  );

  /**
   * 자동 저장(ADR-009). 폴더와 파일 이름이 준비되면 한 번만 실행한다.
   *
   * StrictMode의 effect 이중 실행과 status 변화로 인한 재실행을 ref로 막는다. 재시도와
   * "다른 폴더에 저장"은 사용자 동작이므로 이 경로를 타지 않는다.
   */
  const autoSaveStarted = useRef(false);
  useEffect(() => {
    if (autoSaveStarted.current) return;
    if (!folder || !fileName || !jobId || selectionCount === 0) return;
    if (status !== "idle") return;
    autoSaveStarted.current = true;
    void runSave(folder);
  }, [folder, fileName, jobId, selectionCount, status, runSave]);

  /** 저장 실패 후 같은 폴더로 다시 시도한다. */
  async function retry() {
    if (folder) await runSave(folder);
  }

  /**
   * 이번 한 번만 다른 폴더에 저장한다. 설정의 기본 저장 폴더는 바꾸지 않는다(ADR-009).
   * 기본 폴더를 바꾸려면 설정 화면으로 간다.
   */
  async function saveToAnotherFolder() {
    const picked = await exportService.chooseFolder(folder ?? undefined);
    if (picked) await runSave(picked);
  }

  /** 설정 폴더가 사라졌을 때의 복구 경로. 기본값으로 되돌리고 그 폴더에 저장한다. */
  async function resetToDownloads() {
    const dir = await exportService.getDefaultFolder();
    setFolder(dir);
    clearError();
    await runSave(dir);
  }

  /** 저장을 마치고 새 장면을 시작한다. 목적지는 호출부가 정한다. */
  function newScene() {
    reset();
    clearSelection();
    clearDraft();
    autoSaveStarted.current = false;
  }

  function revealSaved() {
    if (savedPaths[0]) void exportService.revealInFolder(savedPaths[0]);
  }

  /** 클립스튜디오 임포트 대화상자에 붙여넣는 폴백 경로(docs/12 §3). */
  function copyPath(path: string): Promise<boolean> {
    return copyText(path);
  }

  return {
    folder,
    fileName,
    status,
    savedPaths,
    error,
    selections,
    isSaved,
    retry,
    saveToAnotherFolder,
    resetToDownloads,
    newScene,
    revealSaved,
    copyPath,
  };
}
