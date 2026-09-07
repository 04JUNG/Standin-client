import { useNavigate } from "react-router-dom";
import { cn } from "@/shared/lib/cn";
import { useSelectedModel } from "../hooks/useSelectedModel";

/** 바에 나란히 놓을 수 있는 개수. 넘으면 현재 것만 두고 앱 창의 모델 화면으로 보낸다. */
const BAR_LIMIT = 2;

const PILL = cn(
  "flex h-[22px] min-w-0 flex-1 items-center justify-center rounded px-2",
  "text-[11px] font-semibold transition-colors",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-sky",
);

/**
 * 바의 모델 선택(ADR-008). 바는 좁아서 이름을 다 못 쓴다 — 짧은 라벨과 title로 간다.
 * 값은 앱 화면들과 같은 설정 스토어를 쓰므로 어디서 바꾸든 일치한다.
 */
export function BarModelSelect() {
  const navigate = useNavigate();
  const { characters, isPending, selectedId, select } = useSelectedModel();

  if (isPending || characters.length === 0) return null;

  const overflow = characters.length > BAR_LIMIT;
  const visible = overflow
    ? characters.filter((item) => item.characterId === selectedId)
    : characters;

  return (
    <div role="radiogroup" aria-label="저장할 모델" className="flex items-center gap-1">
      {visible.map((character) => {
        const locked = character.availability !== "available";
        const selected = character.characterId === selectedId;
        return (
          <button
            key={character.characterId}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-disabled={locked || undefined}
            disabled={locked}
            title={locked ? `${character.displayName} — 준비 중입니다.` : character.displayName}
            onClick={() => select(character.characterId)}
            className={cn(
              PILL,
              locked
                ? "cursor-not-allowed bg-surface-2 text-text-secondary opacity-60"
                : selected
                  ? "bg-brand-sky/20 text-brand-ink"
                  : "bg-surface-2 text-text-secondary hover:text-text-primary",
            )}
          >
            <span className="truncate">{character.displayName}</span>
          </button>
        );
      })}
      {overflow && (
        <button
          type="button"
          // 라우트가 창 모드의 진실 공급원이라(ADR-008) 이동만으로 앱 창이 복원된다.
          onClick={() => navigate("/app/models")}
          title="모델 전체 보기"
          className={cn(PILL, "max-w-[32px] flex-none bg-surface-2 text-text-secondary")}
        >
          …
        </button>
      )}
    </div>
  );
}
