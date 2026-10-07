import { useQuery } from "@tanstack/react-query";
import { candidateThumbnailOptions } from "../api/candidateThumbnail";
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
  candidate: PoseCandidate;
  isSelected: boolean;
  onSelect(): void;
};

export function PoseCandidateCard({ candidate, isSelected, onSelect }: PoseCandidateCardProps) {
  const preview = useQuery(candidateThumbnailOptions(candidate.deferredThumbnailUrl));
  const imageUrl = candidate.thumbnailUrl || preview.data;
  const pending = !!candidate.deferredThumbnailUrl && preview.isPending;
  const failed = !!candidate.deferredThumbnailUrl && preview.isError;
  return (
    <button
      type="button"
      onClick={failed ? () => { void preview.refetch(); } : onSelect}
      disabled={pending}
      aria-busy={pending}
      aria-pressed={isSelected}
      className={cn(
        "flex flex-col overflow-hidden rounded-xl border-2 bg-surface-0 text-left transition-colors",
        isSelected ? "border-brand-coral" : "border-border hover:border-brand-sky",
      )}
    >
      {imageUrl ? (
        <img src={imageUrl} alt={candidate.title} className="aspect-square w-full object-cover" />
      ) : (
        <div className="flex aspect-square w-full items-center justify-center bg-surface-2 text-text-secondary">
          {pending ? (
            <span className="flex flex-col items-center gap-2 text-xs" role="status">
              <LoaderCircle className="h-6 w-6 animate-spin" aria-hidden />각도 맞추는 중
            </span>
          ) : failed ? (
            <span className="text-xs">미리보기 다시 시도</span>
          ) : <ImageOff className="h-8 w-8" aria-hidden />}
        </div>
      )}
      <div className="flex flex-col gap-2 p-3">
        <div className="flex items-center justify-between">
          <span className="text-[13px] font-semibold text-text-primary">
            {candidate.rank}. {candidate.title}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-1">
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-semibold",
              MATCH_BADGE_CLASS[candidate.matchLevel],
            )}
          >
            {candidate.matchLevel === "low" && <Info className="h-3 w-3" aria-hidden />}
            {MATCH_LABEL[candidate.matchLevel]}
          </span>
          {candidate.tags.map((tag) => (
            <span key={tag} className="rounded bg-surface-2 px-1.5 py-0.5 text-[11px] text-text-secondary">
              {tag}
            </span>
          ))}
        </div>
      </div>
    </button>
  );
}
