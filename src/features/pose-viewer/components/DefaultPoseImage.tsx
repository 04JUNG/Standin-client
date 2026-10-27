import { useThumbnailJourney } from "@/features/analytics/useThumbnailJourney";
import { useNearViewport } from "@/shared/hooks/useNearViewport";
import { CompactPoseImage } from "@/features/bar/components/CompactPoseLayout";
import { useCompactPoseLayout } from "@/features/bar/components/compactPoseContext";
import { bodyScopeSchema } from "../api/outputScope";
import type { PreviewCandidate } from "../api/posePresentation";
import { useDefaultPosePoster } from "../api/posePoster";
export function DefaultPoseImage({
  jobId,
  candidate,
  scope: rawScope,
  className = "",
  compact = false,
  savedOnly = false,
  lazy = false,
}: {
  jobId?: string;
  candidate: PreviewCandidate;
  scope?: string | null;
  className?: string;
  compact?: boolean;
  savedOnly?: boolean;
  lazy?: boolean;
}) {
  const { ref, visible } = useNearViewport(lazy);
  const inFloatingBar = useCompactPoseLayout();
  const scope = bodyScopeSchema.safeParse(rawScope).data ?? "full";
  const q = useDefaultPosePoster({
    url: candidate.source === "library" ? candidate.asset.preview_bvh_url + "/poster" : undefined,
    source: candidate.asset.bvh_sha256,
    candidate,
    scope,
    enabled: visible,
    savedOnly,
    directional: candidate.source === "library",
  });
  const reportFailure = useThumbnailJourney(
    jobId,
    candidate.candidate_id,
    visible && q.isError,
    q.data?.url,
    q.error,
  );
  return (
    <div ref={ref} className={className}>
      {q.data ? (
        inFloatingBar ? (
          <CompactPoseImage
            src={q.data.url}
            onError={reportFailure}
            onLoad={reportFailure.onLoad}
            alt={`${candidate.rank}번 ${q.data.kind === "default-body" ? "기본 체형 포즈 참고" : "포즈 뼈대 참고"}`}
          />
        ) : (
          <img
            loading={lazy ? "lazy" : undefined}
            decoding="async"
            src={q.data.url}
            onError={reportFailure}
            onLoad={reportFailure.onLoad}
            alt={q.data.kind === "default-body" ? "기본 체형 포즈 참고" : "포즈 뼈대 참고"}
            className={
              compact ? "h-[110px] w-full object-contain" : "aspect-square w-full object-contain"
            }
          />
        )
      ) : (
        <div
          className={`flex items-center justify-center text-xs ${inFloatingBar ? "h-[112px]" : compact ? "h-[110px]" : "aspect-square"}`}
          role="status"
        >
          {!visible
            ? "포즈 이미지"
            : q.error
              ? "참고 이미지를 불러오지 못했어요"
              : "포즈 이미지 불러오는 중…"}
        </div>
      )}
    </div>
  );
}
