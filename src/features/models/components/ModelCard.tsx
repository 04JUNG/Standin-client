import { Check } from "lucide-react";
import { cn } from "@/shared/lib/cn";
import type { ModelCharacter } from "../api/models.contract";
import { ModelPreview } from "./ModelPreview";

const GENDER_LABEL: Record<ModelCharacter["gender"], string> = {
  male: "남성",
  female: "여성",
  unspecified: "",
};

/**
 * 카탈로그의 모델 한 장.
 *
 * 아직 만들 수 없는 체형은 **누를 수 없다.** 눌리게 두면 고른 것과 다른 체형의 파일이
 * 저장되고, 그건 구현하지 않은 기능을 작동하는 것처럼 보이게 하는 일이다(CLAUDE.md §10).
 */
export function ModelCard({
  character,
  selected,
  onSelect,
}: {
  character: ModelCharacter;
  selected: boolean;
  onSelect(characterId: string): void;
}) {
  const locked = character.availability !== "available";
  const gender = GENDER_LABEL[character.gender];

  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      aria-disabled={locked || undefined}
      disabled={locked}
      onClick={() => onSelect(character.characterId)}
      className={cn(
        "flex flex-col gap-2 rounded-xl border p-3 text-left transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-sky",
        locked
          ? "cursor-not-allowed border-border bg-surface-0 opacity-60"
          : "bg-surface-0 hover:border-brand-sky/60",
        selected && !locked ? "border-brand-sky bg-brand-sky/5" : "border-border",
      )}
    >
      <ModelPreview
        character={character}
        className="aspect-[3/4] w-full"
        iconClassName="h-12 w-12"
      />
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-[14px] font-semibold text-text-primary">
            {character.displayName}
          </div>
          {gender && <div className="text-[12px] text-text-secondary">{gender}</div>}
        </div>
        {locked ? (
          <span className="shrink-0 rounded bg-surface-2 px-1.5 py-0.5 text-[11px] font-semibold text-text-secondary">
            준비 중
          </span>
        ) : (
          selected && <Check className="h-4 w-4 shrink-0 text-brand-sky" aria-hidden />
        )}
      </div>
      {character.description && (
        <p className="text-[12px] text-text-secondary">{character.description}</p>
      )}
    </button>
  );
}
