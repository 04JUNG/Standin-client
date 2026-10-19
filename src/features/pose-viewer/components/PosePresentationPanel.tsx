import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useBodyOwner, type BodyEntry } from "@/features/body-selection/hooks";
import { bodyKeys, getSelection } from "@/features/body-selection/api";
import { SinglePoseDetail } from "@/features/body-selection/SinglePoseDetail";
import type { BodySelection } from "@/features/body-selection/contract";
import { DefaultPoseImage } from "./DefaultPoseImage";
import { BodyChip, BodyExpand, BodyRenderStatus } from "@/features/body-selection/BodyCandidates";
import { useBodyPanel } from "@/features/body-selection/bodyPanel";
import type { PosePresentation, PreviewCandidate } from "../api/posePresentation";
import { CandidatePages } from "./CandidatePages";

const labels: Record<string, string> = {
  ready: "검색 후보 준비",
  review_ready: "검수용 결과",
  basic_reference: "기본 인체 계획",
  no_result: "정상 검색 완료 · 후보 없음",
  generation_failed: "생성 검수 실패",
  partial_error: "일부 검색/미리보기 오류",
  error: "검색/미리보기 오류",
  blocked: "검색 제한",
  undetermined: "판정 보류",
  not_run: "검색 미실행",
};
const search: Record<string, string> = {
  ok: "검색 완료",
  no_result: "일치 후보 없음",
  partial_error: "일부 검색 오류",
  error: "검색 오류",
  blocked: "검색 제한",
  undetermined: "판정 보류",
  not_run: "검색 미실행",
};
const candidateLabel = (kind: string) =>
  ({
    library_match: "검색 후보",
    mirror_reference: "반대손 참고",
    generated_review: "생성 검수",
    near_match: "근접 참고",
  })[kind] ?? "기하·구도 참고";
const generation: Record<string, string> = {
  not_requested: "미실행",
  preview_ready: "검수 후보 준비",
  error: "오류",
  rejected: "검증 탈락",
  timeout: "시간 초과",
  unsupported: "미지원",
  no_result: "정상 완료 · 후보 없음",
};
function Preview({
  candidate,
  scope,
  bodyContext,
  originalRank,
}: {
  candidate: PreviewCandidate;
  scope: string | null;
  bodyContext?: { job: string; selection?: BodySelection };
  originalRank?: number;
}) {
  return (
    <div
      data-presentation-candidate={candidate.candidate_id}
      id={`pose-candidate-${candidate.candidate_id}`}
      tabIndex={-1}
      className="rounded-lg border border-border bg-surface-0 p-2"
    >
      <div
        className="w-full"
        aria-label={`${candidate.rank}번 ${candidateLabel(candidate.kind)} 3D 미리보기`}
      >
        <DefaultPoseImage candidate={candidate} scope={scope} />
        <span className="text-xs">
          {candidate.rank}. {candidateLabel(candidate.kind)}
        </span>
      </div>
      {candidate.mirror_comparison && (
        <p className="text-[11px] font-semibold text-text-primary">
          <a
            className="underline"
            href={`#pose-candidate-${candidate.mirror_comparison.original_candidate_id}`}
          >
            검색 후보 {originalRank}
          </a>
          의 반대손 참고
        </p>
      )}
      {candidate.mirror_comparison && (
        <p className="text-[11px] text-text-secondary">
          인물의 {candidate.mirror_comparison.observed_side === "left" ? "왼손" : "오른손"} 관측 ·{" "}
          {candidate.mirror_comparison.reference_side === "left" ? "왼손" : "오른손"} 자세 참고
        </p>
      )}
      {candidate.mirror_comparison && (
        <p className="text-[11px] text-text-secondary">
          관측 조건과 다른 대안입니다. 보이지 않는 부위는 확인된 자세가 아닙니다.
        </p>
      )}

      <p className="text-[11px] text-text-secondary">기본 정면 참고 · 검수용 · 저장 불가</p>
      {bodyContext && (
        <SinglePoseDetail
          job={bodyContext.job}
          selection={bodyContext.selection}
          candidateId={candidate.candidate_id}
          candidate={candidate}
          scope={scope}
        />
      )}
    </div>
  );
}
function PresentationContent({
  presentation: p,
  compact = false,
  selectableLibrary = false,
  renderCandidate,
  bodyContext,
}: {
  presentation: PosePresentation;
  compact?: boolean;
  selectableLibrary?: boolean;
  renderCandidate?: (candidate: PreviewCandidate) => ReactNode;
  bodyContext?: { job: string; selection?: BodySelection };
}) {
  const semantic = p.version === "semantic-pose-presentation-v1";
  const render = (c: PreviewCandidate) =>
    renderCandidate ? (
      <div key={c.candidate_id}>{renderCandidate(c)}</div>
    ) : (
      <Preview
        key={c.candidate_id}
        candidate={c}
        originalRank={
          p.library_candidates.find(
            (original) => original.candidate_id === c.mirror_comparison?.original_candidate_id,
          )?.rank
        }
        scope={p.output_scope}
        bodyContext={bodyContext}
      />
    );
  const gridClass = `grid gap-2 ${compact ? "grid-cols-2" : "grid-cols-2 sm:grid-cols-3 lg:grid-cols-5"}`;
  return (
    <section className="space-y-2" aria-label={`인물 ${p.person_index + 1} 포즈 표시 결과`}>
      <div role="status" className="rounded-lg bg-surface-2 p-2 text-xs">
        <p>
          {labels[p.status] ?? "지원하지 않는 표시 상태"} ·{" "}
          {search[p.search_status] ?? "검색 상태 확인 필요"}
        </p>
        {p.search_reason && <p>검색 조건과 근거를 확인해 주세요.</p>}
        {p.generation_status && <p>생성: {generation[p.generation_status] ?? "판정 보류"}</p>}
        {p.basic_model && <p>기본 인체 출력 계획 · 아직 3D 파일이 제공되지 않았습니다.</p>}
        {p.unobserved_body_is_default === true && (
          <p>보이지 않는 신체 부위에는 기본값이 포함되어 있습니다.</p>
        )}
        <p>
          {selectableLibrary
            ? "아래 검색 후보를 눌러 포즈를 선택하세요. 저장 전에 결과를 확인합니다."
            : "검수용입니다. 자동 적용·보정·내보내기를 지원하지 않습니다."}
        </p>
        {p.mirror_comparison?.status === "ready" && (
          <p>
            전체 {p.library_candidates.length + p.review_candidates.length}개에 원본과 반대손 참고
            한 쌍이 포함됩니다. 반대손 참고는 저장할 수 없습니다.
          </p>
        )}
        {p.mirror_comparison?.status === "unavailable" && (
          <p>
            검증된 반대손 참고 후보를 준비하지 못했습니다. 검색 후보는 그대로 확인할 수 있습니다.
          </p>
        )}
        {p.issues.length > 0 && <p>일부 3D 미리보기를 확인하지 못했습니다.</p>}
      </div>
      {(
        [
          ["검색 후보", p.library_candidates],
          ["반대손 참고", p.review_candidates.filter((c) => c.kind === "mirror_reference")],
          ["근접·기하·구도 참고", p.review_candidates.filter((c) => c.kind !== "mirror_reference")],
          ["생성 검수 후보", p.generated_candidates],
        ] as const
      )
        .filter(
          ([label, rows]) =>
            !(selectableLibrary && label === "검색 후보") &&
            (label !== "반대손 참고" || rows.length > 0),
        )
        .map(([label, rows]) => (
          <div key={label}>
            <h3 className="text-xs font-semibold">
              {label} {rows.length}개
            </h3>
            {rows.length > 0 &&
              (semantic ? (
                <CandidatePages
                  key={rows.map((c) => c.candidate_id).join(",")}
                  rows={rows}
                  label={label}
                  gridClass={gridClass}
                  render={render}
                />
              ) : (
                <div className={`grid gap-2 ${compact ? "grid-cols-2" : "grid-cols-3"}`}>
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
}: {
  job: string;
  presentation: PosePresentation;
  compact: boolean;
  selectableLibrary: boolean;
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
            bodyContext={{ job, selection: state.data }}
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
}: {
  presentation: PosePresentation;
  compact?: boolean;
  selectableLibrary?: boolean;
  bodyPreviewJob?: string;
  renderCandidate?: (candidate: PreviewCandidate) => ReactNode;
}) {
  const hasCandidates = [
    presentation.library_candidates,
    presentation.review_candidates,
    presentation.generated_candidates,
  ].some((g) => g.length > 0);
  return bodyPreviewJob && hasCandidates ? (
    <SelectedBodyPresentation
      job={bodyPreviewJob}
      presentation={presentation}
      compact={compact}
      selectableLibrary={selectableLibrary}
    />
  ) : (
    <PresentationContent
      presentation={presentation}
      compact={compact}
      selectableLibrary={selectableLibrary}
      renderCandidate={renderCandidate}
    />
  );
}
