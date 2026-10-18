import { SemanticModelPresentation } from "@/features/semantic-search/SemanticModelPresentation";
import { ReferenceHands } from "@/features/hand-selection/ReferenceHands";
import { useExportStore } from "@/features/export/store/exportStore";
import {
  BodyCandidateCards,
  BodyChip,
  BodyExpand,
  BodyLabel,
  BodyRenderStatus,
} from "@/features/body-selection/BodyCandidates";
import { useBodyPanel } from "@/features/body-selection/bodyPanel";
import { cn } from "@/shared/lib/cn";
import type { PersonResult } from "../api/pose.contract";
import { RoughOverview, RoughPanel, RoughThumb } from "../components/RoughPanel";
import { ExcludedOverlay, ExportSwitch } from "../components/ExportSwitch";
import { CandidateRerunTile } from "../components/CandidateRerun";
import { useCandidateRerun } from "../hooks/useCandidateRerun";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { BodyEntry } from "@/features/body-selection/hooks";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { AlertTriangle, ChevronLeft, ChevronRight, Info, RotateCw } from "lucide-react";
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
import { PoseSearchPending } from "../components/PoseSearchPending";
import { PersonFallbackNotice } from "../components/PersonFallbackNotice";
import { analysisFailure } from "../lib/analysisFailure";
import { confirmSelections } from "@/features/analytics/analyticsClient";
import { useJobSelections } from "@/features/history/hooks/useJobSelections";
import { ModelSelect } from "@/features/models/components/ModelSelect";

/** 포즈 후보 뷰어(docs/03 §7). 진행률 화면 없이 로딩 상태로 대체한다. */
export function PoseViewerPage() {
  const { jobId } = useParams<{ jobId: string }>();
  const navigate = useNavigate();
  const draft = useUploadStore((s) => s.draft);
  const setJobId = usePoseSelectionStore((s) => s.setJobId);
  const restoreSelections = usePoseSelectionStore((s) => s.restoreSelections);
  const jobCharacterId = usePoseSelectionStore((s) => s.characterId);
  const characterByPerson = usePoseSelectionStore((s) => s.characterByPerson);
  const setPersonCharacter = usePoseSelectionStore((s) => s.setPersonCharacter);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [isConfirming, setIsConfirming] = useState(false);
  /** 펼친 인물(서버 index). 나머지는 한 줄로 접는다. */
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const bindings = useShortcutStore((s) => s.bindings);

  useEffect(() => {
    if (jobId) setJobId(jobId);
  }, [jobId, setJobId]);

  // 조회·파생은 바 모드와 공유한다(뷰만 다르다).
  const {
    data,
    bodies,
    isPending,
    isError,
    error,
    restoreOnly,
    sourceFile,
    selectablePeople,
    includedPeople,
    pendingPeople,
    excludedPeople,
    setPersonIncluded,
    failedPeople,
    selectedByPerson,
    selectedCount,
    allSelected,
    confirmedSelections,
    selectCandidate,
  } = useAnalysisResult(jobId);

  const people = data?.people ?? [];
  const active =
    people.find((p) => p.index === activeIndex) ??
    people.find((p) => p.fallbackMode !== "hard") ??
    people[0];
  const panel = useBodyPanel(data?.jobId ?? "", active?.index ?? -1);
  const expanded = bodies.enabled && panel.open && active?.fallbackMode !== "hard";
  const onRerun = useCandidateRerun(data, active);

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
  });

  if (!jobId) return <Navigate to="/app/home" replace />;

  async function confirmAndContinue() {
    if (!data || !allSelected || isConfirming) return;
    setIsConfirming(true);
    setConfirmError(null);
    try {
      // 선택을 끈 인물은 싣지 않는다. 서버는 이 목록으로 확정 집합을 대체한다.
      await confirmSelections(data.jobId, confirmedSelections);
      // 저장 화면은 진입 즉시 자동 저장한다(ADR-009). 사용자가 고른 포즈와 실제 저장되는
      // 포즈가 달라질 수 있으므로 확인 단계를 사이에 둔다(ADR-010).
      if (bodies.enabled) useExportStore.getState().clearError();
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
          className="flex min-h-full flex-col items-center justify-center gap-4"
        >
          <PoseSearchPending preview={restoreOnly ? null : draft} restoring={restoreOnly} />
          {/* 분석은 서버에서 계속 진행되고 결과는 작업 기록에서 다시 열 수 있다.
              기다리는 것 말고 할 수 있는 일이 없는 화면을 만들지 않는다. */}
          <Button variant="secondary" onClick={() => navigate("/app/home")}>
            홈으로 돌아가기
          </Button>
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

  if (data.source === "semantic")
    return (
      <AppShell title="문장 검색 결과">
        <div className="flex flex-col gap-4 p-4">
          <section className="rounded-xl border border-border bg-surface-0 p-4">
            <h2 className="text-sm font-semibold">검색 문장</h2>
            <p className="whitespace-pre-wrap break-words">{data.semantic?.query}</p>
            <Button
              variant="ghost"
              onClick={() => navigate("/app/search", { state: { query: data.semantic?.query } })}
            >
              문장 바꿔 검색하기
            </Button>
          </section>
          {data.people.map((person) => (
            <div key={person.index} className="flex flex-col gap-3">
              {person.posePresentation ? (
                <SemanticModelPresentation presentation={person.posePresentation} bodyContext={data.capabilities.semanticBodySelection ? {jobId:data.jobId,person} : undefined} />
              ) : (
                <PersonFallbackNotice person={person} />
              )}
              <ReferenceHands result={data} personIndex={person.index} />
            </div>
          ))}
        </div>
      </AppShell>
    );

  const roughUrl = draft?.previewUrl ?? data.inputPreviewUrl;
  const pick = (index: number) => setActiveIndex(index);
  const progressText =
    includedPeople.length === 0
      ? "선택한 인물이 없어요 · 한 명 이상 선택해 주세요"
      : pendingPeople.length > 0
        ? `포즈 안 고른 인물 ${pendingPeople.map((p) => p.index + 1).join(", ")} · 필요 없으면 선택을 끄세요`
        : `선택한 인물 ${includedPeople.length}명 모두 골랐어요`;
  const activeNeedsPick =
    !!active &&
    active.fallbackMode !== "hard" &&
    !(active.index in excludedPeople) &&
    !selectedByPerson[active.index];
  const nextPending = !activeNeedsPick ? pendingPeople[0] : undefined;
  // 이전 인물: 인물 순서에서 지금 펼친 인물 바로 앞. 맨 앞이면 버튼을 끈다.
  const activeAt = active ? people.findIndex((p) => p.index === active.index) : -1;
  const prevPerson = activeAt > 0 ? people[activeAt - 1] : undefined;

  return (
    <AppShell title="포즈 후보">
      <div className="flex h-full flex-col gap-3">
        {restoreOnly && (
          <div className="flex items-start gap-2 rounded-xl border border-brand-sky/40 bg-brand-sky/10 p-3">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-brand-sky" aria-hidden />
            <p className="text-[13px] text-text-primary">
              이전 분석 결과입니다. 다른 후보를 고르면 포즈 파일을 다시 저장할 수 있습니다.
            </p>
          </div>
        )}

        {/* 원본: 인물 상자를 함께 그린다. 상자를 누르면 그 인물이 펼쳐진다. */}
        <div className="flex items-center gap-4 rounded-xl border border-border bg-surface-0 p-3">
          <div className="flex h-[150px] w-[220px] shrink-0 items-center justify-center overflow-hidden rounded-lg border border-surface-2 bg-white">
            {roughUrl ? (
              <RoughOverview
                url={roughUrl}
                people={people}
                current={active?.index}
                excluded={excludedPeople}
                onPick={pick}
                className="h-full w-full"
              />
            ) : (
              <p className="p-3 text-center text-[12px] text-text-secondary">
                {restoreOnly
                  ? "원본 이미지는 보관 기간(90일)이 지나 제공되지 않습니다."
                  : "원본 미리보기가 없습니다."}
              </p>
            )}
          </div>
          <div className="flex min-w-0 flex-col gap-1">
            <span className="text-[13px] font-semibold text-text-primary">
              원본 · 인물 {people.length}명을 찾았어요
            </span>
            <p className="text-[12.5px] text-text-secondary">
              상자나 아래 인물 줄을 누르면 그 인물의 후보로 넘어가요. 필요 없는 인물은{" "}
              <b className="text-text-primary">선택</b>을 끄면 포즈를 고르지 않아도 진행할 수
              있어요.
            </p>
            <p className="text-[12.5px] text-text-secondary">
              선택한 인물 <b className="text-text-primary">{includedPeople.length}명</b> · 포즈 고름{" "}
              <b className="text-text-primary">{selectedCount}</b>
            </p>
          </div>
        </div>

        {active && (
          <ActivePersonCard
            key={active.index}
            jobId={data.jobId}
            person={active}
            people={people}
            roughUrl={roughUrl}
            bodiesEnabled={bodies.enabled}
            entry={bodies.entries.find((e) => e.personIndex === active.index)}
            expanded={expanded}
            excluded={excludedPeople}
            included={!(active.index in excludedPeople)}
            onIncluded={(value) => setPersonIncluded(active.index, value)}
            selectedId={selectedByPerson[active.index]}
            onSelect={(id) => selectCandidate(active.index, id)}
            onPick={pick}
            onRerun={onRerun}
            modelSelect={
              <ModelSelect
                variant="compact"
                label={`인물 ${active.index + 1}의 모델`}
                value={characterByPerson[active.index] ?? jobCharacterId}
                onChange={(characterId) => setPersonCharacter(active.index, characterId)}
              />
            }
            characterId={characterByPerson[active.index] ?? jobCharacterId}
          />
        )}

        {active?.posePresentation && <ReferenceHands result={data} personIndex={active.index} />}

        {people.length > 1 && (
          <div className="rounded-xl border border-border bg-surface-0 px-4 py-1.5">
            {expanded ? (
              <p className="py-1.5 text-[12px] text-text-secondary">
                다른 인물 {people.length - 1}명 · 포즈로 돌아가면 다시 보여요
              </p>
            ) : (
              people
                .filter((p) => p.index !== active?.index)
                .map((p, i) => (
                  <OtherPersonRow
                    key={p.index}
                    first={i === 0}
                    jobId={data.jobId}
                    person={p}
                    roughUrl={roughUrl}
                    bodiesEnabled={bodies.enabled}
                    entry={bodies.entries.find((e) => e.personIndex === p.index)}
                    included={!(p.index in excludedPeople)}
                    onIncluded={(value) => setPersonIncluded(p.index, value)}
                    selectedTitle={
                      p.candidates.find((c) => c.id === selectedByPerson[p.index])?.title
                    }
                    onOpen={() => pick(p.index)}
                  />
                ))
            )}
          </div>
        )}

        {failedPeople.length > 0 && selectablePeople.length === 0 && (
          <p className="flex items-center gap-2 text-[13px] text-brand-coral">
            <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />이 장면에는 사용할 수 있는
            자동 포즈 후보가 없습니다. 인물별 안내를 확인해 주세요.
          </p>
        )}

        <div className="flex items-center justify-between gap-4 border-t border-border pt-3">
          {/* "다른 후보 찾기"가 있던 자리다. 서버 rerun이 없어 누르면 "지원하지 않는다"는
              안내만 나왔다 — 없는 기능을 버튼으로 보여주지 않는다(CLAUDE.md §10).
              대신 후보가 마음에 들지 않거나 전원 검색 실패일 때 빠져나갈 길을 둔다. */}
          <div className="flex min-w-0 items-center gap-3">
            <Button variant="ghost" onClick={() => navigate("/app/home")}>
              홈으로 돌아가기
            </Button>
            <span className="truncate text-[12px] text-text-secondary" aria-live="polite">
              {progressText}
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {people.length > 1 && (
              <Button
                variant="secondary"
                size="lg"
                data-body-prev
                disabled={!prevPerson}
                onClick={() => prevPerson && pick(prevPerson.index)}
              >
                <ChevronLeft className="h-4 w-4" aria-hidden />
                이전 인물{prevPerson ? ` · 인물 ${prevPerson.index + 1}` : ""}
              </Button>
            )}
            {nextPending ? (
              <Button data-body-next size="lg" onClick={() => pick(nextPending.index)}>
                다음 인물로 · 인물 {nextPending.index + 1}
              </Button>
            ) : (
              <Button
                data-body-next
                {...tourAnchor("jobs.confirm")}
                size="lg"
                disabled={!allSelected || isConfirming}
                loading={isConfirming}
                onClick={() => void confirmAndContinue()}
              >
                이 포즈 사용하기 ({selectedCount}/{includedPeople.length})
                <ShortcutKey
                  accelerator={resolveAccelerator("poseViewer.confirm", bindings)!}
                  className="ml-1"
                />
              </Button>
            )}
          </div>
        </div>
        {confirmError && <p className="text-[12px] text-brand-coral">{confirmError}</p>}
      </div>
    </AppShell>
  );
}

/** 펼친 인물 카드: [원본 | 후보 5개], 또는 체형 더보기를 열면 비교 줄과 조절 바. */
function ActivePersonCard({
  jobId,
  person,
  people,
  roughUrl,
  bodiesEnabled,
  entry,
  expanded,
  excluded,
  included,
  onIncluded,
  selectedId,
  onSelect,
  onPick,
  onRerun,
  modelSelect,
  characterId,
}: {
  jobId: string;
  person: PersonResult;
  people: PersonResult[];
  roughUrl?: string;
  bodiesEnabled: boolean;
  entry?: BodyEntry;
  expanded: boolean;
  excluded: Readonly<Record<number, unknown>>;
  included: boolean;
  onIncluded(value: boolean): void;
  selectedId?: string;
  onSelect(id: string): void;
  onPick(index: number): void;
  onRerun: (() => void) | null;
  modelSelect: ReactNode;
  characterId: string | null;
}) {
  const hard = person.fallbackMode === "hard";
  const selectedCandidate = person.candidates.find((c) => c.id === selectedId) ?? null;
  return (
    <div
      className={cn(
        "flex min-w-0 flex-col gap-3 rounded-xl border bg-surface-0 p-4",
        hard ? "border-brand-coral/40" : "border-border",
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-2.5">
          {!hard && !person.posePresentation && (
            <ExportSwitch personIndex={person.index} included={included} onChange={onIncluded} />
          )}
          <span className="text-[13px] font-semibold text-text-primary">
            인물 {person.index + 1}
          </span>
          {/* 인물마다 다른 체형이 필요할 수 있다(ADR-013 개정). 고르지 않으면
              이 작업의 기본 체형으로 저장된다. */}
          {!hard &&
            !person.posePresentation &&
            (bodiesEnabled ? <BodyChip job={jobId} person={person} entry={entry} /> : modelSelect)}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[12px] text-text-secondary">
            {person.posePresentation
              ? "검수용 3D 미리보기"
              : hard
                ? "후보 없음"
                : !included
                  ? "선택 안 함"
                  : selectedCandidate
                    ? `선택됨: ${selectedCandidate.title}`
                    : "후보를 선택하세요"}
          </span>
          {onRerun && !expanded && !hard && !person.posePresentation && (
            <Button variant="secondary" size="sm" onClick={onRerun} disabled={!included}>
              <RotateCw className="h-3.5 w-3.5" aria-hidden />
              후보 다시 찾기
            </Button>
          )}
        </div>
      </div>
      {expanded ? (
        <BodyExpand
          job={jobId}
          person={person}
          entry={entry}
          rough={{ url: roughUrl, box: person.box }}
          variant="app"
        />
      ) : (
        <>
          {bodiesEnabled && !hard && <BodyRenderStatus entry={entry} />}
          {/* soft·hard fallback 안내. */}
          <PersonFallbackNotice person={person} />
          {!hard && !person.posePresentation && (
            <div className="grid grid-cols-[190px_minmax(0,1fr)] gap-3">
              <RoughPanel
                url={roughUrl}
                people={people}
                person={person}
                excluded={excluded}
                onPick={onPick}
                showCaption={false}
              />
              <div className="relative">
                <div
                  {...tourAnchor("jobs.candidates")}
                  className={cn(
                    "grid grid-cols-5 gap-3",
                    !included && "pointer-events-none opacity-40 grayscale",
                  )}
                >
                  {bodiesEnabled ? (
                    <BodyCandidateCards
                      person={person}
                      entry={entry}
                      selected={selectedId}
                      onSelect={onSelect}
                      disabled={!included}
                    />
                  ) : (
                    person.candidates.map((candidate) => (
                      <PoseCandidateCard
                        key={candidate.id}
                        candidate={candidate}
                        characterId={characterId}
                        isSelected={candidate.id === selectedId}
                        onSelect={() => onSelect(candidate.id)}
                        disabled={!included}
                      />
                    ))
                  )}
                </div>
                {onRerun && included && (
                  <CandidateRerunTile onRerun={onRerun} className="mt-3 h-14 w-full" />
                )}
                {!included && <ExcludedOverlay onInclude={() => onIncluded(true)} />}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/** 접힌 인물 줄: 스위치 · 원본 썸네일 · 체형 · 고른 포즈. 줄 어디를 눌러도 그 인물이 펼쳐진다. */
function OtherPersonRow({
  first,
  jobId,
  person,
  roughUrl,
  bodiesEnabled,
  entry,
  included,
  onIncluded,
  selectedTitle,
  onOpen,
}: {
  first: boolean;
  jobId: string;
  person: PersonResult;
  roughUrl?: string;
  bodiesEnabled: boolean;
  entry?: BodyEntry;
  included: boolean;
  onIncluded(value: boolean): void;
  selectedTitle?: string;
  onOpen(): void;
}) {
  const hard = person.fallbackMode === "hard";
  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`인물 ${person.index + 1} 펼치기`}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
      className={cn(
        "group -mx-2 grid cursor-pointer grid-cols-[72px_36px_minmax(0,1.2fr)_minmax(0,1fr)_16px] items-center gap-3 rounded-lg px-2 py-1.5",
        "transition-colors duration-150 hover:bg-surface-1 active:bg-surface-2",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-sky",
        !first && "border-t border-surface-2 hover:border-transparent",
      )}
    >
      {person.posePresentation ? (
        <span className="text-xs">검수용 3D</span>
      ) : hard ? (
        <span className="text-[11.5px] text-text-secondary">후보 없음</span>
      ) : (
        <ExportSwitch personIndex={person.index} included={included} onChange={onIncluded} />
      )}
      <RoughThumb
        url={roughUrl}
        box={person.box}
        personIndex={person.index}
        className={cn(
          "h-[46px] w-9 transition-shadow group-hover:shadow-sm",
          (!included || hard) && "opacity-60",
        )}
      />
      <div className="flex min-w-0 flex-col">
        <span className="text-[12.5px] font-semibold text-text-primary">
          인물 {person.index + 1}
        </span>
        {bodiesEnabled && !hard && <BodyLabel job={jobId} person={person} entry={entry} />}
      </div>
      <span className="truncate text-[12px] text-text-secondary">
        {person.posePresentation
          ? "표시용 결과 펼치기"
          : hard
            ? "이 인물에 맞는 포즈 후보를 찾지 못했습니다"
            : !included
              ? "선택 안 함"
              : selectedTitle
                ? `고름: ${selectedTitle}`
                : "포즈를 아직 안 골랐어요"}
      </span>
      <ChevronRight
        aria-hidden
        className="h-4 w-4 -translate-x-1 text-text-secondary opacity-0 transition-all duration-150 group-hover:translate-x-0 group-hover:opacity-100 group-focus-visible:translate-x-0 group-focus-visible:opacity-100 motion-reduce:transition-none"
      />
    </div>
  );
}
