import type { BodyScope } from "../api/outputScope";
import { OutlineControl } from "../outline/OutlineControl";
import { SkinControl } from "../skin/SkinControl";
import { SKIN_CHOICES, type SkinId } from "../skin/skinChoices";
import { SKIN_SCOPE_NOTE, skinSupportsScope } from "../skin/skinScope";

const ALL_SKINS = SKIN_CHOICES.map((choice) => choice.id);
const DEFAULT_ONLY: readonly SkinId[] = ["default"];

/** Choose before preparing the final FBX; review pages only display these choices. */
export function CandidateAppearanceControls({
  personIndex,
  scope,
  compact = false,
}: {
  personIndex: number;
  /** The person's resolved output scope; the server refuses skins on cropped scopes. */
  scope?: BodyScope;
  compact?: boolean;
}) {
  // Same rule as the BFF, so the choice is refused here instead of after preparation.
  const skinsOff = !!scope && !skinSupportsScope(scope);
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
        available={skinsOff ? DEFAULT_ONLY : ALL_SKINS}
        unavailableReason={skinsOff ? SKIN_SCOPE_NOTE : undefined}
      />
      {skinsOff && (
        <p
          role="note"
          className={
            compact
              ? "basis-full text-[10px] text-text-secondary"
              : "px-2 text-[11px] text-text-secondary"
          }
        >
          {SKIN_SCOPE_NOTE}
        </p>
      )}
      <OutlineControl personIndex={personIndex} compact={compact} />
      {!compact && (
        <p className="px-2 text-[10px] text-text-secondary">
          선택한 스킨·외곽선은 최종 확인과 FBX 저장에 적용돼요.
        </p>
      )}
    </div>
  );
}
