import { Navigate, useNavigate } from "react-router-dom";
import { AlertCircle, CheckCircle2, FolderOpen, Sparkles } from "lucide-react";
import { Button } from "@/shared/components/Button";
import { Input } from "@/shared/components/Input";
import { ShortcutKey } from "@/shared/components/ShortcutKey";
import { useShortcuts } from "@/shared/hooks/useShortcuts";
import { resolveAccelerator } from "@/shared/lib/shortcutRegistry";
import { useShortcutStore } from "@/shared/stores/shortcutStore";
import { useSaveFlow } from "@/features/export/hooks/useSaveFlow";
import { usePoseSelectionStore } from "@/features/pose-viewer/store/poseSelectionStore";
import { BarShell } from "../components/BarShell";

/**
 * 바 모드의 저장(ADR-008). 여기까지 오면 앱 창에 한 번도 들어가지 않고 흐름이 끝난다.
 *
 * 로직은 useSaveFlow로 앱 모드와 공유한다. 폴더 선택은 Rust 네이티브 대화상자라
 * 420px 창에서도 정상 동작한다.
 */
export function BarSavePage() {
  const navigate = useNavigate();
  const jobId = usePoseSelectionStore((s) => s.jobId);
  const bindings = useShortcutStore((s) => s.bindings);

  const {
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
    newScene,
    revealSaved,
  } = useSaveFlow(jobId ?? undefined);

  useShortcuts({
    "save.save": !isSaved && canSave ? () => void save() : undefined,
    "save.chooseFolder": !isSaved ? () => void chooseFolder() : undefined,
    "save.newScene": isSaved
      ? () => {
          newScene();
          navigate("/bar/actions", { replace: true });
        }
      : undefined,
  });

  if (!jobId) return <Navigate to="/bar/actions" replace />;
  if (selections.length === 0) return <Navigate to="/bar/candidates" replace />;

  if (isSaved) {
    return (
      <BarShell title="저장 완료">
        <div className="flex h-full flex-col gap-2 p-2.5">
          <p className="flex items-center gap-1.5 text-[12px] font-semibold text-text-primary">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-brand-coral" aria-hidden />
            포즈 {selections.length}개를 저장했습니다.
          </p>
          <ul className="min-h-0 flex-1 overflow-auto rounded-lg bg-surface-1 p-2">
            {savedPaths.map((path) => (
              <li key={path} className="break-all text-[11px] text-text-secondary">
                {path}
              </li>
            ))}
          </ul>
          <div className="flex shrink-0 gap-1.5">
            <Button size="md" onClick={revealSaved} className="flex-1">
              <FolderOpen className="h-3.5 w-3.5" aria-hidden />
              폴더 열기
            </Button>
            <Button
              variant="secondary"
              size="md"
              className="flex-1"
              onClick={() => {
                newScene();
                navigate("/bar/actions", { replace: true });
              }}
            >
              <Sparkles className="h-3.5 w-3.5" aria-hidden />새 장면
              <ShortcutKey accelerator={resolveAccelerator("save.newScene", bindings)!} />
            </Button>
          </div>
        </div>
      </BarShell>
    );
  }

  return (
    <BarShell title="저장">
      <div className="flex h-full flex-col gap-2 p-2.5">
        <Input label="파일 이름" value={fileName} onChange={(e) => setFileName(e.target.value)} />

        <div className="flex min-w-0 items-end gap-1.5">
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="text-[11px] font-semibold text-text-secondary">저장 위치</span>
            <p className="truncate rounded-lg border border-border bg-surface-1 px-2 py-1.5 text-[11px] text-text-primary">
              {folder ?? "불러오는 중…"}
            </p>
          </div>
          <Button variant="secondary" size="md" onClick={() => void chooseFolder()}>
            변경
            <ShortcutKey accelerator={resolveAccelerator("save.chooseFolder", bindings)!} />
          </Button>
        </div>

        {error && (
          <p role="alert" className="flex items-start gap-1 text-[11px] text-brand-coral">
            <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
            {error}
          </p>
        )}

        <Button
          size="md"
          className="mt-auto"
          loading={status === "saving"}
          disabled={!canSave}
          onClick={() => void save()}
        >
          저장 {selections.length > 1 ? `(${selections.length}개)` : ""}
          <ShortcutKey accelerator={resolveAccelerator("save.save", bindings)!} />
        </Button>
      </div>
    </BarShell>
  );
}
