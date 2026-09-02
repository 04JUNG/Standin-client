import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import {
  AlertCircle,
  CheckCircle2,
  FolderOpen,
  Loader2,
  RotateCcw,
  Save,
  Sparkles,
} from "lucide-react";
import { Button } from "@/shared/components/Button";
import { ShortcutKey } from "@/shared/components/ShortcutKey";
import { useShortcuts } from "@/shared/hooks/useShortcuts";
import { resolveAccelerator } from "@/shared/lib/shortcutRegistry";
import { useShortcutStore } from "@/shared/stores/shortcutStore";
import { dragService } from "@/features/export/api/drag.service";
import { SavedFileList } from "@/features/export/components/SavedFileList";
import { useSaveFlow } from "@/features/export/hooks/useSaveFlow";
import { usePoseSelectionStore } from "@/features/pose-viewer/store/poseSelectionStore";
import { BarShell } from "../components/BarShell";
import { submitFeedback } from "@/features/analytics/analyticsClient";

/**
 * 바 모드의 저장(ADR-008, ADR-009). 여기까지 오면 앱 창에 한 번도 들어가지 않고 흐름이 끝난다.
 *
 * 저장은 자동으로 일어나므로 이 화면의 주 동작은 파일 목록을 클립스튜디오 캔버스로
 * 끌어놓는 것이다. 바가 클립스튜디오 위에 떠 있어서 드래그 거리가 가장 짧다.
 * `폴더 열기`는 드래그가 막힌 환경의 폴백이다.
 *
 * 로직은 useSaveFlow로 앱 모드와 공유한다.
 */
export function BarSavePage() {
  const navigate = useNavigate();
  const jobId = usePoseSelectionStore((s) => s.jobId);
  const bindings = useShortcutStore((s) => s.bindings);
  const serverJobId = usePoseSelectionStore((s) => s.serverJobId);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [feedbackError, setFeedbackError] = useState(false);

  const {
    folder,
    format,
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
  } = useSaveFlow(jobId ?? undefined);

  function handleNewScene() {
    newScene();
    navigate("/bar/actions", { replace: true });
  }

  async function sendFeedback(reason: string) {
    if (!serverJobId || feedback) return;
    setFeedbackError(false);
    try {
      await submitFeedback(serverJobId, reason);
      setFeedback(reason);
    } catch {
      setFeedbackError(true);
    }
  }

  useShortcuts({
    "save.revealFolder": isSaved ? () => revealSaved() : undefined,
    "save.chooseFolder": status !== "saving" ? () => void saveToAnotherFolder() : undefined,
    "save.save": status === "error" ? () => void retry() : undefined,
    "save.newScene": isSaved ? () => handleNewScene() : undefined,
  });

  if (!jobId) return <Navigate to="/bar/actions" replace />;
  if (selections.length === 0) return <Navigate to="/bar/candidates" replace />;

  return (
    <BarShell title={isSaved ? "저장 완료" : "저장"}>
      <div className="flex h-full flex-col gap-2 p-2.5">
        {status === "saving" && (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 text-text-secondary">
            <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
            <p className="text-[12px]">포즈 {selections.length}개를 저장하고 있습니다…</p>
          </div>
        )}

        {status === "error" && (
          <>
            <p role="alert" className="flex items-start gap-1 text-[11px] text-brand-coral">
              <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
              {error}
            </p>
            <p className="truncate text-[10px] text-text-secondary" title={folder ?? undefined}>
              {folder}
            </p>
            <div className="mt-auto flex shrink-0 flex-col gap-1.5">
              <div className="flex gap-1.5">
                <Button size="sm" className="min-w-0 flex-1" onClick={() => void retry()}>
                  <RotateCcw className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  다시 저장
                  <ShortcutKey accelerator={resolveAccelerator("save.save", bindings)!} compact />
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  className="min-w-0 flex-1"
                  onClick={() => void saveToAnotherFolder()}
                >
                  <Save className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  다른 폴더
                  <ShortcutKey
                    accelerator={resolveAccelerator("save.chooseFolder", bindings)!}
                    compact
                  />
                </Button>
              </div>
              <Button variant="ghost" size="sm" onClick={() => void resetToDownloads()}>
                다운로드 폴더로 재설정하고 저장
              </Button>
            </div>
          </>
        )}

        {isSaved && (
          <>
            <p className="flex shrink-0 items-center gap-1.5 text-[12px] font-semibold text-text-primary">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-brand-coral" aria-hidden />
              포즈 {selections.length}개를 저장했습니다.
            </p>

            <p className="shrink-0 text-[10px] text-text-secondary">
              {dragService.isSupported
                ? "파일을 클립스튜디오 캔버스로 끌어놓으면 데생 인형이 만들어집니다."
                : `폴더를 열고 ${format.toUpperCase()} 파일을 클립스튜디오 캔버스로 끌어놓으면 데생 인형이 만들어집니다.`}
            </p>
            {format === "bvh" && (
              <p className="shrink-0 text-[10px] text-text-secondary">
                BVH는 클립스튜디오 3.1.0 이상에서 열 수 있습니다.
              </p>
            )}

            <div className="min-h-0 flex-1 overflow-auto">
              <SavedFileList paths={savedPaths} onCopy={copyPath} dense />
            </div>

            {/* 서버 job이 없으면 보낼 곳이 없다(SavePage와 같은 이유). */}
            {serverJobId && (
              <label className="flex shrink-0 items-center gap-2 text-[10px] text-text-secondary">
                {feedbackError ? (
                  <span role="alert" className="shrink-0 text-brand-coral">
                    전송 실패
                  </span>
                ) : (
                  "결과 피드백"
                )}
                <select
                  className="min-w-0 flex-1 rounded border border-border bg-surface-0 px-2 py-1"
                  value={feedback ?? ""}
                  disabled={Boolean(feedback)}
                  onChange={(event) => void sendFeedback(event.target.value)}
                >
                  <option value="" disabled>선택</option>
                  <option value="good">좋아요</option>
                  <option value="person_missing">인물 누락</option>
                  <option value="skeleton_wrong">스켈레톤 오류</option>
                  <option value="candidates_irrelevant">후보 불일치</option>
                  <option value="export_problem">저장 문제</option>
                  <option value="other">기타</option>
                </select>
              </label>
            )}

            {/*
              420px 안에 버튼 두 개가 들어가야 해서 바에서는 작은 크기와 compact 단축키를 쓴다.
              md + 22px 칩으로는 "다른 폴더"가 두 줄로 깨졌다.
            */}
            <div className="flex shrink-0 flex-col gap-1.5">
              <Button variant="secondary" size="sm" onClick={revealSaved}>
                <FolderOpen className="h-3.5 w-3.5 shrink-0" aria-hidden />
                폴더 열기
                <ShortcutKey
                  accelerator={resolveAccelerator("save.revealFolder", bindings)!}
                  compact
                />
              </Button>
              <div className="flex gap-1.5">
                <Button
                  variant="secondary"
                  size="sm"
                  className="min-w-0 flex-1"
                  onClick={() => void saveToAnotherFolder()}
                >
                  <Save className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  다른 폴더
                  <ShortcutKey
                    accelerator={resolveAccelerator("save.chooseFolder", bindings)!}
                    compact
                  />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="min-w-0 flex-1"
                  onClick={handleNewScene}
                >
                  <Sparkles className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  새 장면
                  <ShortcutKey
                    accelerator={resolveAccelerator("save.newScene", bindings)!}
                    compact
                  />
                </Button>
              </div>
            </div>
          </>
        )}
      </div>
    </BarShell>
  );
}
