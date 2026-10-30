import { useId } from "react";
import { MAX_OUTLINE_WIDTH, clampOutlineWidth } from "./outlineSettings";

/** Controlled and person-local. Pointer handlers keep viewer gestures outside the slider. */
export function OutlineThicknessControl({
  value,
  onChange,
}: {
  value: number;
  onChange: (width: number) => void;
}) {
  const id = useId();
  const width = clampOutlineWidth(value);
  return (
    <div className="space-y-2" onPointerDown={(e) => e.stopPropagation()}>
      <div className="flex items-center justify-between gap-3">
        <label htmlFor={id} className="text-sm font-semibold">
          외곽선 두께
        </label>
        <output htmlFor={id} className="text-xs tabular-nums">
          {width === 0 ? "꺼짐" : `${width.toFixed(2)} px`}
        </output>
      </div>
      <input
        id={id}
        type="range"
        min={0}
        max={MAX_OUTLINE_WIDTH}
        step={0.05}
        value={width}
        aria-valuetext={width === 0 ? "꺼짐" : `${width.toFixed(2)} 픽셀`}
        className="min-h-11 w-full accent-brand-ink"
        onChange={(e) => onChange(Number(e.currentTarget.value))}
      />
      <div className="flex items-center justify-between text-xs text-text-secondary">
        <span>검정 · 불투명도 고정 · 미리보기 전용</span>
        <button
          type="button"
          className="min-h-11 px-2 hover:text-text-primary focus-visible:outline"
          onClick={() => onChange(0)}
        >
          초기화
        </button>
      </div>
    </div>
  );
}
