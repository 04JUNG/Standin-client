import { ShieldCheck, Wand2 } from "lucide-react";
import { cn } from "@/shared/lib/cn";

/**
 * 조정 결과 배지(FE-04).
 *
 * 스킵일 때 추론의 raw reason(`entangled_set`, `no_gain` 등)을 그대로 보여주지 않는다.
 * 작가에게는 "왜 알고리즘이 포기했는지"가 아니라 "무엇이 저장되는지"가 필요하다.
 */
type RefineBadgeProps = {
  refined: boolean;
  compact?: boolean;
};

export function RefineBadge({ refined, compact = false }: RefineBadgeProps) {
  const Icon = refined ? Wand2 : ShieldCheck;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-semibold",
        compact ? "text-[10px]" : "text-[11px]",
        refined ? "bg-brand-sky/20 text-text-primary" : "bg-surface-2 text-text-secondary",
      )}
    >
      <Icon className={compact ? "h-3 w-3" : "h-3.5 w-3.5"} aria-hidden />
      {refined ? "러프에 맞춰 조정됨" : "안전하게 원본 포즈를 유지했습니다"}
    </span>
  );
}
