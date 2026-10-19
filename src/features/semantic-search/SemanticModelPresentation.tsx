import { renderPresentationBody } from "@/features/body-selection/presentation";
import { previewRequests } from "@/features/pose-viewer/preview/requestQueue";
import { DefaultPoseImage } from "@/features/pose-viewer/components/DefaultPoseImage";
import { BodyChip, BodyExpand } from "@/features/body-selection/BodyCandidates";
import { useBodyControls, type BodyEntry } from "@/features/body-selection/hooks";
import { bodyKeys, getSelection } from "@/features/body-selection/api";
import { useBodyPanel } from "@/features/body-selection/bodyPanel";
import type { BodySelection } from "@/features/body-selection/contract";
import type { PersonResult } from "@/features/pose-viewer/api/pose.contract";
import { useMemo, useState } from "react";
import { useIsMutating, useQuery, useQueryClient } from "@tanstack/react-query";
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
import { isRetiredCharacter } from "@/features/models/lib/retiredCharacters";

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
      {failed && <p role="alert">체형을 보여드리지 못했어요. 미리보기를 다시 불러와 주세요.</p>}
    </div>
  );
}
function Candidate({
  candidate,
  selection,
  waitForBody = false,
  label = "기본 남성",
  refreshSelection,
  bodyNotice,
  scope,
}: {
  candidate: PreviewCandidate;
  refreshSelection?: () => Promise<unknown>;
  selection?: BodySelection;
  waitForBody?: boolean;
  label?: string;
  bodyNotice?: string;
  scope?: string | null;
}) {
  const owner = useInstallationStore((s) => s.credentials?.installationId ?? "");
  const [open, setOpen] = useState(false),
    [turn, setTurn] = useState(0);
  const qc = useQueryClient();
  const queryKey = [
    "semantic-body-model",
    owner,
    candidate.asset.preview_bvh_url,
    selection?.selectionRevision,
    selection?.resolvedBody,
    selection?.shape?.shapeSha256,
    candidate.asset.bvh_sha256,
    candidate.render_camera,
    scope,
  ];
  const q = useQuery({
    queryKey,
    enabled: open && !waitForBody,
    queryFn: async ({ signal }) => {
      if (scope && scope !== "full") {
        if (!selection) throw Error("이 범위의 체형 상세에는 체형 선택이 필요합니다.");
        const prefix = candidate.asset.preview_bvh_url.match(/^\/v1\/analysis\/jobs\/([^/]+)\//);
        if (!prefix) throw Error("포즈 경로를 확인하지 못했습니다.");
        return {
          png: await previewRequests.run(signal, () =>
            renderPresentationBody(
              decodeURIComponent(prefix[1]),
              candidate,
              selection,
              signal,
              scope,
            ),
          ),
          model: undefined,
        };
      }
      return { model: await loadSemanticModel(candidate, signal, selection), png: undefined };
    },
    retry: false,
    staleTime: 300_000,
    gcTime: 60_000,
  });
  const modalModel = useMemo(
    () => (q.data?.model ? { ...q.data.model, turnDegrees: turn } : undefined),
    [q.data?.model, turn],
  );
  return (
    <article
      className="rounded-lg border border-border bg-surface-0 p-2"
      data-semantic-model={candidate.candidate_id}
    >
      <DefaultPoseImage candidate={candidate} scope={scope} savedOnly lazy />
      <p className="text-xs">
        {candidate.rank}. {candidate.kind === "library_match" ? "검색 후보" : "근접 참고"}
      </p>
      <button
        className="text-xs underline"
        disabled={waitForBody}
        onClick={() => {
          setTurn(0);
          setOpen(true);
        }}
        aria-label={`${candidate.rank}번 ${label} 모델 확대`}
      >
        {label}으로 이 포즈 보기
      </button>
      <button
        className="ml-3 text-xs underline"
        disabled={waitForBody || !open || q.isFetching}
        onClick={() => {
          if (refreshSelection) void refreshSelection().then(() => q.refetch());
          else void q.refetch();
        }}
      >
        미리보기 다시 불러오기
      </button>
      <p className="text-[11px] text-text-secondary">체형을 비교하는 정면 미리보기예요</p>
      <Modal
        open={open}
        onClose={() => {
          setOpen(false);
          void qc.cancelQueries({ queryKey, exact: true });
        }}
        title={`${label} 모델 3D 미리보기`}
        width="lg"
      >
        {!waitForBody && q.data && !q.isFetching ? (
          modalModel ? (
            <Surface key={turn} model={modalModel} label={label} />
          ) : (
            <img
              src={q.data.png}
              alt="고른 체형으로 본 포즈"
              className="max-h-[55vh] w-full object-contain"
            />
          )
        ) : (
          <p role="status">
            {bodyNotice ??
              (q.error
                ? "지금은 선택 체형 미리보기를 준비하지 못했어요. 기본 이미지는 유지됩니다."
                : "이 포즈의 체형 모델을 준비하는 중…")}
          </p>
        )}
        {q.error && (
          <button className="text-sm underline" onClick={() => void q.refetch()}>
            다시 시도
          </button>
        )}
        <div className="flex gap-3">
          <button disabled={!q.data?.model} onClick={() => setTurn((v) => v - 15)}>
            왼쪽 회전
          </button>
          <button disabled={!q.data?.model} onClick={() => setTurn(0)}>
            정면
          </button>
          <button disabled={!q.data?.model} onClick={() => setTurn((v) => v + 15)}>
            오른쪽 회전
          </button>
        </div>
        <p className="text-xs">
          {label}에 기본 손 모양을 적용한 참고 모습이에요. 이 이미지는 저장할 최종 모습과 다를 수
          있어요. 고른 손 모양은 아래 ‘손 적용 미리보기’에서 확인해 주세요.
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
  const selectedId = state.data?.resolvedBody?.characterId ?? state.data?.manualCharacterId;
  const retired = !!selectedId && isRetiredCharacter(selectedId);
  const ready =
    settled && !retired && state.data?.resolutionStatus === "ready" && !!state.data.resolvedBody;
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
      {!state.isFetching &&
        state.data &&
        (retired || state.data.resolutionStatus !== "ready") &&
        !reference && (
          <p role="status">
            {retired
              ? "이 체형은 지원이 종료되었습니다. 체형 더보기에서 다른 체형을 선택해 주세요."
              : "미리보기에 사용할 체형을 선택해 주세요."}
          </p>
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
            bodyNotice={retired ? "다른 체형을 선택해 주세요." : undefined}
            scope={presentation.output_scope}
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
      renderCandidate={(c) => <Candidate candidate={c} scope={presentation.output_scope} />}
    />
  );
}
