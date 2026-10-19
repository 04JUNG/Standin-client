import { CompactPoseImage } from "@/features/bar/components/CompactPoseLayout";
import { useCompactPoseLayout } from "@/features/bar/components/compactPoseContext";
import { SCOPE_LABELS, bodyScopeSchema } from "../api/outputScope";
import type { PreviewCandidate } from "../api/posePresentation";
import { useDefaultPosePoster } from "../api/posePoster";
export function DefaultPoseImage({
  candidate,
  scope: rawScope,
  className = "",
  compact = false,
}: {
  candidate: PreviewCandidate;
  scope?: string | null;
  className?: string;
  compact?: boolean;
}) {
  const inFloatingBar = useCompactPoseLayout();
  const scope = bodyScopeSchema.safeParse(rawScope).data ?? "full";
  const q = useDefaultPosePoster({
    url: candidate.source === "library" ? candidate.asset.preview_bvh_url + "/poster" : undefined,
    source: candidate.asset.bvh_sha256,
    candidate,
    scope,
  });
  const provenance =
    q.data?.method === "reference-skinning-v1"
      ? "기본 체형 · 근사 포즈"
      : q.data?.kind === "default-body"
        ? "기본 체형"
        : "관절 기반";
  const caption = `${provenance} · 정면 ${SCOPE_LABELS[scope]} 참고`;
  return (
    <div className={className}>
      {q.data ? (
        inFloatingBar ? (
          <CompactPoseImage
            src={q.data.url}
            alt={`${candidate.rank}번 ${q.data.kind === "default-body" ? "기본 체형 포즈 참고" : "관절 기반 포즈 참고"}`}
          />
        ) : (
          <img
            src={q.data.url}
            alt={q.data.kind === "default-body" ? "기본 체형 포즈 참고" : "관절 기반 포즈 참고"}
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
          {q.error ? "참고 이미지를 불러오지 못했어요" : "포즈 이미지 불러오는 중…"}
        </div>
      )}
      <p title={caption} className="truncate whitespace-nowrap text-[11px] text-text-secondary">
        {caption}
      </p>
      {!inFloatingBar && (
        <p className="text-[11px] text-text-secondary">선택 체형·손·검색 시점 미적용</p>
      )}
    </div>
  );
}
