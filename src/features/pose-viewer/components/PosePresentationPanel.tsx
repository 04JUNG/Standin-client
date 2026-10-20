import { Modal } from "@/shared/components/Modal";
import { generatedPoseNotice } from "../api/generatedPoseNotice";
import { canRelease } from "../api/routedSearch";
import type { PoseCandidate } from "../api/pose.contract";
import { cn } from "@/shared/lib/cn";
import { useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useBodyOwner, type BodyEntry } from "@/features/body-selection/hooks";
import { bodyKeys, getSelection } from "@/features/body-selection/api";
import { DefaultPoseImage } from "./DefaultPoseImage";
import { BodyChip, BodyExpand, BodyRenderStatus } from "@/features/body-selection/BodyCandidates";
import { useBodyPanel } from "@/features/body-selection/bodyPanel";
import type { PosePresentation, PreviewCandidate } from "../api/posePresentation";
import { SemanticCandidateList } from "@/features/semantic-search/SemanticCandidateList";
import { CandidatePages } from "./CandidatePages";

export type PresentationSelection = {
  candidates: PoseCandidate[];
  selected?: string;
  onSelect(id: string): void;
  disabled?: boolean;
  hiddenCandidateIds?: string[];
};
const candidateLabel = (kind: string) =>
  ({
    library_match: "검색 후보",
    mirror_reference: "좌우 반전 포즈",
    generated_review: "새로 만든 참고 포즈",
    near_match: "비슷한 다른 포즈",
  })[kind] ?? "자세를 참고할 포즈";
function Preview({
  candidate,
  scope,
  selection,
  compact,
  savedOnly = false,
  pick,
}: {
  candidate: PreviewCandidate;
  scope: string | null;
  selection?: PresentationSelection;
  compact?: boolean;
  savedOnly?: boolean;
  pick?: PoseCandidate;
}) {
  const [expanded, setExpanded] = useState(false);
  const generated = candidate.source === "generation";
  const selectable = canRelease(pick);
  const selected = selection?.selected === candidate.candidate_id;
  return (
    <div
      data-presentation-candidate={candidate.candidate_id}
      id={`pose-candidate-${candidate.candidate_id}`}
      tabIndex={-1}
      className={cn(
        "rounded-lg border bg-surface-0 p-2",
        selected ? "border-brand-coral ring-1 ring-brand-coral" : "border-border",
      )}
    >
      <button
        type="button"
        className="w-full rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-sky disabled:cursor-default"
        aria-label={`${candidate.rank}번 ${candidateLabel(candidate.kind)} 이미지로 선택`}
        aria-pressed={selected}
        disabled={!selectable || !selection || selection.disabled}
        onClick={() => selection?.onSelect(candidate.candidate_id)}
      >
        <DefaultPoseImage
          candidate={candidate}
          scope={scope}
          compact={compact}
          savedOnly={savedOnly}
          lazy={savedOnly}
        />
        <span className="text-xs">
          {candidate.rank}. {candidateLabel(candidate.kind)}
        </span>
      </button>
      {generated && (
        <>
          <button
            type="button"
            className="mt-1 w-full text-xs underline"
            onClick={() => setExpanded(true)}
            aria-label={`${candidate.rank}번 새로 만든 포즈 확대`}
          >
            크게 보기
          </button>
          <Modal
            open={expanded}
            onClose={() => setExpanded(false)}
            title="새로 만든 포즈"
            width="lg"
          >
            <DefaultPoseImage candidate={candidate} scope={scope} savedOnly={savedOnly} />
            <p className="text-xs text-text-secondary">
              원본 그림과 다를 수 있으니 저장 전에 확인해 주세요.
            </p>
          </Modal>
          <p className="text-[11px] text-text-secondary">
            원본 그림과 다를 수 있으니 저장 전에 확인해 주세요.
          </p>
        </>
      )}
      {selectable && selection ? (
        <button
          type="button"
          aria-pressed={selected}
          disabled={selection.disabled}
          className="mt-1 w-full rounded border border-border px-2 py-1.5 text-xs font-semibold hover:border-brand-sky disabled:opacity-50"
          onClick={() => selection.onSelect(candidate.candidate_id)}
          aria-label={`${candidate.rank}번 ${candidateLabel(candidate.kind)} 선택`}
        >
          {selected ? "선택한 포즈" : "이 포즈 선택"}
        </button>
      ) : (
        <div className="text-[11px] text-text-secondary">
          <p>미리보기 전용</p>
          {generated && <p>{generatedPoseNotice(null, candidate.manual_use_block_reason)}</p>}
        </div>
      )}
    </div>
  );
}
function PresentationContent({
  presentation: p,
  compact = false,
  selectableLibrary = false,
  renderCandidate,
  selection,
}: {
  presentation: PosePresentation;
  compact?: boolean;
  selectableLibrary?: boolean;
  renderCandidate?: (candidate: PreviewCandidate) => ReactNode;
  selection?: PresentationSelection;
}) {
  const semantic = p.version === "semantic-pose-presentation-v1";
  const candidatesById = useMemo(
    () => new Map(selection?.candidates.map((c) => [c.id, c])),
    [selection?.candidates],
  );
  const render = (c: PreviewCandidate) =>
    renderCandidate ? (
      <div key={c.candidate_id}>{renderCandidate(c)}</div>
    ) : (
      <Preview
        key={c.candidate_id}
        candidate={c}
        pick={candidatesById.get(c.candidate_id)}
        scope={p.output_scope}
        selection={selection}
        compact={compact}
        savedOnly={semantic}
      />
    );
  const gridClass = `grid gap-2 ${compact ? "grid-cols-5" : "grid-cols-2 sm:grid-cols-3 lg:grid-cols-5"}`;
  return (
    <section className="space-y-2" aria-label={`인물 ${p.person_index + 1} 포즈 표시 결과`}>
      {["timeout", "rejected", "failed", "error"].includes(p.generation_status ?? "") && (
        <p className="text-xs text-text-secondary">{generatedPoseNotice(p.generation_status)}</p>
      )}
      {(
        [
          ["검색 후보", p.library_candidates],
          ["좌우 반전 포즈", p.review_candidates.filter((c) => c.kind === "mirror_reference")],
          ["비슷한 다른 포즈", p.review_candidates.filter((c) => c.kind !== "mirror_reference")],
          ["새로 만든 참고 포즈", p.generated_candidates],
        ] as const
      )
        .map(
          ([label, rows]) =>
            [
              label,
              rows.filter((c) => !selection?.hiddenCandidateIds?.includes(c.candidate_id)),
            ] as const,
        )
        .filter(
          ([label, rows]) =>
            !(selectableLibrary && !selection && label === "검색 후보") &&
            (label !== "좌우 반전 포즈" || rows.length > 0) &&
            !(label === "검색 후보" && rows.length === 0 && selection?.hiddenCandidateIds?.length),
        )
        .map(([label, rows]) => (
          <div key={label}>
            <h3 className="text-xs font-semibold">
              {label} {rows.length}개
            </h3>
            {rows.length > 0 &&
              (semantic ? (
                <SemanticCandidateList
                  key={rows.map((c) => c.candidate_id).join(",")}
                  rows={rows}
                  label={label}
                  gridClass={gridClass}
                  render={render}
                />
              ) : compact ? (
                <CandidatePages
                  key={rows.map((c) => c.candidate_id).join(",")}
                  rows={rows}
                  label={label}
                  gridClass={gridClass}
                  render={render}
                />
              ) : (
                <div
                  className={`grid gap-2 ${compact ? "grid-cols-5" : "grid-cols-2 sm:grid-cols-3 lg:grid-cols-5"}`}
                >
                  {rows.map(render)}
                </div>
              ))}
          </div>
        ))}
    </section>
  );
}

function SelectedBodyPresentation({
  job,
  presentation,
  compact,
  selectableLibrary,
  selection,
}: {
  job: string;
  presentation: PosePresentation;
  compact: boolean;
  selectableLibrary: boolean;
  selection?: PresentationSelection;
}) {
  const owner = useBodyOwner();
  const state = useQuery({
    queryKey: bodyKeys.selection(owner, job, presentation.person_index),
    queryFn: ({ signal }) => getSelection(job, presentation.person_index, signal),
    enabled: !!owner,
    retry: false,
  });
  const entry: BodyEntry = {
    personIndex: presentation.person_index,
    selection: state.data,
    group: undefined,
    ready: state.data?.resolutionStatus === "ready" && !state.isFetching,
    error: state.error,
    retry: async () => {
      await state.refetch();
    },
  };
  const person = { index: presentation.person_index };
  const { open } = useBodyPanel(job, person.index);
  return (
    <div className="space-y-2">
      <BodyChip job={job} person={person} entry={entry} />
      {open ? (
        <BodyExpand job={job} person={person} entry={entry} variant={compact ? "bar" : "app"} />
      ) : (
        <>
          <BodyRenderStatus entry={entry} />
          <PresentationContent
            presentation={presentation}
            compact={compact}
            selectableLibrary={selectableLibrary}
            selection={selection}
          />
        </>
      )}
    </div>
  );
}
export function PosePresentationPanel({
  presentation,
  compact = false,
  selectableLibrary = false,
  bodyPreviewJob,
  renderCandidate,
  selection,
}: {
  presentation: PosePresentation;
  compact?: boolean;
  selectableLibrary?: boolean;
  bodyPreviewJob?: string;
  renderCandidate?: (candidate: PreviewCandidate) => ReactNode;
  selection?: PresentationSelection;
}) {
  const hasCandidates = [
    presentation.library_candidates,
    presentation.review_candidates,
    presentation.generated_candidates,
  ].some((g) => g.length > 0);
  return bodyPreviewJob && hasCandidates && !renderCandidate ? (
    <SelectedBodyPresentation
      job={bodyPreviewJob}
      presentation={presentation}
      compact={compact}
      selectableLibrary={selectableLibrary}
      selection={selection}
    />
  ) : (
    <PresentationContent
      presentation={presentation}
      compact={compact}
      selectableLibrary={selectableLibrary}
      renderCandidate={renderCandidate}
      selection={selection}
    />
  );
}
