import { AlertTriangle, Info } from "lucide-react";
import { cn } from "@/shared/lib/cn";
import type { PersonResult } from "../api/pose.contract";

/**
 * 인물 단위 폴백 안내(FE-02).
 *
 * 앱 모드와 바 모드가 같은 문구를 쓴다 — 어디서 봤는지에 따라 경고가 달라지면 작가가
 * 같은 결과를 다르게 판단한다.
 *
 * raw distance나 quality_trace는 노출하지 않는다. 작가가 판단에 쓸 수 있는 정보가 아니다.
 */
const NOTICE: Record<"soft" | "hard", { text: string; tone: "warn" | "info" }> = {
  soft: {
    text: "스켈레톤 인식이 불확실해 참고용 후보입니다. 보정이 필요할 수 있습니다.",
    tone: "info",
  },
  hard: {
    text: "이 인물에 맞는 포즈 후보를 찾지 못했습니다.",
    tone: "warn",
  },
};

type PersonFallbackNoticeProps = {
  person: Pick<PersonResult, "fallbackMode">;
  /** 바 모드는 폭이 좁아 더 작은 글자를 쓴다. */
  compact?: boolean;
};

export function PersonFallbackNotice({ person, compact = false }: PersonFallbackNoticeProps) {
  if (person.fallbackMode === "none") return null;

  const { text, tone } = NOTICE[person.fallbackMode];
  const Icon = tone === "warn" ? AlertTriangle : Info;
  return (
    <p
      role="status"
      className={cn(
        "flex items-start gap-1.5 rounded-lg px-2 py-1.5",
        compact ? "text-[11px]" : "text-[12px]",
        tone === "warn"
          ? "bg-brand-coral/10 text-brand-coral"
          : "bg-surface-2 text-text-secondary",
      )}
    >
      <Icon className={cn("mt-px shrink-0", compact ? "h-3 w-3" : "h-3.5 w-3.5")} aria-hidden />
      <span>{text}</span>
    </p>
  );
}
