import { useEffect, useRef, useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { AlertTriangle, Info, Loader2 } from "lucide-react";
import { AppShell } from "@/shared/components/AppShell";
import { Button } from "@/shared/components/Button";
import { useUploadStore } from "@/features/upload/store/uploadStore";
import { useAnalysisResult } from "../hooks/useAnalysisResult";
import { ShortcutKey } from "@/shared/components/ShortcutKey";
import { resolveAccelerator } from "@/shared/lib/shortcutRegistry";
import { useShortcutStore } from "@/shared/stores/shortcutStore";
import { tourAnchor } from "@/shared/lib/tourAnchor";
import { usePoseSelectionStore } from "../store/poseSelectionStore";
import { usePoseViewerShortcuts } from "../hooks/usePoseViewerShortcuts";
import { PoseCandidateCard } from "../components/PoseCandidateCard";
import { PersonFallbackNotice } from "../components/PersonFallbackNotice";
import { analysisFailure } from "../lib/analysisFailure";
import { confirmSelections, trackRerunRequested } from "@/features/analytics/analyticsClient";
import { useJobSelections } from "@/features/history/hooks/useJobSelections";

/** 포즈 후보 뷰어(docs/03 §7). 진행률 화면 없이 로딩 상태로 대체한다. */
export function PoseViewerPage() {
  const { jobId } = useParams<{ jobId: string }>();
  const navigate = useNavigate();
  const draft = useUploadStore((s) => s.draft);
  const setJobId = usePoseSelectionStore((s) => s.setJobId);
  const restoreSelections = usePoseSelectionStore((s) => s.restoreSelections);
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
    restoreOnly,
    sourceFile,
    selectablePeople,
    failedPeople,
    selectedByPerson,
    selectedCount,
    allSelected,
    selectCandidate,
  } = useAnalysisResult(jobId);

  // 기록에서 열었으면 그때 확정했던 선택을 되살린다.
  //
  // 결과가 도착한 **뒤에** 실행해야 한다. setJobId와 setServerJobId가 각각 선택을
  // 초기화하므로, 그 전에 넣으면 곧바로 지워진다. 한 번만 적용해서 사용자가 복원 뒤에
  // 바꾼 선택을 재마운트가 되돌리지 않게 한다.
  const { data: savedSelections } = useJobSelections(restoreOnly ? jobId : undefined);
  const restored = useRef(false);
  useEffect(() => {
    if (!data || !jobId || !savedSelections?.length || restored.current) return;
    restored.current = true;
    restoreSelections(
      jobId,
      Object.fromEntries(savedSelections.map((s) => [s.personIndex, s.candidateId])),
    );
  }, [data, jobId, savedSelections, restoreSelections]);

  usePoseViewerShortcuts({
    canConfirm: allSelected,
    onConfirm: () => void confirmAndContinue(),
    onRerun: requestRerun,
  });

  if (!jobId) return <Navigate to="/app/home" replace />;

  function requestRerun() {
    setRerunNotice(true);
    trackRerunRequested(data?.jobId, {
      selectedCount,
      peopleCount: selectablePeople.length,
    });
  }

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
      // 저장 화면은 진입 즉시 자동 저장한다(ADR-009). 사용자가 고른 포즈와 실제 저장되는
      // 포즈가 달라질 수 있으므로 확인 단계를 사이에 둔다(ADR-010).
      navigate(`/app/jobs/${jobId}/review`);
    } catch {
      setConfirmError("선택 결과를 저장하지 못했습니다. 다시 시도해 주세요.");
    } finally {
      setIsConfirming(false);
    }
  }

  // 기록에서 연 작업은 원본 파일이 없는 것이 정상이다 — 서버에 저장된 결과를 읽는다.
  if (!sourceFile && !restoreOnly) {
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
        <div
          {...tourAnchor("jobs.pending")}
          className="flex h-full flex-col items-center justify-center gap-3 text-text-secondary"
        >
          <Loader2 className="h-8 w-8 animate-spin" aria-hidden />
          <p>가까운 포즈 후보를 찾고 있습니다...</p>
        </div>
      </AppShell>
    );
  }

  if (isError || !data) {
    const failure = analysisFailure(error);
    return (
      <AppShell title="포즈 후보">
        <div
          {...tourAnchor("jobs.error")}
          className="flex h-full flex-col items-center justify-center gap-4 text-text-secondary"
        >
          <p>{failure.message}</p>
          <div className="flex items-center gap-2">
            {/* 같은 입력으로 다시 분석한다. 새 화면 job이라 서버 Job도 새로 만들어진다 —
                앞선 Job은 이미 끝났으므로 동시 분석 한도에 걸리지 않는다. */}
            {failure.retryable && (
              <Button
                onClick={() => navigate(`/app/jobs/${crypto.randomUUID()}`, { replace: true })}
              >
                다시 시도
              </Button>
            )}
            <Button variant="secondary" onClick={() => navigate("/app/home")}>
              홈으로 돌아가기
            </Button>
          </div>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell title="포즈 후보">
      <div className="flex h-full flex-col gap-4">
        {restoreOnly && (
          <div className="flex items-start gap-2 rounded-xl border border-brand-sky/40 bg-brand-sky/10 p-3">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-brand-sky" aria-hidden />
            <p className="text-[13px] text-text-primary">
              이전 분석 결과입니다. 다른 후보를 고르면 포즈 파일을 다시 저장할 수 있습니다.
            </p>
          </div>
        )}
        <div className="flex flex-col gap-2 rounded-xl border border-border bg-surface-0 p-4">
          <span className="text-[12px] font-semibold text-text-secondary">원본</span>
          <div className="flex max-h-[240px] items-center justify-center overflow-hidden rounded-lg bg-brand-paper">
            {draft ? (
              <img
                src={draft.previewUrl}
                alt={draft.originalName}
                className="max-h-[240px] max-w-full object-contain"
              />
            ) : data.inputPreviewUrl ? (
              // 기록에서 열었을 때의 원본. 서버가 준 presigned URL이라 인증 헤더가 필요 없다.
              <img
                src={data.inputPreviewUrl}
                alt="분석에 사용한 원본"
                className="max-h-[240px] max-w-full object-contain"
              />
            ) : (
              <p className="p-4 text-center text-[13px] text-text-secondary">
                {restoreOnly
                  ? "원본 이미지는 보관 기간(90일)이 지나 제공되지 않습니다."
                  : "원본 미리보기가 없습니다."}
              </p>
            )}
          </div>
        </div>

        {data.people.map((person) => {
          // hard fallback — 이 인물만 후보가 없다. 다른 인물의 흐름은 계속 진행한다.
          if (person.fallbackMode === "hard") {
            return (
              <div
                key={person.index}
                className="flex flex-col gap-2 rounded-xl border border-brand-coral/40 bg-surface-0 p-4"
              >
                <span className="text-[13px] font-semibold text-text-primary">
                  인물 {person.index + 1}
                </span>
                <PersonFallbackNotice person={person} />
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
              {/* soft fallback — 후보는 계속 보여주되 참고용임을 알린다. */}
              <PersonFallbackNotice person={person} />
              <div
                {...tourAnchor("jobs.candidates")}
                className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5"
              >
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
            <Button variant="ghost" onClick={requestRerun}>
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
            {...tourAnchor("jobs.confirm")}
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
