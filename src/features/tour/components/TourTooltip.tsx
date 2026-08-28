import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/shared/components/Button";
import { cn } from "@/shared/lib/cn";
import type { TourStep } from "../lib/resolveActiveStep";
import type { SpotlightRect } from "./TourSpotlight";

const WIDTH = 340;
const MARGIN = 16;
const GAP = 12;

type Placement = { top: number; left: number };

function place(rect: SpotlightRect | null, height: number): Placement {
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  // 강조할 요소가 없는 스텝(환영 카드 등)은 화면 가운데.
  if (!rect) {
    return { top: Math.max(MARGIN, (vh - height) / 2), left: Math.max(MARGIN, (vw - WIDTH) / 2) };
  }

  const below = rect.top + rect.height + GAP;
  const above = rect.top - GAP - height;
  // 아래가 기본. 넘치면 위로, 위도 좁으면 화면 안쪽으로 밀어 넣는다.
  let top = below;
  if (below + height > vh - MARGIN) top = above >= MARGIN ? above : vh - height - MARGIN;
  top = Math.max(MARGIN, top);

  const left = Math.min(Math.max(MARGIN, rect.left), vw - WIDTH - MARGIN);
  return { top, left: Math.max(MARGIN, left) };
}

type TourTooltipProps = {
  step: TourStep;
  rect: SpotlightRect | null;
  progress: { current: number; total: number };
  isLast: boolean;
  canGoBack: boolean;
  onBack(): void;
  onNext(): void;
  onFinish(): void;
  onDismiss(): void;
};

export function TourTooltip({
  step,
  rect,
  progress,
  isLast,
  canGoBack,
  onBack,
  onNext,
  onFinish,
  onDismiss,
}: TourTooltipProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(0);
  const [, bumpViewport] = useState(0);

  // 위/아래 배치를 정하려면 실제 높이가 필요하다. 내용이 바뀌는 것은 스텝이 바뀔 때뿐이라
  // 그때만 다시 잰다. 그리기 전에 재므로 위치가 어긋난 프레임이 보이지 않는다.
  useLayoutEffect(() => {
    setHeight(panelRef.current?.offsetHeight ?? 0);
  }, [step.id]);

  // 강조할 요소가 없는 스텝은 창 크기만으로 자리를 잡으므로 리사이즈를 직접 듣는다
  // (요소가 있는 스텝은 앵커 위치가 바뀌면서 어차피 다시 그려진다).
  useEffect(() => {
    const onResize = () => bumpViewport((n) => n + 1);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const { top, left } = place(rect, height);

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-live="polite"
      aria-label="앱 사용법 튜토리얼"
      // 포커스를 빼앗지 않는다. 사용자가 화면의 진짜 버튼을 눌러야 진행되는 스텝이 있어
      // 투어가 포커스를 가져가면 안 된다. Escape도 이 안에 포커스가 있을 때만 받는다.
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          onDismiss();
        }
      }}
      className={cn(
        "fixed z-[92] flex flex-col gap-3 rounded-2xl border border-border bg-surface-0 p-5",
        "shadow-xl",
      )}
      style={{ top, left, width: WIDTH }}
    >
      <div className="flex items-start justify-between gap-3">
        <span className="text-[12px] font-semibold text-text-secondary">
          {step.terminal ? "튜토리얼" : `${progress.current} / ${progress.total}`}
        </span>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="튜토리얼 그만두기"
          title="튜토리얼 그만두기"
          className={cn(
            "-mr-1 -mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-colors",
            "text-text-secondary hover:bg-surface-2 hover:text-text-primary",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-sky",
          )}
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>

      <div className="flex flex-col gap-1.5">
        <h2 className="text-[15px] font-bold text-text-primary">{step.title}</h2>
        <p className="text-[13px] leading-6 text-text-secondary">{step.body}</p>
      </div>

      {step.action && (
        // 알파 수식자(bg-brand-sky/15)는 브랜드색에서 클래스가 생성되지 않는다.
        <p
          className={cn(
            "rounded-lg border-l-2 border-brand-sky bg-surface-2 px-3 py-2",
            "text-[12px] font-semibold text-text-primary",
          )}
        >
          {step.action}
        </p>
      )}

      <div className="flex items-center justify-between gap-2 pt-1">
        <div>
          {canGoBack && (
            <Button variant="ghost" size="sm" onClick={onBack}>
              이전
            </Button>
          )}
        </div>
        <div className="flex items-center gap-2">
          {step.terminal ? (
            // 실패로 끝난 것이지 완주한 것이 아니다. 완료로 기록하지 않는다.
            <Button size="sm" onClick={onDismiss}>
              튜토리얼 종료
            </Button>
          ) : isLast ? (
            <Button size="sm" onClick={onFinish}>
              완료
            </Button>
          ) : step.action ? null : (
            <Button size="sm" onClick={onNext}>
              다음
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
