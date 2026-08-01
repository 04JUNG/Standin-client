import { forwardRef, type ButtonHTMLAttributes } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/shared/lib/cn";

type Variant = "primary" | "secondary" | "ghost";
type Size = "sm" | "md" | "lg";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
};

const variantClass: Record<Variant, string> = {
  primary: "bg-brand-coral text-white hover:bg-brand-coral-dark disabled:opacity-50",
  secondary:
    "bg-surface-0 text-text-primary border border-border hover:bg-surface-2 disabled:opacity-50",
  ghost: "bg-transparent text-text-primary hover:bg-surface-2 disabled:opacity-50",
};

const sizeClass: Record<Size, string> = {
  // 바 모드처럼 폭이 좁은 곳(420px 안에 버튼 두 개)용. 아이콘·라벨·단축키 칩이 한 줄에 들어간다.
  sm: "h-8 gap-1.5 px-2 text-[13px]",
  md: "h-btn gap-2 px-4 text-[14px]",
  lg: "h-btn-lg gap-2 px-6 text-[15px]",
};

/** 공통 버튼. hover/focus/disabled/loading 상태를 모두 지원(CLAUDE.md §11). */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = "primary", size = "md", loading, disabled, className, children, ...rest }, ref) => {
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        className={cn(
          // 라벨은 줄바꿈하지 않는다 — 좁은 바에서 "다른 폴더"가 두 줄로 깨졌다.
          "inline-flex items-center justify-center whitespace-nowrap rounded-lg font-semibold",
          "transition-colors focus-visible:outline-none disabled:cursor-not-allowed",
          variantClass[variant],
          sizeClass[size],
          className,
        )}
        {...rest}
      >
        {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
        {children}
      </button>
    );
  },
);
Button.displayName = "Button";
