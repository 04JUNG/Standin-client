import { useState } from "react";
import type { PoseCandidate } from "../api/pose.contract";
import { SourcePosePreview } from "./SourcePosePreview";
import { candidateLabel, usable } from "./contract";
import { cn } from "@/shared/lib/cn";
export function PreparedCandidateCard({
  candidate,
  isSelected,
  onSelect,
  disabled,
  layout,
}: {
  candidate: PoseCandidate;
  isSelected: boolean;
  onSelect(): void;
  disabled?: boolean;
  layout?: "default" | "fill";
}) {
  const prepared = candidate.prepared!;
  const asset = usable(prepared.status) ? prepared.previewAsset : undefined;
  const [framed, setFramed] = useState<string>();
  const displayed = !!asset && framed === prepared.contextHash;
  return (
    <div
      data-pose-candidate
      className={cn(
        "flex w-full flex-col overflow-hidden rounded-xl border-2 bg-surface-0",
        isSelected ? "border-brand-coral" : "border-border",
        layout === "fill" && "h-full min-h-0",
      )}
    >
      <div className={layout === "fill" ? "min-h-0 flex-1" : "aspect-square"}>
        {asset ? (
          <SourcePosePreview asset={asset} onFrame={() => setFramed(prepared.contextHash)} />
        ) : (
          <div className="flex h-full items-center justify-center p-3 text-center text-xs text-text-secondary">
            {candidateLabel(prepared)}
          </div>
        )}
      </div>
      <div className="relative z-[20] flex flex-col gap-1 bg-surface-0 p-2">
        <span className="text-xs font-semibold">
          {candidate.rank}. {candidate.title}
        </span>
        <span className="text-[11px] text-text-secondary">{candidateLabel(prepared)}</span>
        {prepared.qualityScope === "source_only" && (
          <span className="text-[10px] text-text-secondary">
            공통 인체로 본 동작 · 체형과 손은 선택 후 적용해요.
          </span>
        )}
        <button
          type="button"
          disabled={disabled || !displayed}
          aria-pressed={isSelected}
          onClick={onSelect}
          className={cn(
            "rounded-md border py-1 text-xs font-semibold disabled:opacity-40",
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
