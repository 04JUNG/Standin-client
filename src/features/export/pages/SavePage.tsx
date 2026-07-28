import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { CheckCircle2, FolderOpen, Sparkles } from "lucide-react";
import { AppShell } from "@/shared/components/AppShell";
import { Button } from "@/shared/components/Button";
import { Input } from "@/shared/components/Input";
import { ShortcutKey } from "@/shared/components/ShortcutKey";
import { useShortcuts } from "@/shared/hooks/useShortcuts";
import { resolveAccelerator } from "@/shared/lib/shortcutRegistry";
import { useShortcutStore } from "@/shared/stores/shortcutStore";
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

/** 저장 화면(docs/03 §8, docs/12 §3~4). */
export function SavePage() {
  const { jobId } = useParams<{ jobId: string }>();
  const navigate = useNavigate();

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
  const bindings = useShortcutStore((s) => s.bindings);

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

  // 가드보다 먼저 호출해 hook 순서를 고정한다.
  // 저장 완료 화면과 입력 화면이 서로 다른 키를 쓰므로 분기해서 넘긴다.
  useShortcuts({
    "save.save": !isSaved && canSave ? () => void handleSave() : undefined,
    "save.chooseFolder": !isSaved ? () => void handleChooseFolder() : undefined,
    "save.newScene": isSaved ? () => handleNewScene() : undefined,
  });

  if (!jobId) return <Navigate to="/app/home" replace />;
  if (selections.length === 0) return <Navigate to={`/app/jobs/${jobId}`} replace />;

  async function handleChooseFolder() {
    const picked = await exportService.chooseFolder(folder ?? undefined);
    if (picked) setFolder(picked);
  }

  async function handleSave() {
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

  async function handleResetToDownloads() {
    const dir = await exportService.getDefaultFolder();
    setFolder(dir);
    clearError();
  }

  function handleNewScene() {
    reset();
    clearSelection();
    clearDraft();
    navigate("/app/home", { replace: true });
  }

  if (status === "saved" && savedPaths.length > 0) {
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
            <Button size="lg" onClick={() => exportService.revealInFolder(savedPaths[0])}>
              <FolderOpen className="h-4 w-4" aria-hidden />
              폴더 열기
            </Button>
            <Button variant="secondary" size="md" onClick={handleNewScene}>
              <Sparkles className="h-4 w-4" aria-hidden />
              새 장면 분석
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
            <Button variant="secondary" size="md" onClick={handleChooseFolder}>
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
            <Button variant="ghost" size="md" onClick={handleResetToDownloads}>
              다운로드 폴더로 재설정
            </Button>
          </div>
        )}

        <Button
          size="lg"
          loading={status === "saving"}
          disabled={!folder || !fileName}
          onClick={handleSave}
        >
          저장 {selections.length > 1 ? `(${selections.length}개 파일)` : ""}
          <ShortcutKey accelerator={resolveAccelerator("save.save", bindings)!} className="ml-1" />
        </Button>
      </div>
    </AppShell>
  );
}
