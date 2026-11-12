import { useEffect, useId } from "react";
import { usePoseSelectionStore } from "../store/poseSelectionStore";
import { MAX_OUTLINE_WIDTH } from "./outlineSettings";

/** Width redraws immediately. A pointer/key gesture prepares only after it ends. */
export function OutlineControl({
  personIndex,
  compact = false,
}: {
  personIndex: number;
  compact?: boolean;
}) {
  const id = useId();
  const width = usePoseSelectionStore((s) => s.outlineByPerson[personIndex] ?? 0);
  const skin = usePoseSelectionStore((s) => s.skinByPerson[personIndex] ?? "default");
  const hasLines = skin.includes("guide") || skin.includes("muscle");
  const setWidth = usePoseSelectionStore((s) => s.setPersonOutline);
  const edit = (editing: boolean) =>
    usePoseSelectionStore.getState().setOutlineEditing(personIndex, editing);
  useEffect(
    () => () => usePoseSelectionStore.getState().setOutlineEditing(personIndex, false),
    [personIndex],
  );
  return (
    <div
      className={`flex items-center gap-2 text-xs ${compact ? "min-w-[150px] flex-1" : "px-2 py-2"}`}
    >
      <label htmlFor={id} className="shrink-0">
        외곽선
      </label>
      <input
        id={id}
        type="range"
        aria-label={`인물 ${personIndex + 1} 외곽선 굵기`}
        aria-valuetext={width === 0 ? "꺼짐" : `${width}`}
        min={0}
        max={MAX_OUTLINE_WIDTH}
        step={hasLines ? 2 : 0.05}
        value={width}
        className="h-[18px] min-w-0 flex-1 accent-brand-sky"
        onPointerDown={(event) => {
          event.stopPropagation();
          edit(true);
        }}
        onPointerUp={() => edit(false)}
        onPointerCancel={() => edit(false)}
        onLostPointerCapture={() => edit(false)}
        onKeyDown={(event) => {
          if (
            [
              "ArrowLeft",
              "ArrowRight",
              "ArrowUp",
              "ArrowDown",
              "Home",
              "End",
              "PageUp",
              "PageDown",
            ].includes(event.key)
          )
            edit(true);
        }}
        onKeyUp={() => edit(false)}
        onBlur={() => edit(false)}
        onChange={(event) => setWidth(personIndex, Number(event.target.value))}
      />
      <output className="w-8 text-right tabular-nums">
        {width === 0 ? "꺼짐" : width.toFixed(2)}
      </output>
    </div>
  );
}
