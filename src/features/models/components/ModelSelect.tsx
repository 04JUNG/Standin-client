import { NavLink } from "react-router-dom";
import { cn } from "@/shared/lib/cn";
import type { ModelCharacter } from "../api/models.contract";
import { useSelectedModel } from "../hooks/useSelectedModel";
import { ModelPreview } from "./ModelPreview";

/** 타일로 다 보여줄 수 있는 개수. 넘으면 현재 선택만 보이고 모델 화면으로 보낸다. */
const INLINE_LIMIT = 3;

type Props = {
  variant?: "row" | "stacked" | "compact";
  /**
   * 제어 모드. 주면 이 값을 읽고 `onChange`로만 바꾼다(인물별 선택).
   * 안 주면 전역 기본값(`modelStore`)을 읽고 쓴다.
   */
  value?: string | null;
  onChange?: (characterId: string) => void;
  /** 접근성 라벨. 한 화면에 여러 개가 있으면 서로 구분돼야 한다. */
  label?: string;
};

/**
 * 모델 선택. 기본값을 정하는 자리(입력 미리보기)와 인물별로 고르는 자리(후보 화면)가
 * 같은 컴포넌트를 쓰고 제어 여부만 다르다.
 *
 * 만들 수 없는 체형(`coming_soon`)은 **아예 보여주지 않는다.** 고를 수 없는 카드를 띄워
 * 두면 화면만 복잡해지고, 서버가 모델 선택 자체를 제공하지 않는 경우는 모델 화면의
 * 배너가 따로 설명한다.
 */
export function ModelSelect({ variant = "row", value, onChange, label = "저장할 모델" }: Props) {
  const { characters, isPending, selectedId: globalId, select } = useSelectedModel();

  const controlled = onChange !== undefined;
  const currentId = controlled ? (value ?? globalId) : globalId;
  const choose = controlled ? onChange! : select;

  const compact = variant === "compact";
  const grid =
    variant === "stacked"
      ? "grid-cols-1"
      : compact
        ? "grid-flow-col auto-cols-max"
        : "grid-cols-2 sm:grid-cols-3";

  if (isPending) {
    return (
      <div aria-hidden className={cn("grid gap-2", grid)}>
        {[0, 1].map((key) => (
          <div
            key={key}
            className={cn(
              "animate-pulse rounded-lg bg-surface-2",
              compact ? "h-8 w-24" : "h-[52px]",
            )}
          />
        ))}
      </div>
    );
  }

  const usable = characters.filter((item) => item.availability === "available");
  if (usable.length <= 1) return null; // 고를 것이 하나뿐이면 선택지를 띄울 이유가 없다

  const overflow = usable.length > INLINE_LIMIT;
  const visible = overflow ? usable.filter((item) => item.characterId === currentId) : usable;

  return (
    <div role="radiogroup" aria-label={label} className={cn("grid gap-2", grid)}>
      {visible.map((character) => (
        <ModelTile
          key={character.characterId}
          character={character}
          selected={character.characterId === currentId}
          compact={compact}
          onSelect={choose}
        />
      ))}
      {overflow && (
        <NavLink
          to="/app/models"
          className={cn(
            "flex items-center justify-center rounded-lg border border-border px-3",
            compact ? "h-8 text-[12px]" : "py-2 text-[13px]",
            "font-semibold text-text-secondary transition-colors",
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
  compact,
  onSelect,
}: {
  character: ModelCharacter;
  selected: boolean;
  compact: boolean;
  onSelect(characterId: string): void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      title={character.displayName}
      onClick={() => onSelect(character.characterId)}
      className={cn(
        "flex items-center gap-2 rounded-lg border text-left transition-colors",
        compact ? "h-8 px-2" : "p-2",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-sky",
        "bg-surface-0 hover:border-brand-sky/60",
        selected ? "border-brand-sky bg-brand-sky/5" : "border-border",
      )}
    >
      <ModelPreview
        character={character}
        className={compact ? "h-6 w-6 shrink-0" : "h-9 w-9 shrink-0"}
        iconClassName={compact ? "h-3.5 w-3.5" : "h-5 w-5"}
      />
      <span
        className={cn(
          "min-w-0 truncate font-medium text-text-primary",
          compact ? "text-[12px]" : "text-[13px]",
        )}
      >
        {character.displayName}
      </span>
    </button>
  );
}
