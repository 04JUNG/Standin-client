import { Navigate, useNavigate, useParams } from "react-router-dom";
import {
  AlertCircle,
  CheckCircle2,
  FolderOpen,
  Loader2,
  RotateCcw,
  Save,
  Sparkles,
} from "lucide-react";
import { AppShell } from "@/shared/components/AppShell";
import { Button } from "@/shared/components/Button";
import { ShortcutKey } from "@/shared/components/ShortcutKey";
import { useShortcuts } from "@/shared/hooks/useShortcuts";
import { resolveAccelerator } from "@/shared/lib/shortcutRegistry";
import { useShortcutStore } from "@/shared/stores/shortcutStore";
import { dragService } from "../api/drag.service";
import { SavedFileList } from "../components/SavedFileList";
import { useSaveFlow } from "../hooks/useSaveFlow";

/**
 * 저장 화면(docs/03 §8, ADR-009).
 *
 * 저장 버튼이 없다. 화면에 들어오면 설정된 폴더에 자동으로 저장하고, 여기서는 결과를
 * 알리고 클립스튜디오로 넘기는 일만 한다. 오케스트레이션은 useSaveFlow가 소유한다.
 */
export function SavePage() {
  const { jobId } = useParams<{ jobId: string }>();
  const navigate = useNavigate();
  const bindings = useShortcutStore((s) => s.bindings);

  const {
    folder,
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
  } = useSaveFlow(jobId);

  function handleNewScene() {
    newScene();
    navigate("/app/home", { replace: true });
  }

  useShortcuts({
    "save.revealFolder": isSaved ? () => revealSaved() : undefined,
    "save.chooseFolder": status !== "saving" ? () => void saveToAnotherFolder() : undefined,
    "save.save": status === "error" ? () => void retry() : undefined,
    "save.newScene": isSaved ? () => handleNewScene() : undefined,
  });

  if (!jobId) return <Navigate to="/app/home" replace />;
  if (selections.length === 0) return <Navigate to={`/app/jobs/${jobId}`} replace />;

  return (
    <AppShell title={isSaved ? "저장 완료" : "저장"}>
      <div className="mx-auto flex max-w-[520px] flex-col gap-5 rounded-xl border border-border bg-surface-0 p-6">
        {status === "saving" && (
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <Loader2 className="h-8 w-8 animate-spin text-brand-sky" aria-hidden />
            <p className="text-[14px] text-text-secondary">
              포즈 {selections.length}개를 저장하고 있습니다…
            </p>
            <p className="break-all text-[12px] text-text-secondary">{folder}</p>
          </div>
        )}

        {status === "error" && (
          <div className="flex flex-col gap-3">
            <div className="flex items-start gap-2 rounded-lg bg-brand-coral/10 p-3 text-[13px] text-brand-coral">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <p role="alert">{error}</p>
            </div>
            <p className="break-all text-[12px] text-text-secondary">
              저장을 시도한 폴더: {folder}
            </p>
            <div className="flex flex-col gap-2">
              <Button size="lg" onClick={() => void retry()}>
                <RotateCcw className="h-4 w-4" aria-hidden />
                다시 저장
                <ShortcutKey
                  accelerator={resolveAccelerator("save.save", bindings)!}
                  className="ml-1"
                />
              </Button>
              <Button variant="secondary" size="md" onClick={() => void saveToAnotherFolder()}>
                <Save className="h-4 w-4" aria-hidden />
                다른 폴더에 저장
                <ShortcutKey
                  accelerator={resolveAccelerator("save.chooseFolder", bindings)!}
                  className="ml-1"
                />
              </Button>
              <Button variant="ghost" size="md" onClick={() => void resetToDownloads()}>
                다운로드 폴더로 재설정하고 저장
              </Button>
            </div>
          </div>
        )}

        {isSaved && (
          <>
            <div className="flex flex-col items-center gap-2 text-center">
              <CheckCircle2 className="h-10 w-10 text-brand-coral" aria-hidden />
              <p className="text-[15px] font-semibold text-text-primary">
                포즈 {selections.length}개를 저장했습니다.
              </p>
            </div>

            <div className="flex flex-col gap-2">
              <p className="text-[13px] text-text-secondary">
                {dragService.isSupported
                  ? "아래 파일을 클립스튜디오 캔버스로 끌어놓으면 데생 인형이 만들어집니다."
                  : "폴더를 열어 BVH를 클립스튜디오 캔버스로 끌어놓으면 데생 인형이 만들어집니다."}
              </p>
              <SavedFileList paths={savedPaths} onCopy={copyPath} />
            </div>

            <div className="flex flex-col gap-2 border-t border-border pt-4">
              <Button variant="secondary" size="md" onClick={revealSaved}>
                <FolderOpen className="h-4 w-4" aria-hidden />
                폴더 열기
                <ShortcutKey
                  accelerator={resolveAccelerator("save.revealFolder", bindings)!}
                  className="ml-1"
                />
              </Button>
              <Button variant="secondary" size="md" onClick={() => void saveToAnotherFolder()}>
                <Save className="h-4 w-4" aria-hidden />
                다른 폴더에 저장
                <ShortcutKey
                  accelerator={resolveAccelerator("save.chooseFolder", bindings)!}
                  className="ml-1"
                />
              </Button>
              <Button variant="ghost" size="md" onClick={handleNewScene}>
                <Sparkles className="h-4 w-4" aria-hidden />새 장면 분석
                <ShortcutKey
                  accelerator={resolveAccelerator("save.newScene", bindings)!}
                  className="ml-1"
                />
              </Button>
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
