import { journeyExit } from "@/features/analytics/featureJourney";
import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/shared/components/Button";
import { ShortcutKey } from "@/shared/components/ShortcutKey";
import { resolveAccelerator } from "@/shared/lib/shortcutRegistry";
import { useShortcutStore } from "@/shared/stores/shortcutStore";
import { SemanticSearchBar } from "@/features/semantic-search/SemanticSearchBar";
import { useExportStore } from "@/features/export/store/exportStore";
import { PoseSearchPending } from "@/features/pose-viewer/components/PoseSearchPending";
import { useAnalysisResult } from "@/features/pose-viewer/hooks/useAnalysisResult";
import { usePoseViewerShortcuts } from "@/features/pose-viewer/hooks/usePoseViewerShortcuts";
import { usePoseSelectionStore } from "@/features/pose-viewer/store/poseSelectionStore";
import { analysisFailure } from "@/features/pose-viewer/lib/analysisFailure";
import { confirmSelections } from "@/features/analytics/analyticsClient";
import { BarSearchBackButton } from "../components/BarSearchBackButton";
import { BarPersonCandidates } from "../components/BarPersonCandidates";
import { BarShell } from "../components/BarShell";
import { BAR_SIZES } from "../lib/barSizes";

/** 모든 인물을 한 목록에 표시한다. 내용 높이로 창을 맞추고 상한 이후는 셸에서 스크롤한다. */
export function BarCandidatesPage() {
  const navigate = useNavigate();
  const jobId = usePoseSelectionStore((s) => s.jobId);
  const bindings = useShortcutStore((s) => s.bindings);
  const [isConfirming, setIsConfirming] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const analysis = useAnalysisResult(jobId ?? undefined, true);
  const {
    data,
    bodies,
    isPending,
    isError,
    error,
    restoreOnly,
    refetch,
    draft,
    sourceFile,
    people,
    includedPeople,
    pendingPeople,
    selectedCount,
    allSelected,
    confirmedSelections,
  } = analysis;

  usePoseViewerShortcuts({ canConfirm: allSelected, onConfirm: () => void confirmAndContinue() });
  if (!jobId || (!restoreOnly && !sourceFile)) return <Navigate to="/bar/actions" replace />;

  async function confirmAndContinue() {
    if (!data || !allSelected || isConfirming) return;
    setIsConfirming(true);
    setConfirmError(null);
    try {
      await confirmSelections(data.jobId, confirmedSelections);
      // 앱 모드와 같은 순서다(ADR-010) — 저장 전에 조정 결과를 확인한다.
      if (bodies.enabled) useExportStore.getState().clearError();
      navigate("/bar/review");
    } catch {
      setConfirmError("선택을 저장하지 못했습니다. 다시 시도해 주세요.");
    } finally {
      setIsConfirming(false);
    }
  }

  const semantic = data?.source === "semantic";
  const resultWidth = people.some((person) =>
    person.candidates.some((candidate) => !candidate.manualExportAllowed),
  )
    ? 720
    : BAR_SIZES.candidates.width;
  const progressText =
    includedPeople.length === 0
      ? "저장할 인물을 한 명 이상 선택해 주세요"
      : pendingPeople.length > 0
        ? `포즈를 고를 인물: ${pendingPeople.map((p) => p.index + 1).join(", ")}`
        : `선택한 인물 ${includedPeople.length}명의 포즈를 모두 골랐어요`;
  const footer = (
    <div className="flex items-center justify-between gap-2 py-2">
      <div className="flex min-w-0 items-center gap-1.5">
        {semantic ? (
          <BarSearchBackButton query={data.semantic?.query ?? ""} />
        ) : (
          <Button
            variant="secondary"
            size="md"
            className="shrink-0"
            onClick={() => {
              journeyExit("pose_selection", "results", "home", data?.jobId);
              navigate("/bar/actions");
            }}
          >
            처음으로
          </Button>
        )}
        {!isPending &&
          !isError &&
          people.length > 0 &&
          (confirmError ? (
            <span
              role="alert"
              className="flex min-w-0 items-center gap-1 text-[11px] text-brand-coral"
            >
              <AlertTriangle className="h-3 w-3 shrink-0" aria-hidden />
              <span>{confirmError}</span>
            </span>
          ) : (
            <span className="text-[11px] text-text-secondary" aria-live="polite">
              {progressText}
            </span>
          ))}
      </div>
      {!isPending && !isError && people.length > 0 && (
        <Button
          size="md"
          data-body-next
          className="shrink-0"
          disabled={!allSelected || isConfirming}
          loading={isConfirming}
          onClick={() => void confirmAndContinue()}
        >
          이 포즈 사용
          <ShortcutKey accelerator={resolveAccelerator("poseViewer.confirm", bindings)!} />
        </Button>
      )}
    </div>
  );

  function scrollToPerson(index: number) {
    const section = document.getElementById(`bar-person-${index}`);
    section?.scrollIntoView({ block: "start", behavior: "smooth" });
    section?.focus({ preventScroll: true });
  }

  return (
    <BarShell
      title={
        isPending
          ? "포즈 검색 중"
          : semantic
            ? "문장 검색 결과"
            : `포즈 후보 ${selectedCount}/${includedPeople.length}`
      }
      preferredWidth={isPending || isError ? 360 : resultWidth}
      footer={footer}
    >
      <div data-semantic-results={semantic || undefined} className="flex flex-col gap-2 p-2">
        {isPending && (
          <PoseSearchPending preview={restoreOnly ? null : draft} restoring={restoreOnly} compact />
        )}
        {isError && (
          <div className="flex flex-col items-center justify-center gap-2 px-3 py-3 text-center">
            <p className="text-[12px] text-text-secondary">{analysisFailure(error).message}</p>
            {analysisFailure(error).retryable && (
              <Button
                size="md"
                onClick={() => {
                  if (restoreOnly) void refetch();
                  else navigate("/bar/progress", { replace: true });
                }}
              >
                다시 시도
              </Button>
            )}
          </div>
        )}
        {!isPending && !isError && data && (
          <>
            {semantic && (
              <div className="sticky top-0 z-10 border-b border-border bg-surface-0 p-2">
                <SemanticSearchBar
                  resultKey={data.jobId}
                  initialQuery={data.semantic?.query ?? ""}
                  surface="bar"
                />
              </div>
            )}
            {people.map((person) => (
              <BarPersonCandidates
                key={`${data.jobId}:${person.index}`}
                person={person}
                analysis={analysis}
                onPickPerson={scrollToPerson}
              />
            ))}
          </>
        )}
      </div>
    </BarShell>
  );
}
