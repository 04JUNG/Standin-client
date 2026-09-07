import { PersonStanding } from "lucide-react";
import { cn } from "@/shared/lib/cn";
import { previewFor } from "../lib/previewImages";
import type { ModelCharacter } from "../api/models.contract";

/**
 * 모델 미리보기 그림. 커밋된 PNG → 서버 previewUrl → 플레이스홀더 순으로 내려간다.
 * 깨진 <img>를 보여주지 않는다 — 그림이 없는 것과 로딩에 실패한 것은 화면에서 같아야 한다.
 */
export function ModelPreview({
  character,
  className,
  iconClassName,
}: {
  character: ModelCharacter;
  className?: string;
  iconClassName?: string;
}) {
  const src = previewFor(character.characterId) ?? character.previewUrl ?? null;

  return (
    <div
      className={cn(
        "flex items-center justify-center overflow-hidden rounded-lg bg-brand-paper",
        className,
      )}
    >
      {src ? (
        <img src={src} alt="" aria-hidden className="h-full w-full object-contain" />
      ) : (
        <PersonStanding
          className={cn("text-brand-ink/40", iconClassName ?? "h-8 w-8")}
          aria-hidden
        />
      )}
    </div>
  );
}
