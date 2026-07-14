import { forwardRef, useId, type InputHTMLAttributes } from "react";
import { cn } from "@/shared/lib/cn";

type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  label?: string;
  error?: string;
};

/** 공통 입력. label/error를 접근성 속성과 함께 연결한다(docs/04 §13). */
export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, id, className, ...rest }, ref) => {
    const generatedId = useId();
    const inputId = id ?? generatedId;
    const errorId = `${inputId}-error`;

    return (
      <div className="flex flex-col gap-1">
        {label && (
          <label htmlFor={inputId} className="text-[13px] font-semibold text-text-secondary">
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          className={cn(
            "h-input rounded-lg border bg-surface-0 px-3 text-[14px] text-text-primary",
            "placeholder:text-text-secondary focus-visible:outline-none",
            "focus-visible:ring-2 focus-visible:ring-brand-sky",
            error ? "border-brand-coral" : "border-border",
            className,
          )}
          {...rest}
        />
        {error && (
          <p id={errorId} className="text-[12px] text-brand-coral">
            {error}
          </p>
        )}
      </div>
    );
  },
);
Input.displayName = "Input";
