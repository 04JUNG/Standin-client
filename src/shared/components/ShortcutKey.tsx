import { cn } from "@/shared/lib/cn";
import { toDisplayKeys } from "@/shared/lib/accelerator";
import { isMac } from "@/shared/lib/platform";
import type { Accelerator } from "@/shared/types/shortcuts";

type ShortcutKeyProps = {
  accelerator: Accelerator;
  /** 전역 등록 실패 등으로 지금은 동작하지 않는 키를 흐리게 표시한다. */
  muted?: boolean;
  className?: string;
  title?: string;
};

/**
 * 단축키 표시(docs/04 §5 "Code / shortcut: system monospace", docs/05 §6 ShortcutKey).
 * 화면에 현재 단축키를 노출하는 것이 docs/07 §7·docs/04 §13의 요구사항이다.
 */
export function ShortcutKey({ accelerator, muted, className, title }: ShortcutKeyProps) {
  const keys = toDisplayKeys(accelerator, isMac());
  if (keys.length === 0) return null;

  return (
    <span className={cn("inline-flex items-center gap-1", className)} title={title}>
      {keys.map((key, i) => (
        <kbd
          key={`${key}-${i}`}
          className={cn(
            "inline-flex h-[22px] min-w-[22px] items-center justify-center rounded",
            "border border-border bg-surface-2 px-1.5",
            "font-mono text-[11px] font-semibold leading-none",
            muted ? "text-text-secondary/60" : "text-text-secondary",
          )}
        >
          {key}
        </kbd>
      ))}
    </span>
  );
}
