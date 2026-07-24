import { ImageOff, Info } from "lucide-react";
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
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={isSelected}
      className={cn(
        "flex flex-col overflow-hidden rounded-xl border-2 bg-surface-0 text-left transition-colors",
        isSelected ? "border-brand-coral" : "border-border hover:border-brand-sky",
      )}
    >
      {candidate.thumbnailUrl ? (
        <img src={candidate.thumbnailUrl} alt={candidate.title} className="aspect-square w-full object-cover" />
      ) : (
        <div className="flex aspect-square w-full items-center justify-center bg-surface-2 text-text-secondary">
          <ImageOff className="h-8 w-8" aria-hidden />
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
