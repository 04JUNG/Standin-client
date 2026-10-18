import { reviewOnly } from "../api/routedSearch";
import { useQuery } from "@tanstack/react-query";
import {
  candidateThumbnailOptions,
  quickCandidateThumbnailOptions,
} from "../api/candidateThumbnail";
import { ImageOff, Info, LoaderCircle } from "lucide-react";
import { cn } from "@/shared/lib/cn";
import type { MatchLevel, PoseCandidate } from "../api/pose.contract";

/** 후보 카드(docs/03 §7, docs/01 §6 권장 문구). */
const MATCH_LABEL: Record<MatchLevel, string> = {
  high: "높은 일치",
  medium: "유사",
  low: "보정 필요",
};

const MATCH_BADGE_CLASS: Record<MatchLevel, string> = {
  high: "bg-brand-sky/20 text-text-primary",
  medium: "bg-surface-2 text-text-secondary",
  low: "bg-brand-coral/15 text-brand-coral",
};

type PoseCandidateCardProps = {
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

export function PoseCandidateCard({
  candidate,
  bodyPreview,
  characterId,
  isSelected,
  onSelect,
  layout = "default",
  disabled,
}: PoseCandidateCardProps) {
  const fill = layout === "fill";
  const preview = useQuery(
    !bodyPreview && !characterId && candidate.quickThumbnailUrl
      ? quickCandidateThumbnailOptions(candidate.quickThumbnailUrl)
      : candidateThumbnailOptions(
          bodyPreview ? undefined : candidate.deferredThumbnailUrl,
          candidate.previewModel,
          characterId ?? undefined,
        ),
  );
  const imageUrl = bodyPreview
    ? bodyPreview.url
    : characterId
      ? preview.data
      : candidate.thumbnailUrl || preview.data;
  const pending = bodyPreview
    ? bodyPreview.pending
    : !!candidate.deferredThumbnailUrl && preview.isPending;
  const failed = !bodyPreview && !!candidate.deferredThumbnailUrl && preview.isError;
  return (
    <button
      data-pose-candidate
      type="button"
      onClick={
        failed
          ? () => {
              void preview.refetch();
            }
          : onSelect
      }
      disabled={pending || disabled}
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
              {candidate.quickThumbnailUrl ? "미리보기 불러오는 중" : "각도 맞추는 중"}
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
            {reviewOnly(candidate)
              ? "검수용 · 보정·저장 불가"
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
