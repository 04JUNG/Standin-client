import { X } from "lucide-react";
import { Button } from "@/shared/components/Button";
import { cn } from "@/shared/lib/cn";

/**
 * 투어가 켜져 있는데 이 화면에는 안내할 스텝이 없을 때 띄운다.
 *
 * 딤이 더 이상 클릭을 막지 않으므로 사용자가 흐름 밖으로 나갈 수 있다. 표시가 없으면
 * 투어가 꺼진 것처럼 보이고, 돌아가는 길도 알 수 없다.
 */
export function TourResumePill({ onResume, onDismiss }: { onResume(): void; onDismiss(): void }) {
  return (
    <div
      role="status"
      className={cn(
        "fixed bottom-6 right-6 z-[92] flex items-center gap-3 rounded-2xl",
        "border border-border bg-surface-0 px-4 py-3 shadow-xl",
      )}
    >
      <p className="text-[13px] text-text-secondary">튜토리얼이 아직 켜져 있습니다.</p>
      <Button size="sm" onClick={onResume}>
        홈에서 이어보기
      </Button>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="튜토리얼 그만두기"
        className={cn(
          "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-colors",
          "text-text-secondary hover:bg-surface-2 hover:text-text-primary",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-sky",
        )}
      >
        <X className="h-4 w-4" aria-hidden />
      </button>
    </div>
  );
}
