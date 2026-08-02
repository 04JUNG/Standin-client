import { useEffect, useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { AlertTriangle, Info, Loader2 } from "lucide-react";
import { AppShell } from "@/shared/components/AppShell";
import { Button } from "@/shared/components/Button";
import { useUploadStore } from "@/features/upload/store/uploadStore";
import { useAnalysisResult } from "../hooks/useAnalysisResult";
import { ShortcutKey } from "@/shared/components/ShortcutKey";
import { resolveAccelerator } from "@/shared/lib/shortcutRegistry";
import { useShortcutStore } from "@/shared/stores/shortcutStore";
import { usePoseSelectionStore } from "../store/poseSelectionStore";
import { usePoseViewerShortcuts } from "../hooks/usePoseViewerShortcuts";
import { PoseCandidateCard } from "../components/PoseCandidateCard";
import { confirmSelections } from "@/features/analytics/analyticsClient";

/** 포즈 후보 뷰어(docs/03 §7). 진행률 화면 없이 로딩 상태로 대체한다. */
export function PoseViewerPage() {
  const { jobId } = useParams<{ jobId: string }>();
  const navigate = useNavigate();
  const draft = useUploadStore((s) => s.draft);
  const setJobId = usePoseSelectionStore((s) => s.setJobId);
  const [rerunNotice, setRerunNotice] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [isConfirming, setIsConfirming] = useState(false);
  const bindings = useShortcutStore((s) => s.bindings);

  useEffect(() => {
    if (jobId) setJobId(jobId);
  }, [jobId, setJobId]);

  // 조회·파생은 바 모드와 공유한다(뷰만 다르다).
  const {
    data,
    isPending,
    isError,
    error,
    sourceFile,
    selectablePeople,
    failedPeople,
    selectedByPerson,
    selectedCount,
    allSelected,
    selectCandidate,
  } = useAnalysisResult(jobId);

  usePoseViewerShortcuts({
    canConfirm: allSelected,
    onConfirm: () => void confirmAndContinue(),
    onRerun: () => setRerunNotice(true),
  });

  if (!jobId) return <Navigate to="/app/home" replace />;

  async function confirmAndContinue() {
    if (!data || !allSelected || isConfirming) return;
    setIsConfirming(true);
    setConfirmError(null);
    try {
      await confirmSelections(
        data.jobId,
        Object.entries(selectedByPerson).map(([personIndex, candidateId]) => ({
          personIndex: Number(personIndex),
          candidateId,
        })),
      );
      navigate(`/app/jobs/${jobId}/save`);
    } catch {
      setConfirmError("선택 결과를 저장하지 못했습니다. 다시 시도해 주세요.");
    } finally {
      setIsConfirming(false);
    }
  }

  if (!sourceFile) {
    return (
      <AppShell title="포즈 후보">
        <div className="flex h-full flex-col items-center justify-center gap-4 text-text-secondary">
          <p>분석할 원본 이미지를 찾지 못했습니다. 다시 업로드해 주세요.</p>
          <Button variant="secondary" onClick={() => navigate("/app/home")}>
            홈으로 돌아가기
          </Button>
        </div>
      </AppShell>
    );
  }

  if (isPending) {
    return (
      <AppShell title="포즈 후보">
        <div className="flex h-full flex-col items-center justify-center gap-3 text-text-secondary">
          <Loader2 className="h-8 w-8 animate-spin" aria-hidden />
          <p>가까운 포즈 후보를 찾고 있습니다...</p>
        </div>
      </AppShell>
    );
  }

  if (isError || !data) {
    return (
      <AppShell title="포즈 후보">
        <div className="flex h-full flex-col items-center justify-center gap-4 text-text-secondary">
          <p>{error instanceof Error ? error.message : "후보를 불러오지 못했습니다."}</p>
          <Button variant="secondary" onClick={() => navigate("/app/home")}>
            홈으로 돌아가기
          </Button>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell title="포즈 후보">
      <div className="flex h-full flex-col gap-4">
        <div className="flex flex-col gap-2 rounded-xl border border-border bg-surface-0 p-4">
          <span className="text-[12px] font-semibold text-text-secondary">원본</span>
          <div className="flex max-h-[240px] items-center justify-center overflow-hidden rounded-lg bg-brand-paper">
            {draft ? (
              <img
                src={draft.previewUrl}
                alt={draft.originalName}
                className="max-h-[240px] max-w-full object-contain"
              />
            ) : (
              <p className="p-4 text-center text-[13px] text-text-secondary">
                원본 미리보기가 없습니다.
              </p>
            )}
          </div>
        </div>

        {data.people.map((person) => {
          if (person.candidates.length === 0) {
            return (
              <div
                key={person.index}
                className="flex items-center justify-between gap-3 rounded-xl border border-brand-coral/40 bg-brand-coral/10 p-4"
              >
                <span className="text-[13px] font-semibold text-text-primary">
                  인물 {person.index + 1}
                </span>
                <span className="flex items-center gap-2 text-[12px] font-semibold text-brand-coral">
                  <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
                  검색 실패 — 이 인물에 맞는 포즈 후보를 찾지 못했습니다.
                </span>
              </div>
            );
          }

          const selectedId = selectedByPerson[person.index];
          const selectedCandidate = person.candidates.find((c) => c.id === selectedId) ?? null;
          return (
            <div
              key={person.index}
              className="flex flex-col gap-3 rounded-xl border border-border bg-surface-0 p-4"
            >
              <div className="flex items-center justify-between">
                <span className="text-[13px] font-semibold text-text-primary">
                  인물 {person.index + 1}
                </span>
                <span className="text-[12px] text-text-secondary">
                  {selectedCandidate ? `선택됨: ${selectedCandidate.title}` : "후보를 선택하세요"}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                {person.candidates.map((candidate) => (
                  <PoseCandidateCard
                    key={candidate.id}
                    candidate={candidate}
                    isSelected={candidate.id === selectedId}
                    onSelect={() => selectCandidate(person.index, candidate.id)}
                  />
                ))}
              </div>
            </div>
          );
        })}

        {failedPeople.length > 0 && selectablePeople.length === 0 && (
          <p className="flex items-center gap-2 text-[13px] text-brand-coral">
            <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
            검출된 인물 전원의 포즈 검색에 실패했습니다. 다른 이미지로 다시 시도해 주세요.
          </p>
        )}

        <div className="flex items-center justify-between gap-4 border-t border-border pt-4">
          <div className="flex items-center gap-3">
            <Button variant="ghost" onClick={() => setRerunNotice(true)}>
              다른 후보 찾기
              <ShortcutKey
                accelerator={resolveAccelerator("poseViewer.rerun", bindings)!}
                className="ml-1"
              />
            </Button>
            {rerunNotice && (
              <p className="flex items-center gap-2 text-[12px] text-text-secondary">
                <Info className="h-4 w-4 shrink-0" aria-hidden />
                다시 검색은 후속 버전에서 서버와 연동됩니다.
              </p>
            )}
          </div>
          <Button
            size="lg"
            disabled={!allSelected || isConfirming}
            onClick={() => void confirmAndContinue()}
          >
            이 포즈 사용하기 ({selectedCount}/{selectablePeople.length})
            <ShortcutKey
              accelerator={resolveAccelerator("poseViewer.confirm", bindings)!}
              className="ml-1"
            />
          </Button>
        </div>
        {confirmError && <p className="text-[12px] text-brand-coral">{confirmError}</p>}
      </div>
    </AppShell>
  );
}
