import { useId } from "react";
import { usePoseSelectionStore } from "../store/poseSelectionStore";
import { SKIN_CHOICES, type SkinId } from "./skinChoices";

/** Only explicit server-supported choices can be selected; prior choices stay visible for recovery. */
export function SkinControl({
  personIndex,
  available,
}: {
  personIndex: number;
  available: readonly SkinId[];
}) {
  const id = useId();
  const selected = usePoseSelectionStore((s) => s.skinByPerson[personIndex] ?? "default");
  const choose = usePoseSelectionStore((s) => s.setPersonSkin);
  return (
    <div className="flex items-center gap-2 px-2 py-2 text-xs">
      <label htmlFor={id}>스킨</label>
      <select
        id={id}
        aria-label={`인물 ${personIndex + 1} 스킨`}
        className="min-w-0 flex-1 rounded border border-border bg-surface-0 px-2 py-1 text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-sky"
        value={selected}
        onChange={(event) => {
          const value = event.target.value as SkinId;
          if (value === "default" || available.includes(value)) choose(personIndex, value);
        }}
      >
        {SKIN_CHOICES.map(({ id: value, label }) => (
          <option
            key={value}
            value={value}
            disabled={value !== "default" && !available.includes(value)}
          >
            {label}
          </option>
        ))}
      </select>
    </div>
  );
}
