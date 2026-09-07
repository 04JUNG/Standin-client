import { NavLink } from "react-router-dom";
import { cn } from "@/shared/lib/cn";
import type { ModelCharacter } from "../api/models.contract";
import { useSelectedModel } from "../hooks/useSelectedModel";
import { ModelPreview } from "./ModelPreview";

/** 타일로 다 보여줄 수 있는 개수. 넘으면 현재 선택만 보이고 모델 화면으로 보낸다. */
const INLINE_LIMIT = 3;

/**
 * 홈과 입력 미리보기의 모델 선택.
 *
 * 캡처·업로드가 화면에서 가장 강해야 하므로(CLAUDE.md §11) 타일은 작고 보조적으로 둔다.
 */
export function ModelSelect({ variant = "row" }: { variant?: "row" | "stacked" }) {
  const { characters, isPending, selectedId, select } = useSelectedModel();

  if (isPending) {
    return (
      <div
        aria-hidden
        className={cn(
          "grid gap-2",
          variant === "row" ? "grid-cols-2 sm:grid-cols-3" : "grid-cols-1",
        )}
      >
        {[0, 1].map((key) => (
          <div key={key} className="h-[52px] animate-pulse rounded-lg bg-surface-2" />
        ))}
      </div>
    );
  }

  const overflow = characters.length > INLINE_LIMIT;
  const visible = overflow
    ? characters.filter((item) => item.characterId === selectedId)
    : characters;

  return (
    <div
      role="radiogroup"
      aria-label="저장할 모델"
      className={cn("grid gap-2", variant === "row" ? "grid-cols-2 sm:grid-cols-3" : "grid-cols-1")}
    >
      {visible.map((character) => (
        <ModelTile
          key={character.characterId}
          character={character}
          selected={character.characterId === selectedId}
          onSelect={select}
        />
      ))}
      {overflow && (
        <NavLink
          to="/app/models"
          className={cn(
            "flex items-center justify-center rounded-lg border border-border px-3 py-2",
            "text-[13px] font-semibold text-text-secondary transition-colors",
            "hover:bg-surface-1 hover:text-text-primary",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-sky",
          )}
        >
          모델 전체 보기
        </NavLink>
      )}
    </div>
  );
}

function ModelTile({
  character,
  selected,
  onSelect,
}: {
  character: ModelCharacter;
  selected: boolean;
  onSelect(characterId: string): void;
}) {
  const locked = character.availability !== "available";
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      aria-disabled={locked || undefined}
      disabled={locked}
      title={locked ? "아직 준비 중인 모델입니다." : character.displayName}
      onClick={() => onSelect(character.characterId)}
      className={cn(
        "flex items-center gap-2 rounded-lg border p-2 text-left transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-sky",
        locked
          ? "cursor-not-allowed border-border bg-surface-0 opacity-60"
          : "bg-surface-0 hover:border-brand-sky/60",
        selected && !locked ? "border-brand-sky bg-brand-sky/5" : "border-border",
      )}
    >
      <ModelPreview character={character} className="h-9 w-9 shrink-0" iconClassName="h-5 w-5" />
      <span className="min-w-0">
        <span className="block truncate text-[13px] font-medium text-text-primary">
          {character.displayName}
        </span>
        {locked && <span className="block text-[11px] text-text-secondary">준비 중</span>}
      </span>
    </button>
  );
}
