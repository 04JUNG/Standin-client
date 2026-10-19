import { useCompactPoseLayout } from "@/features/bar/components/compactPoseContext";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Modal } from "@/shared/components/Modal";
import { useBodyOwner } from "./hooks";
import type { BodySelection } from "./contract";
import type { PreviewCandidate } from "@/features/pose-viewer/api/posePresentation";
import { renderPresentationBody } from "./presentation";
import { getManifest, renderBodyCandidate } from "./api";
import { previewRequests } from "@/features/pose-viewer/preview/requestQueue";

/** One explicit candidate, isolated from the default poster's query and lifetime. */
export function SinglePoseDetail({
  job,
  selection,
  candidateId,
  candidate,
  scope = "full",
  sourceIdentity,
}: {
  job: string;
  selection?: BodySelection;
  candidateId: string;
  candidate?: PreviewCandidate;
  scope?: string | null;
  sourceIdentity?: unknown;
}) {
  const compact = useCompactPoseLayout();
  const [open, setOpen] = useState(false);
  const owner = useBodyOwner(),
    qc = useQueryClient();
  const queryKey = [
    "body",
    owner,
    job,
    selection?.personIndex,
    "images",
    "detail",
    selection,
    candidate ?? candidateId,
    scope,
    sourceIdentity,
  ];
  const q = useQuery({
    queryKey,
    enabled: open && !!owner && selection?.resolutionStatus === "ready",
    queryFn: ({ signal }) =>
      previewRequests.run(signal, async () => {
        if (!selection) throw Error("체형 선택을 확인해 주세요.");
        if (candidate) return renderPresentationBody(job, candidate, selection, signal, scope);
        const manifest = await getManifest(job, selection.personIndex, selection, signal);
        if (manifest.outputScope !== scope) throw Error("출력 범위가 변경되었습니다.");
        const chosen = manifest.candidates.find((c) => c.candidateId === candidateId);
        if (!chosen) throw Error("포즈 후보가 변경되었습니다.");
        return renderBodyCandidate(manifest, chosen, signal);
      }),
    retry: false,
    staleTime: 600_000,
    gcTime: 600_000,
  });
  return (
    <>
      <button
        type="button"
        className={compact ? "mt-0.5 text-[11px] leading-4 underline" : "mt-2 text-xs underline"}
        aria-label="선택 체형으로 이 포즈만 보기"
        disabled={!selection || selection.resolutionStatus !== "ready"}
        onClick={() => setOpen(true)}
      >
        {compact ? "선택 체형 상세" : "선택 체형으로 이 포즈만 보기"}
      </button>
      <Modal
        open={open}
        title="선택 체형 포즈 미리보기"
        width="lg"
        onClose={() => {
          setOpen(false);
          void qc.cancelQueries({ queryKey, exact: true });
        }}
      >
        {q.data && !q.isFetching ? (
          <img
            src={q.data}
            alt="선택한 체형을 적용한 단일 포즈 미리보기"
            className="max-h-[55vh] w-full object-contain"
          />
        ) : (
          <p role="status">
            {q.error
              ? "지금은 체형 미리보기를 준비하지 못했어요. 기본 포즈 이미지는 계속 사용할 수 있어요."
              : "이 포즈에 선택한 체형을 적용하는 중…"}
          </p>
        )}
        {q.error && (
          <button type="button" className="text-sm underline" onClick={() => void q.refetch()}>
            다시 시도
          </button>
        )}
        <p className="text-xs text-text-secondary">
          참고 이미지입니다. 최종 손·출력 범위는 저장 전 확인 화면에서 확인하세요.
        </p>
      </Modal>
    </>
  );
}
