import { usePoseSelectionStore } from "../store/poseSelectionStore";
import type { SkinId } from "./skinChoices";

type Base = "default" | "flesh";
type Lines = "none" | "guide" | "muscle";
function splitSkin(skin: SkinId): { base: Base; lines: Lines } {
  return {
    base: skin.startsWith("flesh") ? "flesh" : "default",
    lines: skin.endsWith("guide") ? "guide" : skin.endsWith("muscle") ? "muscle" : "none",
  };
}
function composeSkin(base: Base, lines: Lines): SkinId {
  if (lines === "guide") return base === "flesh" ? "flesh-guide" : "gray-guide";
  if (lines === "muscle") return base === "flesh" ? "flesh-muscle" : "muscle";
  return base;
}
/** Color and one optional line layer share the same final-export selection. */
export function SkinControl({
  personIndex,
  available,
  compact = false,
  unavailableReason,
}: {
  personIndex: number;
  available: readonly SkinId[];
  compact?: boolean;
  /** Why the other choices are off, shown on hover/focus of each disabled choice. */
  unavailableReason?: string;
}) {
  const selected = usePoseSelectionStore((s) => s.skinByPerson[personIndex] ?? "default");
  const width = usePoseSelectionStore((s) => s.outlineByPerson[personIndex] ?? 0);
  const choose = usePoseSelectionStore((s) => s.setPersonSkin);
  const { base, lines } = splitSkin(selected);
  const choices = [
    {
      label: "기본",
      active: base === "default",
      // Without gray line layers, 기본 always returns to the plain default skin.
      next: available.includes(composeSkin("default", lines))
        ? composeSkin("default", lines)
        : "default",
    },
    { label: "살색", active: base === "flesh", next: composeSkin("flesh", lines) },
    {
      label: "가이드선",
      active: lines === "guide",
      next: composeSkin(base, lines === "guide" ? "none" : "guide"),
    },
    {
      label: "근육선",
      active: lines === "muscle",
      next: composeSkin(base, lines === "muscle" ? "none" : "muscle"),
    },
  ];
  return (
    <div
      role="group"
      aria-label={`인물 ${personIndex + 1} 스킨`}
      className={`flex items-center gap-1 text-xs ${compact ? "flex-nowrap" : "flex-wrap px-2 py-2"}`}
    >
      <span className="mr-1 shrink-0">스킨</span>
      {choices.map(({ label, active, next }) => {
        const disabled = !active && next !== "default" && !available.includes(next);
        return (
          <button
            key={label}
            type="button"
            aria-pressed={active}
            disabled={disabled}
            title={disabled ? unavailableReason : undefined}
            className={`min-w-0 rounded-md border px-2 py-1 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-sky disabled:cursor-not-allowed disabled:opacity-40 ${active ? "border-brand-coral text-brand-coral" : "border-border hover:bg-surface-2"}`}
            onClick={() => {
              if (next === "default" || available.includes(next)) {
                if (splitSkin(next).lines !== "none" && width > 0 && width < 2)
                  usePoseSelectionStore.getState().setPersonOutline(personIndex, 2);
                choose(personIndex, next);
              } else if (active && (label === "가이드선" || label === "근육선"))
                choose(personIndex, "default");
            }}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
