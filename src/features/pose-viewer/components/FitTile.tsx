import type { ReactNode } from "react";
import { cn } from "@/shared/lib/cn";

/** 카드 아래 라벨(제목·일치도) 높이. 그림은 정사각형으로 남는 칸을 쓴다. */
const LABEL = 46;

/**
 * 칸 크기와 상관없이 후보 카드 비율을 지킨다. 이미지는 정사각형, 아래 라벨은 고정 높이다.
 *
 * 칸을 size container로 두고 카드 한 변을 `min(칸 너비, 칸 높이 - 라벨)`로 정한다.
 * 창이 커지거나(브라우저·확대) 칸 모양이 달라져도 카드가 늘어나 찌그러지지 않는다.
 */
export function FitTile({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div
      className={cn(
        "flex min-h-0 min-w-0 items-center justify-center [container-type:size]",
        className,
      )}
    >
      <div
        style={{
          width: `min(100cqw, calc(100cqh - ${LABEL}px))`,
          height: `calc(min(100cqw, calc(100cqh - ${LABEL}px)) + ${LABEL}px)`,
        }}
      >
        {children}
      </div>
    </div>
  );
}
