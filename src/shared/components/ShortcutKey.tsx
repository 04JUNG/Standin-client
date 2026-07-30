import { cn } from "@/shared/lib/cn";
import { toDisplayKeys } from "@/shared/lib/accelerator";
import { isMac } from "@/shared/lib/platform";
import type { Accelerator } from "@/shared/types/shortcuts";

type ShortcutKeyProps = {
  accelerator: Accelerator;
  /** 전역 등록 실패 등으로 지금은 동작하지 않는 키를 흐리게 표시한다. */
  muted?: boolean;
  /** 바 모드처럼 폭이 좁은 곳에서 칩을 줄인다. 세 키 조합(Ctrl Shift O)이 버튼을 밀어내지 않게. */
  compact?: boolean;
  className?: string;
  title?: string;
};

/**
 * 단축키 표시(docs/04 §5 "Code / shortcut: system monospace", docs/05 §6 ShortcutKey).
 * 화면에 현재 단축키를 노출하는 것이 docs/07 §7·docs/04 §13의 요구사항이다.
 */
export function ShortcutKey({ accelerator, muted, compact, className, title }: ShortcutKeyProps) {
  const keys = toDisplayKeys(accelerator, isMac());
  if (keys.length === 0) return null;

  return (
    <span
      className={cn("inline-flex shrink-0 items-center", compact ? "gap-0.5" : "gap-1", className)}
      title={title}
    >
      {keys.map((key, i) => (
        <kbd
          key={`${key}-${i}`}
          className={cn(
            "inline-flex items-center justify-center rounded",
            "border border-border bg-surface-2",
            compact
              ? "h-[18px] min-w-[18px] px-1 text-[10px]"
              : "h-[22px] min-w-[22px] px-1.5 text-[11px]",
            "font-mono font-semibold leading-none",
            muted ? "text-text-secondary/60" : "text-text-secondary",
          )}
        >
          {key}
        </kbd>
      ))}
    </span>
  );
}
