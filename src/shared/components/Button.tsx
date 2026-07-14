import { forwardRef, type ButtonHTMLAttributes } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/shared/lib/cn";

type Variant = "primary" | "secondary" | "ghost";
type Size = "md" | "lg";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
};

const variantClass: Record<Variant, string> = {
  primary:
    "bg-brand-coral text-white hover:bg-brand-coral-dark disabled:opacity-50",
  secondary:
    "bg-surface-0 text-text-primary border border-border hover:bg-surface-2 disabled:opacity-50",
  ghost:
    "bg-transparent text-text-primary hover:bg-surface-2 disabled:opacity-50",
};

const sizeClass: Record<Size, string> = {
  md: "h-btn px-4 text-[14px]",
  lg: "h-btn-lg px-6 text-[15px]",
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
          "inline-flex items-center justify-center gap-2 rounded-lg font-semibold",
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
