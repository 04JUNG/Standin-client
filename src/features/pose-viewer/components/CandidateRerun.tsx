import { RotateCw } from "lucide-react";
import { cn } from "@/shared/lib/cn";

export function CandidateRerunTile({
  onRerun,
  className,
}: {
  onRerun(): void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onRerun}
      className={cn(
        "flex h-full flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-border text-center",
        "transition-colors hover:border-brand-ink hover:bg-surface-0",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-sky",
        className,
      )}
    >
      <RotateCw className="h-4 w-4" aria-hidden />
      <span className="text-[12.5px] font-semibold text-text-primary">후보 다시 찾기</span>
      <span className="text-[10.5px] text-text-secondary">다른 포즈 5개를 더 찾아요</span>
    </button>
  );
}
