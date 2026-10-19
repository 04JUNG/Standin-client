import { SemanticSearchBar } from "@/features/semantic-search/SemanticSearchBar";
import { PosePresentationPanel } from "@/features/pose-viewer/components/PosePresentationPanel";
import { ReferenceHands } from "@/features/hand-selection/ReferenceHands";
import { useExportStore } from "@/features/export/store/exportStore";
import {
  BodyCandidateCard,
  BodyChip,
  BodyExpand,
  BodyRenderStatus,
} from "@/features/body-selection/BodyCandidates";
import { useBodyPanel } from "@/features/body-selection/bodyPanel";
import { RoughPanel } from "@/features/pose-viewer/components/RoughPanel";
import { ExcludedOverlay, ExportSwitch } from "@/features/pose-viewer/components/ExportSwitch";
import { FitTile } from "@/features/pose-viewer/components/FitTile";
import type { PersonResult } from "@/features/pose-viewer/api/pose.contract";
import { useEffect, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { AlertTriangle, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/shared/lib/cn";
import { Button } from "@/shared/components/Button";
import { ShortcutKey } from "@/shared/components/ShortcutKey";
import { resolveAccelerator } from "@/shared/lib/shortcutRegistry";
import { useShortcutStore } from "@/shared/stores/shortcutStore";
import { PoseCandidateCard } from "@/features/pose-viewer/components/PoseCandidateCard";
import { PoseSearchPending } from "@/features/pose-viewer/components/PoseSearchPending";
import { PersonFallbackNotice } from "@/features/pose-viewer/components/PersonFallbackNotice";
import { useAnalysisResult } from "@/features/pose-viewer/hooks/useAnalysisResult";
import { usePoseViewerShortcuts } from "@/features/pose-viewer/hooks/usePoseViewerShortcuts";
import { usePoseSelectionStore } from "@/features/pose-viewer/store/poseSelectionStore";
import { analysisFailure } from "@/features/pose-viewer/lib/analysisFailure";
import { ModelSelect } from "@/features/models/components/ModelSelect";
import { BarShell } from "../components/BarShell";
import { confirmSelections } from "@/features/analytics/analyticsClient";

/**
 * 바 모드의 후보 확인(ADR-008). 앱 창에 들어가지 않고 작업 화면 위에서 후보를 고른다.
 *
 * 로직은 useAnalysisResult로 앱 모드와 공유하고 레이아웃만 다르다. 720px 폭에 여러
 * 인물을 한 번에 넣을 수 없어 인물은 스테퍼로 전환한다.
 *
 * 창은 720×560 그대로다(barSizes). 후보 칸은 [원본 | 후보 3+2]이고, 인물 줄의
 * "포즈 / 체형 더보기" 토글로 같은 자리가 체형 비교 줄과 조절 바로 바뀐다.
 * 하단에는 주 버튼 왼쪽에 "이전 인물"을 둔다.
 *
 * 선택을 끈 인물은 포즈를 고르지 않아도 되고, 확정 요청에도 들어가지 않는다.
 *
 * 앱이 후보를 자동 확정하지 않는 원칙은 바에서도 같다(CLAUDE.md §5 작가 선택 중심).
 */
export function BarCandidatesPage() {
  const navigate = useNavigate();
  const jobId = usePoseSelectionStore((s) => s.jobId);
  const jobCharacterId = usePoseSelectionStore((s) => s.characterId);
  const characterByPerson = usePoseSelectionStore((s) => s.characterByPerson);
  const setPersonCharacter = usePoseSelectionStore((s) => s.setPersonCharacter);
  const bindings = useShortcutStore((s) => s.bindings);
  const [personCursor, setPersonCursor] = useState(0);
  const [isConfirming, setIsConfirming] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);

  const {
    data,
    bodies,
    isPending,
    isError,
    error,
    restoreOnly,
    roughUrl,
    refetch,
    draft,
    sourceFile,
    people,
    includedPeople,
    pendingPeople,
    excludedPeople,
    setPersonIncluded,
    selectedByPerson,
    selectedCount,
    allSelected,
    confirmedSelections,
    selectCandidate,
  } = useAnalysisResult(jobId ?? undefined);

  // 인물 수가 줄어들면 커서를 범위 안으로 되돌린다.
  useEffect(() => {
    if (personCursor >= people.length && people.length > 0) setPersonCursor(0);
  }, [people.length, personCursor]);

  const person = people[personCursor];
  const gridCandidates = person?.candidates.filter((c) => !c.manualExportAllowed) ?? [];
  const panel = useBodyPanel(data?.jobId ?? "", person?.index ?? -1);
  const expanded =
    bodies.enabled &&
    panel.open &&
    (person?.candidates.length ?? 0) > 0 &&
    person?.fallbackMode !== "hard";

  usePoseViewerShortcuts({
    canConfirm: allSelected,
    onConfirm: () => void confirmAndContinue(),
  });

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

  if (data?.source === "semantic")
    return (
      <BarShell
        title="문장 검색 결과"
        footer={
          <div className="flex items-center justify-between gap-2 border-t border-border bg-surface-0 py-2">
            <p className="text-xs" aria-live="polite">
              포즈 선택 {selectedCount}/{includedPeople.length} · 저장 전 확인
            </p>
            <Button
              size="md"
              disabled={!allSelected || isConfirming}
              loading={isConfirming}
              onClick={() => void confirmAndContinue()}
            >
              이 포즈 사용
            </Button>
            {confirmError && (
              <p role="alert" className="text-xs text-brand-coral">
                {confirmError}
              </p>
            )}
          </div>
        }
      >
        <div data-semantic-results className="flex min-h-0 flex-1 flex-col gap-3 p-3">
          <div className="sticky top-0 z-10 border-b border-border bg-surface-0 p-2">
            <SemanticSearchBar
              resultKey={data.jobId}
              initialQuery={data.semantic?.query ?? ""}
              surface="bar"
            />
          </div>
          {data.people.map((p) => (
            <div key={p.index}>
              {p.posePresentation ? (
                <PosePresentationPanel
                  presentation={p.posePresentation}
                  bodyPreviewJob={
                    data.capabilities.bodyPreviews || data.capabilities.presentationBodyPreviews
                      ? data.jobId
                      : undefined
                  }
                  selection={{
                    candidates: p.candidates,
                    selected: selectedByPerson[p.index],
                    onSelect: (id) => selectCandidate(p.index, id),
                  }}
                  compact
                />
              ) : (
                <PersonFallbackNotice person={p} compact />
              )}
              <ReferenceHands result={data} personIndex={p.index} />
            </div>
          ))}
        </div>
      </BarShell>
    );

  const goToPerson = (p: PersonResult) => {
    const at = people.findIndex((x) => x.index === p.index);
    if (at >= 0) setPersonCursor(at);
  };
  const included = person ? !(person.index in excludedPeople) : false;
  const selectable = person ? person.fallbackMode !== "hard" : false;

  /** 주 버튼: 이 인물이 남았으면 막고, 다른 인물이 남았으면 그 인물로, 다 됐으면 확정. */
  let primary: JSX.Element;
  if (person && selectable && included && !selectedByPerson[person.index]) {
    primary = (
      <Button size="md" data-body-next disabled>
        이 포즈 사용
        <ShortcutKey accelerator={resolveAccelerator("poseViewer.confirm", bindings)!} />
      </Button>
    );
  } else if (pendingPeople.length > 0) {
    const next = pendingPeople[0];
    primary = (
      <Button size="md" data-body-next onClick={() => goToPerson(next)}>
        다음 인물로 · 인물 {next.index + 1}
      </Button>
    );
  } else {
    primary = (
      <Button
        size="md"
        data-body-next
        disabled={!allSelected || isConfirming}
        loading={isConfirming}
        onClick={() => void confirmAndContinue()}
      >
        {includedPeople.length === 0 ? "내보낼 인물이 없어요" : "이 포즈 사용"}
        {includedPeople.length > 0 && (
          <ShortcutKey accelerator={resolveAccelerator("poseViewer.confirm", bindings)!} />
        )}
      </Button>
    );
  }

  const progressText =
    includedPeople.length === 0
      ? "내보낼 인물이 없어요 · 한 명 이상 포함해 주세요"
      : pendingPeople.length > 0
        ? `포즈 안 고른 인물 ${pendingPeople.map((p) => p.index + 1).join(", ")} · 저장하지 않으려면 내보내기에서 제외하세요`
        : `내보낼 인물 ${includedPeople.length}명의 포즈를 모두 골랐어요`;

  const footer =
    !isPending && !isError && person ? (
      <div className="sticky bottom-0 z-10 flex shrink-0 items-center justify-between gap-2 border-t border-border bg-surface-0 py-2">
        <div className="flex min-w-0 items-center gap-1.5">
          {/* "다시 검색"이 있던 자리다. 서버 rerun이 없어 누르면 "지원하지 않는다"는
                    안내만 나왔다 — 없는 기능을 버튼으로 보여주지 않는다(CLAUDE.md §10).
                    대신 후보가 마음에 들지 않거나 전원 검색 실패일 때 빠져나갈 길을 둔다. */}
          <Button
            variant="ghost"
            size="md"
            className="shrink-0"
            onClick={() => navigate("/bar/actions")}
          >
            처음으로
          </Button>
          {confirmError ? (
            <span
              role="alert"
              className="flex min-w-0 items-center gap-1 text-[11px] text-brand-coral"
            >
              <AlertTriangle className="h-3 w-3 shrink-0" aria-hidden />
              <span className="truncate">{confirmError}</span>
            </span>
          ) : (
            <span className="truncate text-[11px] text-text-secondary" aria-live="polite">
              {progressText}
            </span>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {people.length > 1 && (
            <Button
              variant="secondary"
              size="md"
              data-body-prev
              disabled={personCursor === 0}
              onClick={() => setPersonCursor((i) => Math.max(0, i - 1))}
            >
              <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
              이전 인물
            </Button>
          )}
          {primary}
        </div>
      </div>
    ) : undefined;
  return (
    <BarShell
      title={isPending ? "포즈 검색 중" : `포즈 후보 ${selectedCount}/${includedPeople.length}`}
      footer={footer}
    >
      {/* 창(720×560)에서 제목 줄·하단 줄·테두리(92px)를 뺀 높이에 맞춘다. BarShell은 내용
          높이를 재서 창을 키우므로, 후보 칸이 내용만큼 늘어나면 창이 자라 버린다. */}
      <div
        className={cn(
          "flex flex-col gap-2 p-2",
          !isPending && !isError ? "h-[calc(100vh-92px)] min-h-[360px]" : "h-full",
        )}
      >
        {isPending && (
          <>
            <PoseSearchPending
              preview={restoreOnly ? null : draft}
              restoring={restoreOnly}
              compact
            />
            {/* 바에는 사이드바가 없다. 여기에 출구가 없으면 검색이 끝날 때까지 갇힌다.
                분석은 서버에서 계속되고 결과는 작업 기록에 남는다. */}
            <div className="flex shrink-0 items-center border-t border-border pt-2">
              <Button variant="ghost" size="md" onClick={() => navigate("/bar/actions")}>
                처음으로
              </Button>
            </div>
          </>
        )}

        {isError && (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 px-3 text-center">
            <p className="text-[12px] text-text-secondary">{analysisFailure(error).message}</p>
            {/* 기록은 같은 job 조회만, live 실패만 입력을 다시 분석한다. */}
            {analysisFailure(error).retryable ? (
              <Button
                size="md"
                onClick={() => {
                  if (restoreOnly) void refetch();
                  else navigate("/bar/progress", { replace: true });
                }}
              >
                다시 시도
              </Button>
            ) : (
              <Button variant="secondary" size="md" onClick={() => navigate("/bar/actions")}>
                처음으로
              </Button>
            )}
          </div>
        )}

        {!isPending && !isError && person && data && (
          <>
            {/* 인물 줄: [스테퍼 · 선택]  ···  [체형 칩]. 줄 자체는 한 명이어도 그린다. */}
            <div className="flex shrink-0 items-center justify-between gap-2 px-1">
              <div className="flex min-w-0 items-center gap-2">
                {people.length > 1 ? (
                  <div className="flex min-w-0 items-center gap-1.5">
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
                ) : (
                  <span className="text-[11px] font-semibold text-text-secondary">
                    {person.posePresentation && person.candidates.length === 0
                      ? "검수용 3D 미리보기"
                      : selectedByPerson[person.index]
                        ? "선택됨"
                        : "후보를 선택하세요"}
                  </span>
                )}
                {/* 후보가 없는 인물(hard)은 원래 내보낼 것이 없다. 스위치를 두지 않는다. */}
                {selectable && person.candidates.length > 0 && (
                  <ExportSwitch
                    personIndex={person.index}
                    included={included}
                    onChange={(value) => setPersonIncluded(person.index, value)}
                  />
                )}
              </div>
              {/* 인물마다 다른 체형이 필요할 수 있다(ADR-013 개정). 앱 모드와 같은
                  컴포넌트를 쓰고 제어 값만 이 인물의 것으로 준다.
                  ⚠ 후보가 없는 인물(hard fallback)에는 띄우지 않는다 — 저장될 포즈가
                  없는데 체형을 고르게 하면 고른 것이 어디에도 쓰이지 않는다. */}
              {selectable &&
                person.candidates.length > 0 &&
                (bodies.enabled ? (
                  <BodyChip
                    job={data.jobId}
                    person={person}
                    entry={bodies.entries.find((e) => e.personIndex === person.index)}
                    className="min-w-0"
                  />
                ) : (
                  <ModelSelect
                    variant="compact"
                    label={`인물 ${person.index + 1}의 모델`}
                    value={characterByPerson[person.index] ?? jobCharacterId}
                    onChange={(characterId) => setPersonCharacter(person.index, characterId)}
                  />
                ))}
            </div>

            {expanded ? (
              // 창 높이는 고정이다. 세부 조절을 펼쳐 넘치면 이 칸 안에서만 스크롤한다.
              <div className="min-h-0 flex-1 overflow-y-auto">
                <BodyExpand
                  job={data.jobId}
                  person={person}
                  entry={bodies.entries.find((e) => e.personIndex === person.index)}
                  rough={{ url: roughUrl, box: person.box }}
                  variant="bar"
                />
              </div>
            ) : (
              <>
                {bodies.enabled && (
                  <BodyRenderStatus
                    entry={bodies.entries.find((e) => e.personIndex === person.index)}
                  />
                )}
                <div className={cn("min-h-0 overflow-y-auto", person.posePresentation && "flex-1")}>
                  <PersonFallbackNotice
                    bodyPreviewJob={
                      (!bodies.enabled || !person.candidates.length) &&
                      data?.capabilities.presentationBodyPreviews
                        ? data.jobId
                        : undefined
                    }
                    person={person}
                    selection={{
                      candidates: person.candidates,
                      selected: selectedByPerson[person.index],
                      onSelect: (id) => selectCandidate(person.index, id),
                      disabled: !included,
                      hiddenCandidateIds: gridCandidates.map((c) => c.id),
                    }}
                    compact
                  />
                  {person.posePresentation && (
                    <ReferenceHands result={data} personIndex={person.index} />
                  )}
                </div>
                {/* 후보 칸: [원본 | 후보]. 원본과 포즈를 나란히 놓고 비교한다. */}
                {/* 3×2: 원본이 첫 칸, 후보 5개가 나머지 칸. 모든 칸이 같은 크기·비율이라
                    원본과 포즈를 같은 눈높이로 비교하고, 빈 칸이나 홀로 남는 줄이 없다. */}
                {/* 후보 칸: [원본 | 후보 3 + 2]. 카드는 모두 같은 비율·크기이고 아래 두 장은
                    가운데에 둔다. 창이 커져도 카드가 찌그러지지 않는다(FitTile). */}
                {gridCandidates.length > 0 && (
                  <div className="grid min-h-0 flex-1 grid-cols-[minmax(180px,26%)_minmax(0,1fr)] gap-2">
                    <RoughPanel
                      url={roughUrl}
                      people={people}
                      person={person}
                      excluded={excludedPeople}
                      onPick={(index) => {
                        const target = people.find((p) => p.index === index);
                        if (target) goToPerson(target);
                      }}
                    />
                    {person.fallbackMode === "hard" ? (
                      <div className="flex items-center justify-center px-3">
                        <PersonFallbackNotice
                          bodyPreviewJob={
                            (!bodies.enabled || !person.candidates.length) &&
                            data?.capabilities.presentationBodyPreviews
                              ? data.jobId
                              : undefined
                          }
                          person={person}
                          compact
                        />
                        {person.posePresentation && (
                          <ReferenceHands result={data} personIndex={person.index} />
                        )}
                      </div>
                    ) : (
                      <div className="relative min-h-0">
                        <div
                          className={cn(
                            "grid h-full min-h-0 grid-cols-6 grid-rows-2 gap-1.5",
                            !included && "pointer-events-none opacity-40 grayscale",
                          )}
                        >
                          {gridCandidates.map((candidate, i) => (
                            <FitTile key={candidate.id} className={candidateSpan(i)}>
                              {bodies.enabled ? (
                                <BodyCandidateCard
                                  job={data.jobId}
                                  candidate={candidate}
                                  entry={bodies.entries.find((e) => e.personIndex === person.index)}
                                  selected={selectedByPerson[person.index]}
                                  onSelect={(id) => selectCandidate(person.index, id)}
                                  disabled={!included}
                                />
                              ) : (
                                <PoseCandidateCard
                                  candidate={candidate}
                                  characterId={characterByPerson[person.index] ?? jobCharacterId}
                                  isSelected={candidate.id === selectedByPerson[person.index]}
                                  onSelect={() => selectCandidate(person.index, candidate.id)}
                                  layout="fill"
                                  disabled={!included}
                                />
                              )}
                            </FitTile>
                          ))}
                        </div>
                        {!included && (
                          <ExcludedOverlay
                            compact
                            onInclude={() => setPersonIncluded(person.index, true)}
                          />
                        )}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>
    </BarShell>
  );
}

/** 3 + 2 배치. 위 세 장은 차례로, 아래 두 장은 가운데로 모은다(6칸 그리드에서 2칸씩). */
function candidateSpan(i: number) {
  return i === 3 ? "col-span-2 col-start-2" : "col-span-2";
}

const stepperClass = cn(
  "flex h-6 w-6 items-center justify-center rounded transition-colors",
  "text-text-secondary hover:bg-surface-2 hover:text-text-primary",
  "disabled:cursor-not-allowed disabled:opacity-40",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-sky",
);
