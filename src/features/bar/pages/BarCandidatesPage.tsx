import { useEffect, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { AlertTriangle, ChevronLeft, ChevronRight, Info, Loader2 } from "lucide-react";
import { cn } from "@/shared/lib/cn";
import { Button } from "@/shared/components/Button";
import { ShortcutKey } from "@/shared/components/ShortcutKey";
import { resolveAccelerator } from "@/shared/lib/shortcutRegistry";
import { useShortcutStore } from "@/shared/stores/shortcutStore";
import { PoseCandidateCard } from "@/features/pose-viewer/components/PoseCandidateCard";
import { PersonFallbackNotice } from "@/features/pose-viewer/components/PersonFallbackNotice";
import { useAnalysisResult } from "@/features/pose-viewer/hooks/useAnalysisResult";
import { usePoseViewerShortcuts } from "@/features/pose-viewer/hooks/usePoseViewerShortcuts";
import { usePoseSelectionStore } from "@/features/pose-viewer/store/poseSelectionStore";
import { BarShell } from "../components/BarShell";
import { confirmSelections, trackRerunRequested } from "@/features/analytics/analyticsClient";
import { messageOf } from "@/shared/api/errors";

/**
 * 바 모드의 후보 확인(ADR-008). 앱 창에 들어가지 않고 작업 화면 위에서 후보를 고른다.
 *
 * 로직은 useAnalysisResult로 앱 모드와 공유하고 레이아웃만 다르다. 720px 폭에 여러
 * 인물을 한 번에 넣을 수 없어 인물은 스테퍼로 전환한다.
 *
 * 앱이 후보를 자동 확정하지 않는 원칙은 바에서도 같다(CLAUDE.md §5 작가 선택 중심).
 */
export function BarCandidatesPage() {
  const navigate = useNavigate();
  const jobId = usePoseSelectionStore((s) => s.jobId);
  const bindings = useShortcutStore((s) => s.bindings);
  const [personCursor, setPersonCursor] = useState(0);
  const [rerunNotice, setRerunNotice] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);

  const {
    data,
    isPending,
    isError,
    error,
    draft,
    sourceFile,
    people,
    selectablePeople,
    selectedByPerson,
    selectedCount,
    allSelected,
    selectCandidate,
  } = useAnalysisResult(jobId ?? undefined);

  // 인물 수가 줄어들면 커서를 범위 안으로 되돌린다.
  useEffect(() => {
    if (personCursor >= people.length && people.length > 0) setPersonCursor(0);
  }, [people.length, personCursor]);

  usePoseViewerShortcuts({
    canConfirm: allSelected,
    onConfirm: () => void confirmAndContinue(),
    onRerun: requestRerun,
  });

  if (!jobId || !draft || !sourceFile) return <Navigate to="/bar/actions" replace />;

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
      // 앱 모드와 같은 순서다(ADR-010) — 저장 전에 조정 결과를 확인한다.
      navigate("/bar/review");
    } catch {
      setConfirmError("선택을 저장하지 못했습니다. 다시 시도해 주세요.");
    } finally {
      setIsConfirming(false);
    }
  }

  const person = people[personCursor];

  return (
    <BarShell title={`포즈 후보 ${selectedCount}/${selectablePeople.length}`}>
      <div className="flex h-full flex-col gap-2 p-2">
        {isPending && (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 text-text-secondary">
            <Loader2 className="h-6 w-6 animate-spin" aria-hidden />
            <p className="text-[12px]">가까운 포즈 후보를 찾고 있습니다…</p>
          </div>
        )}

        {isError && (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 px-3 text-center">
            <p className="text-[12px] text-text-secondary">
              {messageOf(error, "후보를 불러오지 못했습니다.")}
            </p>
            <Button variant="secondary" size="md" onClick={() => navigate("/bar/actions")}>
              다시 시도
            </Button>
          </div>
        )}

        {!isPending && !isError && person && (
          <>
            {people.length > 1 && (
              <div className="flex shrink-0 items-center justify-between px-1">
                <button
                  type="button"
                  aria-label="이전 인물"
                  disabled={personCursor === 0}
                  onClick={() => setPersonCursor((i) => Math.max(0, i - 1))}
                  className={stepperClass}
                >
                  <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
                </button>
                <span className="text-[11px] font-semibold text-text-secondary">
                  인물 {personCursor + 1} / {people.length}
                  {selectedByPerson[person.index] && " · 선택됨"}
                </span>
                <button
                  type="button"
                  aria-label="다음 인물"
                  disabled={personCursor >= people.length - 1}
                  onClick={() => setPersonCursor((i) => Math.min(people.length - 1, i + 1))}
                  className={stepperClass}
                >
                  <ChevronRight className="h-3.5 w-3.5" aria-hidden />
                </button>
              </div>
            )}

            {person.fallbackMode === "hard" ? (
              <div className="flex flex-1 items-center justify-center px-3">
                <PersonFallbackNotice person={person} compact />
              </div>
            ) : (
              // 좁은 폭이라 가로 스트립으로 훑는다.
              <div className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto">
                {/* soft fallback 안내는 앱 모드와 같은 컴포넌트를 쓴다 — 표면마다 경고가
                    달라지면 같은 결과를 다르게 판단하게 된다. */}
                <PersonFallbackNotice person={person} compact />
                <div className="grid grid-cols-5 gap-1.5">
                  {person.candidates.map((candidate) => (
                    <PoseCandidateCard
                      key={candidate.id}
                      candidate={candidate}
                      isSelected={candidate.id === selectedByPerson[person.index]}
                      onSelect={() => selectCandidate(person.index, candidate.id)}
                    />
                  ))}
                </div>
              </div>
            )}

            <div className="flex shrink-0 items-center justify-between gap-2 border-t border-border pt-2">
              <div className="flex min-w-0 items-center gap-1.5">
                <Button variant="ghost" size="md" onClick={requestRerun}>
                  다시 검색
                  <ShortcutKey accelerator={resolveAccelerator("poseViewer.rerun", bindings)!} />
                </Button>
                {rerunNotice && (
                  <span className="flex min-w-0 items-center gap-1 text-[11px] text-text-secondary">
                    <Info className="h-3 w-3 shrink-0" aria-hidden />
                    <span className="truncate">후속 버전에서 서버와 연동됩니다.</span>
                  </span>
                )}
                {confirmError && (
                  <span
                    role="alert"
                    className="flex min-w-0 items-center gap-1 text-[11px] text-brand-coral"
                  >
                    <AlertTriangle className="h-3 w-3 shrink-0" aria-hidden />
                    <span className="truncate">{confirmError}</span>
                  </span>
                )}
              </div>
              <Button
                size="md"
                disabled={!allSelected || isConfirming}
                onClick={() => void confirmAndContinue()}
              >
                이 포즈 사용
                <ShortcutKey accelerator={resolveAccelerator("poseViewer.confirm", bindings)!} />
              </Button>
            </div>
          </>
        )}
      </div>
    </BarShell>
  );
}

const stepperClass = cn(
  "flex h-6 w-6 items-center justify-center rounded transition-colors",
  "text-text-secondary hover:bg-surface-2 hover:text-text-primary",
  "disabled:cursor-not-allowed disabled:opacity-40",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-sky",
);
