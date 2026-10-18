import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
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

function Surface({ model }: { model: ReviewModel }) {
  const [failed, setFailed] = useState(false);
  return (
    <div>
      <ReviewModelPreview
        model={model}
        label="기본 남성 모델 3D 미리보기"
        className="max-h-[58vh]"
        onStatus={(s) => setFailed(s === "failed")}
      />
      {failed && (
        <p role="alert">기본 남성 모델을 표시하지 못했습니다. 미리보기를 다시 불러와 주세요.</p>
      )}
    </div>
  );
}
function Candidate({ candidate }: { candidate: PreviewCandidate }) {
  const owner = useInstallationStore((s) => s.credentials?.installationId ?? "");
  const [open, setOpen] = useState(false),
    [turn, setTurn] = useState(0);
  const q = useQuery({
    queryKey: ["semantic-male-model", owner, candidate.asset.preview_bvh_url],
    queryFn: ({ signal }) => loadSemanticModel(candidate, signal),
    retry: false,
    staleTime: 300_000,
    gcTime: 60_000,
  });
  return (
    <article
      className="rounded-lg border border-border bg-surface-0 p-2"
      data-semantic-model={candidate.candidate_id}
    >
      {q.data ? (
        <Surface key={q.data.modelRevision + String(q.data.data.byteLength)} model={q.data} />
      ) : (
        <p
          className="flex aspect-square items-center justify-center text-xs"
          role={q.error ? "alert" : "status"}
        >
          {q.error ? "기본 남성 모델을 불러오지 못했습니다." : "기본 남성 모델 준비 중…"}
        </p>
      )}
      <p className="text-xs">
        {candidate.rank}. {candidate.kind === "library_match" ? "검색 후보" : "근접 참고"} · 기본
        남성
      </p>
      <button
        className="text-xs underline"
        disabled={!q.data}
        onClick={() => {
          setTurn(0);
          setOpen(true);
        }}
        aria-label={`${candidate.rank}번 기본 남성 모델 확대`}
      >
        3D 확대
      </button>
      <button
        className="ml-3 text-xs underline"
        disabled={q.isFetching}
        onClick={() => void q.refetch()}
      >
        미리보기 다시 불러오기
      </button>
      <p className="text-[11px] text-text-secondary">정면 참고 · 검수용 · 보정·저장 불가</p>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="기본 남성 모델 3D 미리보기"
        width="lg"
      >
        {q.data && <Surface key={turn} model={{ ...q.data, turnDegrees: turn }} />}
        <div className="flex gap-3">
          <button onClick={() => setTurn((v) => v - 15)}>왼쪽 회전</button>
          <button onClick={() => setTurn(0)}>정면</button>
          <button onClick={() => setTurn((v) => v + 15)}>오른쪽 회전</button>
        </div>
        <p className="text-xs">
          기본 남성 체형·기본 손의 참고 모델입니다. 자동 적용·refine·내보내기는 지원하지 않습니다.
          손 선택 결과는 아래 손 적용 참고 렌더에서 확인하세요.
        </p>
      </Modal>
    </article>
  );
}
export function SemanticModelPresentation({
  presentation,
  compact = false,
  bodyPreviewJob,
}: {
  presentation: PosePresentation;
  compact?: boolean;
  bodyPreviewJob?: string;
}) {
  return (
    <PosePresentationPanel
      presentation={presentation}
      compact={compact}
      bodyPreviewJob={bodyPreviewJob}
      renderCandidate={(c) => <Candidate candidate={c} />}
    />
  );
}
