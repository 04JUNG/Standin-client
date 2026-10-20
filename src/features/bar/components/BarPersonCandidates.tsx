import { cn } from "@/shared/lib/cn";
import {
  BodyCandidateCard,
  BodyChip,
  BodyExpand,
  BodyRenderStatus,
} from "@/features/body-selection/BodyCandidates";
import { useBodyPanel } from "@/features/body-selection/bodyPanel";
import { ModelSelect } from "@/features/models/components/ModelSelect";
import type { PersonResult } from "@/features/pose-viewer/api/pose.contract";
import { canRelease } from "@/features/pose-viewer/api/routedSearch";
import { ExcludedOverlay, ExportSwitch } from "@/features/pose-viewer/components/ExportSwitch";
import { FitTile } from "@/features/pose-viewer/components/FitTile";
import { PersonFallbackNotice } from "@/features/pose-viewer/components/PersonFallbackNotice";
import { PoseCandidateCard } from "@/features/pose-viewer/components/PoseCandidateCard";
import { PosePresentationPanel } from "@/features/pose-viewer/components/PosePresentationPanel";
import { RoughPanel } from "@/features/pose-viewer/components/RoughPanel";
import type { useAnalysisResult } from "@/features/pose-viewer/hooks/useAnalysisResult";
import { usePoseSelectionStore } from "@/features/pose-viewer/store/poseSelectionStore";

/** 각 인물의 체형 열림·선택을 독립적으로 유지하며 한 스크롤 목록에 표시한다. */
export function BarPersonCandidates({
  person,
  analysis,
  onPickPerson,
}: {
  person: PersonResult;
  analysis: ReturnType<typeof useAnalysisResult>;
  onPickPerson(index: number): void;
}) {
  const {
    data,
    bodies,
    people,
    roughUrl,
    excludedPeople,
    selectedByPerson,
    setPersonIncluded,
    selectCandidate,
  } = analysis;
  const jobCharacterId = usePoseSelectionStore((s) => s.characterId);
  const characterId =
    usePoseSelectionStore((s) => s.characterByPerson[person.index]) ?? jobCharacterId;
  const setPersonCharacter = usePoseSelectionStore((s) => s.setPersonCharacter);
  const panel = useBodyPanel(data?.jobId ?? "", person.index);
  if (!data) return null;

  const semantic = data.source === "semantic";
  const sectionBackground = person.index % 2 === 0 ? "bg-surface-0" : "bg-surface-1";
  const included = !(person.index in excludedPeople);
  const selectable = person.candidates.some(canRelease);
  const selected = selectedByPerson[person.index];
  const entry = bodies.entries.find((e) => e.personIndex === person.index);
  const gridCandidates = person.candidates.filter((c) => !c.manualExportAllowed);
  const expanded =
    bodies.enabled && panel.open && person.candidates.length > 0 && person.fallbackMode !== "hard";
  const selection = {
    candidates: person.candidates,
    selected,
    onSelect: (id: string) => selectCandidate(person.index, id),
    disabled: !included,
    hiddenCandidateIds: semantic ? [] : gridCandidates.map((c) => c.id),
  };

  return (
    <section
      id={`bar-person-${person.index}`}
      aria-label={`인물 ${person.index + 1}`}
      data-bar-person={person.index}
      tabIndex={-1}
      className={cn(
        "flex min-w-0 scroll-mt-2 flex-col gap-2 rounded-lg border border-border p-2 focus:outline-none",
        sectionBackground,
      )}
    >
      <div
        className={cn(
          "flex items-center justify-between gap-2",
          sectionBackground,
          !semantic && "sticky top-0 z-10",
        )}
      >
        <div className="flex min-w-0 items-center gap-2">
          {selectable ? (
            <ExportSwitch
              personIndex={person.index}
              label={`인물 ${person.index + 1} 선택`}
              included={included}
              onChange={(value) => setPersonIncluded(person.index, value)}
            />
          ) : (
            <h2 className="text-[11px] font-semibold text-text-secondary">
              인물 {person.index + 1}
            </h2>
          )}
          {included && selected && (
            <span className="text-[11px] text-text-secondary">포즈 선택됨</span>
          )}
        </div>
        {!semantic &&
          selectable &&
          (bodies.enabled ? (
            <BodyChip job={data.jobId} person={person} entry={entry} className="min-w-0" />
          ) : (
            <ModelSelect
              variant="compact"
              label={`인물 ${person.index + 1}의 모델`}
              value={characterId}
              onChange={(id) => setPersonCharacter(person.index, id)}
            />
          ))}
      </div>

      {semantic ? (
        person.posePresentation ? (
          <PosePresentationPanel
            presentation={person.posePresentation}
            bodyPreviewJob={
              data.capabilities.bodyPreviews || data.capabilities.presentationBodyPreviews
                ? data.jobId
                : undefined
            }
            selection={selection}
            compact
          />
        ) : (
          <PersonFallbackNotice person={person} compact />
        )
      ) : expanded ? (
        <BodyExpand
          job={data.jobId}
          person={person}
          entry={entry}
          rough={{ url: roughUrl, box: person.box }}
          variant="bar"
        />
      ) : (
        <>
          {bodies.enabled && <BodyRenderStatus entry={entry} />}
          <PersonFallbackNotice
            bodyPreviewJob={
              (!bodies.enabled || !person.candidates.length) &&
              data.capabilities.presentationBodyPreviews
                ? data.jobId
                : undefined
            }
            person={person}
            selection={selection}
            compact
          />
          {gridCandidates.length > 0 && person.fallbackMode !== "hard" && (
            // 원본은 왼쪽, 후보는 기존 3+2 배치. 높이는 viewport 대신 카드가 읽히는 크기로 정한다.
            <div className="grid h-[380px] grid-cols-[minmax(180px,26%)_minmax(0,1fr)] gap-2">
              <RoughPanel
                url={roughUrl}
                people={people}
                person={person}
                excluded={excludedPeople}
                onPick={onPickPerson}
              />
              <div className="relative min-h-0">
                <div
                  className={cn(
                    "grid h-full min-h-0 grid-cols-6 grid-rows-2 gap-1.5",
                    !included && "pointer-events-none opacity-40 grayscale",
                  )}
                >
                  {gridCandidates.map((candidate, i) => (
                    <FitTile
                      key={candidate.id}
                      className={i === 3 ? "col-span-2 col-start-2" : "col-span-2"}
                    >
                      {bodies.enabled ? (
                        <BodyCandidateCard
                          job={data.jobId}
                          candidate={candidate}
                          entry={entry}
                          selected={selected}
                          onSelect={(id) => selectCandidate(person.index, id)}
                          disabled={!included}
                        />
                      ) : (
                        <PoseCandidateCard
                          candidate={candidate}
                          characterId={characterId}
                          isSelected={candidate.id === selected}
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
                    personIndex={person.index}
                    onInclude={() => setPersonIncluded(person.index, true)}
                  />
                )}
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}
