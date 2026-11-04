import { ExpandablePose } from "../interactive/InteractivePose";
import { useThumbnailJourney } from "@/features/analytics/useThumbnailJourney";
import { reviewOnly, canRelease } from "../api/routedSearch";
import { useDefaultPosePoster } from "../api/posePoster";
import { ImageOff, Info, LoaderCircle } from "lucide-react";
import { cn } from "@/shared/lib/cn";
import type { MatchLevel, PoseCandidate } from "../api/pose.contract";

/** 후보 카드(docs/03 §7, docs/01 §6 권장 문구). */
const MATCH_LABEL: Record<MatchLevel, string> = {
  high: "많이 비슷함",
  medium: "유사",
  low: "조정이 필요할 수 있어요",
};

const MATCH_BADGE_CLASS: Record<MatchLevel, string> = {
  high: "bg-brand-sky/20 text-text-primary",
  medium: "bg-surface-2 text-text-secondary",
  low: "bg-brand-coral/15 text-brand-coral",
};

type PoseCandidateCardProps = {
  jobId?: string;
  bodyPreview?: { url?: string; pending: boolean };
  candidate: PoseCandidate;
  characterId?: string | null;
  isSelected: boolean;
  onSelect(): void;
  /**
   * `fill`: 높이가 정해진 칸(바의 3×2 그리드)을 채운다. 이미지가 남는 높이를 쓰고
   * 태그는 생략한다. 기본은 정사각 이미지와 태그를 모두 보인다.
   */
  layout?: "default" | "fill";
  disabled?: boolean;
};

export function PoseCandidateCard(props: PoseCandidateCardProps) {
  if (props.candidate.interactivePreview && !props.candidate.semantic)
    return <InteractiveCandidateCard {...props} />;
  return <PosterCandidateCard {...props} />;
}
function InteractiveCandidateCard({
  candidate,
  jobId,
  isSelected,
  onSelect,
  layout,
  disabled,
}: PoseCandidateCardProps) {
  const fill = layout === "fill";
  return (
    <div
      data-pose-candidate
      id={`pose-candidate-${candidate.id}`}
      className={cn(
        "flex w-full flex-col overflow-hidden rounded-xl border-2 bg-surface-0",
        isSelected ? "border-brand-coral" : "border-border",
        fill && "h-full min-h-0",
      )}
    >
      <div className={cn("w-full", fill ? "min-h-0 flex-1" : "aspect-square")}>
        <ExpandablePose
          asset={candidate.interactivePreview?.asset}
          viewKey={`${jobId ?? "sample"}:${candidate.id}`}
        />
      </div>
      <div
        className={cn(
          "relative z-[20] flex shrink-0 flex-col bg-surface-0",
          fill ? "gap-1 px-2 py-1.5" : "gap-2 p-3",
        )}
      >
        <span className="shrink-0 whitespace-nowrap text-[12px] font-semibold">
          {candidate.rank}. {candidate.title}
        </span>
        {!fill && (
          <span className="text-[11px] text-text-secondary">{candidate.tags.join(" · ")}</span>
        )}
        <button
          type="button"
          disabled={disabled || !canRelease(candidate)}
          aria-pressed={isSelected}
          onClick={onSelect}
          className={cn(
            "w-full rounded-md border py-1 text-[12px] font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-sky disabled:opacity-40",
            isSelected
              ? "border-brand-coral bg-brand-coral text-white"
              : "border-border hover:bg-surface-2",
          )}
        >
          {isSelected ? "선택됨" : "이 포즈 선택"}
        </button>
      </div>
    </div>
  );
}
function PosterCandidateCard({
  jobId,
  candidate,
  bodyPreview,
  characterId,
  isSelected,
  onSelect,
  layout = "default",
  disabled,
}: PoseCandidateCardProps) {
  const fill = layout === "fill";
  // Card identity is independent of the selected body. Only final review and
  // explicit detail may load the chosen-body artifact.
  void characterId;
  const preview = useDefaultPosePoster({
    url: candidate.posterUrl,
    scope: candidate.posterScope,
    source: candidate.sourceBvhSha256 ?? candidate.previewModel?.sourceSha,
    fallbackUrl: candidate.quickThumbnailUrl,
    directional: candidate.source !== "generation",
  });
  const imageUrl = preview.data?.url || candidate.thumbnailUrl;
  const pending = !imageUrl && preview.isPending;
  const failed = !imageUrl && preview.isError;
  const reportThumbnailFailure = useThumbnailJourney(
    jobId,
    candidate.id,
    failed,
    imageUrl,
    preview.error,
  );
  void bodyPreview;
  return (
    <button
      data-pose-candidate
      id={`pose-candidate-${candidate.id}`}
      type="button"
      onClick={
        failed
          ? () => {
              void preview.refetch();
            }
          : onSelect
      }
      disabled={pending || disabled || !canRelease(candidate)}
      aria-busy={pending}
      aria-pressed={isSelected}
      className={cn(
        "flex w-full flex-col overflow-hidden rounded-xl border-2 bg-surface-0 text-left transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-sky",
        isSelected ? "border-brand-coral" : "border-border hover:border-brand-sky",
        fill && "h-full min-h-0",
      )}
    >
      {imageUrl ? (
        <img
          src={imageUrl}
          onError={reportThumbnailFailure}
          onLoad={reportThumbnailFailure.onLoad}
          alt={candidate.title}
          className={cn(
            "w-full object-contain",
            fill ? "min-h-0 flex-1 bg-surface-2" : "aspect-square",
          )}
        />
      ) : (
        <div
          className={cn(
            "flex w-full items-center justify-center bg-surface-2 text-text-secondary",
            fill ? "min-h-0 flex-1" : "aspect-square",
          )}
        >
          {pending ? (
            <span className="flex flex-col items-center gap-2 text-xs" role="status">
              <LoaderCircle className="h-6 w-6 animate-spin" aria-hidden />
              포즈 이미지 불러오는 중
            </span>
          ) : failed ? (
            <span className="text-xs">미리보기 다시 시도</span>
          ) : (
            <ImageOff className="h-8 w-8" aria-hidden />
          )}
        </div>
      )}
      <div className={cn("flex shrink-0 flex-col", fill ? "gap-1 px-2 py-1.5" : "gap-2 p-3")}>
        <div className="flex items-center justify-between">
          <span
            className={cn("font-semibold text-text-primary", fill ? "text-[12px]" : "text-[13px]")}
          >
            {candidate.rank}. {candidate.title}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-1">
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-semibold",
              candidate.semantic
                ? MATCH_BADGE_CLASS.medium
                : MATCH_BADGE_CLASS[candidate.matchLevel],
            )}
          >
            {candidate.matchLevel === "low" && <Info className="h-3 w-3" aria-hidden />}
            {candidate.manualExportAllowed
              ? "선택하고 확인 후 저장"
              : reviewOnly(candidate)
                ? "미리보기 전용"
                : candidate.semantic
                  ? "문장 검색"
                  : MATCH_LABEL[candidate.matchLevel]}
          </span>
          {!fill &&
            candidate.tags.map((tag) => (
              <span
                key={tag}
                className="rounded bg-surface-2 px-1.5 py-0.5 text-[11px] text-text-secondary"
              >
                {tag}
              </span>
            ))}
        </div>
      </div>
    </button>
  );
}
