import { OutlineControl } from "../outline/OutlineControl";
import { SkinControl } from "../skin/SkinControl";
import { SKIN_CHOICES } from "../skin/skinChoices";

/** Choose before preparing the final FBX; review pages only display these choices. */
export function CandidateAppearanceControls({
  personIndex,
  compact = false,
}: {
  personIndex: number;
  compact?: boolean;
}) {
  return (
    <div
      aria-label={`인물 ${personIndex + 1} 스킨·외곽선 설정`}
      title="선택한 스킨·외곽선은 최종 확인과 FBX 저장에 적용돼요."
      className={
        compact
          ? "flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-border bg-surface-1 px-2 py-1.5"
          : undefined
      }
    >
      <SkinControl
        compact={compact}
        personIndex={personIndex}
        available={SKIN_CHOICES.map((choice) => choice.id)}
      />
      <OutlineControl personIndex={personIndex} compact={compact} />
      {!compact && (
        <p className="px-2 text-[10px] text-text-secondary">
          선택한 스킨·외곽선은 최종 확인과 FBX 저장에 적용돼요.
        </p>
      )}
    </div>
  );
}
