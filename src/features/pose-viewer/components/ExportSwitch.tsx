import { cn } from "@/shared/lib/cn";

/**
 * 이 인물을 내보내기에 포함할지. 끄면 포즈를 고르지 않아도 진행할 수 있고, 확인·저장 화면에도
 * 나오지 않는다. 한 명 이상은 켜져 있어야 진행된다(버튼 상태로 알린다).
 */
export function ExportSwitch({
  personIndex,
  included,
  onChange,
  className,
  label,
}: {
  personIndex: number;
  included: boolean;
  onChange(included: boolean): void;
  className?: string;
  label?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={included}
      aria-label={label ?? `인물 ${personIndex + 1} 내보내기에 포함`}
      title={included ? "끄면 이 인물은 저장하지 않아요" : "켜면 이 인물도 저장해요"}
      onClick={(e) => {
        // 접힌 인물 줄은 줄 전체가 버튼이다. 스위치를 눌렀을 때 줄이 펼쳐지지 않게 한다.
        e.stopPropagation();
        onChange(!included);
      }}
      onKeyDown={(e) => e.stopPropagation()}
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full py-0.5 pl-0.5 pr-1.5 text-[11.5px] font-semibold",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-sky",
        included ? "text-text-primary" : "text-text-secondary",
        className,
      )}
    >
      <span
        aria-hidden
        className={cn(
          "relative h-4 w-7 rounded-full transition-colors",
          included ? "bg-[#1f8a5b]" : "bg-[#c5ccd6]",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 h-3 w-3 rounded-full bg-white transition-[left]",
            included ? "left-[14px]" : "left-0.5",
          )}
        />
      </span>
      {label ?? (included ? "내보내기 포함" : "내보내기 제외")}
    </button>
  );
}

/** 끈 인물의 후보 위에 덮는 안내. 원본 패널은 가리지 않는다. */
export function ExcludedOverlay({
  onInclude,
  compact,
  personIndex,
}: {
  onInclude(): void;
  compact?: boolean;
  personIndex?: number;
}) {
  return (
    <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 rounded-xl bg-[color-mix(in_srgb,var(--surface-1)_90%,transparent)] p-3 text-center">
      <p
        className={cn("font-semibold text-text-primary", compact ? "text-[12.5px]" : "text-[14px]")}
      >
        {personIndex === undefined
          ? "내보내기에서 제외한 인물이에요"
          : `인물 ${personIndex + 1} 선택이 꺼져 있어요`}
      </p>
      <p className="text-[11.5px] text-text-secondary">
        이 인물은 저장하지 않아요. 포즈를 고르지 않아도 돼요.
      </p>
      <button
        type="button"
        onClick={onInclude}
        className="h-7 rounded-md border border-border bg-surface-0 px-3 text-[12px] font-semibold text-text-primary hover:border-brand-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-sky"
      >
        {personIndex === undefined ? "내보내기에 포함" : `인물 ${personIndex + 1} 선택`}
      </button>
    </div>
  );
}
