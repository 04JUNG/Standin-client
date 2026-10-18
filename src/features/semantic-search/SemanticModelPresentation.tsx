import { BodyChip, BodyExpand } from "@/features/body-selection/BodyCandidates";
import { useBodyControls, type BodyEntry } from "@/features/body-selection/hooks";
import { bodyKeys, getSelection } from "@/features/body-selection/api";
import { useBodyPanel } from "@/features/body-selection/bodyPanel";
import type { BodySelection } from "@/features/body-selection/contract";
import type { PersonResult } from "@/features/pose-viewer/api/pose.contract";
import { useState } from "react";
import { useIsMutating, useQuery } from "@tanstack/react-query";
import { loadSemanticModel } from "./modelPreview";
import { useInstallationStore } from "@/features/installation/installationStore";
import { PosePresentationPanel } from "@/features/pose-viewer/components/PosePresentationPanel";
import { ReviewModelPreview } from "@/features/pose-viewer/components/ReviewModelPreview";
import type { ReviewModel } from "@/features/pose-viewer/preview/mountReviewModel";
import type {
  PosePresentation,
  PreviewCandidate,
} from "@/features/pose-viewer/api/posePresentation";
import { Modal } from "@/shared/components/Modal";

function Surface({ model, label = "기본 남성" }: { model: ReviewModel; label?: string }) {
  const [failed, setFailed] = useState(false);
  return (
    <div>
      <ReviewModelPreview
        model={model}
        label={`${label} 모델 3D 미리보기`}
        className="max-h-[58vh]"
        onStatus={(s) => setFailed(s === "failed")}
      />
      {failed && (
        <p role="alert">체형 모델을 표시하지 못했습니다. 미리보기를 다시 불러와 주세요.</p>
      )}
    </div>
  );
}
function Candidate({
  candidate,
  selection,
  waitForBody = false,
  label = "기본 남성",
  refreshSelection,
}: {
  candidate: PreviewCandidate;
  refreshSelection?: () => Promise<unknown>;
  selection?: BodySelection;
  waitForBody?: boolean;
  label?: string;
}) {
  const owner = useInstallationStore((s) => s.credentials?.installationId ?? "");
  const [open, setOpen] = useState(false),
    [turn, setTurn] = useState(0);
  const q = useQuery({
    queryKey: [
      "semantic-body-model",
      owner,
      candidate.asset.preview_bvh_url,
      selection?.selectionRevision,
      selection?.resolvedBody,
      selection?.shape?.shapeSha256,
    ],
    enabled: !waitForBody,
    queryFn: ({ signal }) => loadSemanticModel(candidate, signal, selection),
    retry: false,
    staleTime: 300_000,
    gcTime: 60_000,
  });
  return (
    <article
      className="rounded-lg border border-border bg-surface-0 p-2"
      data-semantic-model={candidate.candidate_id}
    >
      {!waitForBody && q.data ? (
        <Surface
          key={q.data.modelRevision + String(q.data.data.byteLength)}
          model={q.data}
          label={label}
        />
      ) : (
        <p
          className="flex aspect-square items-center justify-center text-xs"
          role={!waitForBody && q.error ? "alert" : "status"}
        >
          {!waitForBody && q.error
            ? "체형 모델을 불러오지 못했습니다."
            : "선택한 체형 모델 준비 중…"}
        </p>
      )}
      <p className="text-xs">
        {candidate.rank}. {candidate.kind === "library_match" ? "검색 후보" : "근접 참고"} · {label}
      </p>
      <button
        className="text-xs underline"
        disabled={waitForBody || !q.data}
        onClick={() => {
          setTurn(0);
          setOpen(true);
        }}
        aria-label={`${candidate.rank}번 ${label} 모델 확대`}
      >
        3D 확대
      </button>
      <button
        className="ml-3 text-xs underline"
        disabled={waitForBody || q.isFetching}
        onClick={() => {
          if (refreshSelection) void refreshSelection().then(() => q.refetch());
          else void q.refetch();
        }}
      >
        미리보기 다시 불러오기
      </button>
      <p className="text-[11px] text-text-secondary">정면 참고 · 검수용 · 보정·저장 불가</p>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={`${label} 모델 3D 미리보기`}
        width="lg"
      >
        {!waitForBody && q.data && (
          <Surface key={turn} model={{ ...q.data, turnDegrees: turn }} label={label} />
        )}
        <div className="flex gap-3">
          <button onClick={() => setTurn((v) => v - 15)}>왼쪽 회전</button>
          <button onClick={() => setTurn(0)}>정면</button>
          <button onClick={() => setTurn((v) => v + 15)}>오른쪽 회전</button>
        </div>
        <p className="text-xs">
          {label}·기본 손의 참고 모델입니다. 자동 적용·refine·내보내기는 지원하지 않습니다. 손 선택
          결과는 아래 손 적용 참고 렌더에서 확인하세요.
        </p>
      </Modal>
    </article>
  );
}
function SelectedBodyPresentation({
  presentation,
  compact,
  context,
}: {
  presentation: PosePresentation;
  compact: boolean;
  context: { jobId: string; person: PersonResult };
}) {
  const owner = useInstallationStore((s) => s.credentials?.installationId ?? "");
  const { jobId, person } = context;
  const state = useQuery({
    queryKey: bodyKeys.selection(owner, jobId, person.index),
    queryFn: ({ signal }) => getSelection(jobId, person.index, signal),
    enabled: !!owner,
    retry: false,
    staleTime: 0,
  });
  const pending = useIsMutating({ mutationKey: ["body-change", owner, jobId] }) > 0;
  const { options } = useBodyControls(jobId, person, state.data);
  const settled = !pending && !state.isFetching && !state.error;
  const ready = settled && state.data?.resolutionStatus === "ready" && !!state.data.resolvedBody;
  // A new text job can legitimately have no inherited body (for example after a
  // catalog default retires). Show the existing read-only reference without
  // persisting a choice. Explicit/unavailable choices and errors must stay blocked.
  const reference =
    settled &&
    state.data?.resolutionStatus === "needs_selection" &&
    state.data.intent === "inherit" &&
    !state.data.manualCharacterId &&
    !state.data.resolvedBody &&
    !state.data.shape;
  const label =
    options.data?.characters.find((c) => c.characterId === state.data?.resolvedBody?.characterId)
      ?.displayName ?? "선택한 체형";
  const panel = useBodyPanel(jobId, person.index);
  const entry: BodyEntry = {
    personIndex: person.index,
    selection: state.data,
    group: undefined,
    ready,
    error: state.error,
    retry: async () => {
      await state.refetch();
    },
  };
  return (
    <div className="flex flex-col gap-3">
      <BodyChip job={jobId} person={person} entry={entry} />
      {panel.open && (
        <BodyExpand job={jobId} person={person} entry={entry} variant={compact ? "bar" : "app"} />
      )}
      {state.error && (
        <p role="alert">
          체형 선택을 불러오지 못했습니다.{" "}
          <button onClick={() => void state.refetch()}>다시 시도</button>
        </p>
      )}
      {reference && (
        <p role="status" className="text-sm text-text-secondary">
          체형 선택 전에는 기본 남성 참고 모델을 보여드려요. 체형 더보기에서 바꿀 수 있어요.
        </p>
      )}
      {!state.isFetching && state.data && state.data.resolutionStatus !== "ready" && !reference && (
        <p role="status">미리보기에 사용할 체형을 선택해 주세요.</p>
      )}
      <PosePresentationPanel
        presentation={presentation}
        compact={compact}
        renderCandidate={(c) => (
          <Candidate
            candidate={c}
            selection={reference ? undefined : state.data}
            waitForBody={!ready && !reference}
            label={reference ? "기본 남성 참고" : label}
          />
        )}
      />
    </div>
  );
}
export function SemanticModelPresentation({
  presentation,
  compact = false,
  bodyContext,
  bodyPreviewJob,
}: {
  presentation: PosePresentation;
  compact?: boolean;
  bodyPreviewJob?: string;
  bodyContext?: { jobId: string; person: PersonResult };
}) {
  if (bodyContext)
    return (
      <SelectedBodyPresentation
        presentation={presentation}
        compact={compact}
        context={bodyContext}
      />
    );
  return (
    <PosePresentationPanel
      presentation={presentation}
      compact={compact}
      bodyPreviewJob={bodyPreviewJob}
      renderCandidate={(c) => <Candidate candidate={c} />}
    />
  );
}
