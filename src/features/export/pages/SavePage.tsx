import { Navigate, useNavigate, useParams } from "react-router-dom";
import { CheckCircle2, FolderOpen, Sparkles } from "lucide-react";
import { AppShell } from "@/shared/components/AppShell";
import { Button } from "@/shared/components/Button";
import { Input } from "@/shared/components/Input";
import { ShortcutKey } from "@/shared/components/ShortcutKey";
import { useShortcuts } from "@/shared/hooks/useShortcuts";
import { resolveAccelerator } from "@/shared/lib/shortcutRegistry";
import { useShortcutStore } from "@/shared/stores/shortcutStore";
import { useSaveFlow } from "../hooks/useSaveFlow";

/** 저장 화면(docs/03 §8, docs/12 §3~4). 오케스트레이션은 useSaveFlow가 소유한다. */
export function SavePage() {
  const { jobId } = useParams<{ jobId: string }>();
  const navigate = useNavigate();
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
    resetToDownloads,
    newScene,
    revealSaved,
  } = useSaveFlow(jobId);

  function handleNewScene() {
    newScene();
    navigate("/app/home", { replace: true });
  }

  useShortcuts({
    "save.save": !isSaved && canSave ? () => void save() : undefined,
    "save.chooseFolder": !isSaved ? () => void chooseFolder() : undefined,
    "save.newScene": isSaved ? () => handleNewScene() : undefined,
  });

  if (!jobId) return <Navigate to="/app/home" replace />;
  if (selections.length === 0) return <Navigate to={`/app/jobs/${jobId}`} replace />;

  if (isSaved) {
    return (
      <AppShell title="저장 완료">
        <div className="mx-auto flex max-w-[520px] flex-col items-center gap-4 rounded-xl border border-border bg-surface-0 p-8 text-center">
          <CheckCircle2 className="h-10 w-10 text-brand-coral" aria-hidden />
          <p className="text-[15px] font-semibold text-text-primary">
            포즈 {selections.length}개를 저장했습니다.
          </p>
          <ul className="flex w-full flex-col gap-1">
            {savedPaths.map((path) => (
              <li key={path} className="break-all text-[13px] text-text-secondary">
                {path}
              </li>
            ))}
          </ul>
          <div className="flex w-full flex-col gap-2 pt-2">
            <Button size="lg" onClick={revealSaved}>
              <FolderOpen className="h-4 w-4" aria-hidden />
              폴더 열기
            </Button>
            <Button variant="secondary" size="md" onClick={handleNewScene}>
              <Sparkles className="h-4 w-4" aria-hidden />새 장면 분석
              <ShortcutKey
                accelerator={resolveAccelerator("save.newScene", bindings)!}
                className="ml-1"
              />
            </Button>
          </div>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell title="저장">
      <div className="mx-auto flex max-w-[520px] flex-col gap-5 rounded-xl border border-border bg-surface-0 p-6">
        <Input label="파일 이름" value={fileName} onChange={(e) => setFileName(e.target.value)} />

        <div className="flex flex-col gap-1">
          <span className="text-[13px] font-semibold text-text-secondary">저장 위치</span>
          <div className="flex items-center gap-2">
            <p className="flex-1 truncate rounded-lg border border-border bg-surface-1 px-3 py-2 text-[13px] text-text-primary">
              {folder ?? "불러오는 중..."}
            </p>
            <Button variant="secondary" size="md" onClick={() => void chooseFolder()}>
              다른 폴더 선택
              <ShortcutKey
                accelerator={resolveAccelerator("save.chooseFolder", bindings)!}
                className="ml-1"
              />
            </Button>
          </div>
        </div>

        {error && (
          <div className="flex flex-col gap-2 rounded-lg bg-brand-coral/10 p-3 text-[13px] text-brand-coral">
            <p>{error}</p>
            <Button variant="ghost" size="md" onClick={() => void resetToDownloads()}>
              다운로드 폴더로 재설정
            </Button>
          </div>
        )}

        <Button
          size="lg"
          loading={status === "saving"}
          disabled={!folder || !fileName}
          onClick={() => void save()}
        >
          저장 {selections.length > 1 ? `(${selections.length}개 파일)` : ""}
          <ShortcutKey accelerator={resolveAccelerator("save.save", bindings)!} className="ml-1" />
        </Button>
      </div>
    </AppShell>
  );
}
