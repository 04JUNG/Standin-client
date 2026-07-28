import { Minus, Square, X } from "lucide-react";
import { cn } from "@/shared/lib/cn";
import { windowModeService } from "../api/windowMode.service";
import type { WindowControlAction } from "../api/windowMode.contract";

/**
 * 앱 모드의 창 제어 버튼(ADR-008).
 *
 * 창을 항상 무장식으로 두기 때문에 제목 표시줄을 앱이 직접 그린다. 런타임
 * `set_decorations(false)`가 Windows에서 적용되지 않아(실측) 모드마다 장식을
 * 토글하는 방식을 포기했고, 그 대가로 이 컴포넌트가 필요해졌다.
 *
 * 최소화는 네이티브가 가로채 플로팅 바로 접는다.
 */
export function WindowControls() {
  return (
    <div className="flex items-center">
      <ControlButton action="minimize" label="플로팅 바로 접기">
        <Minus className="h-3.5 w-3.5" aria-hidden />
      </ControlButton>
      <ControlButton action="toggleMaximize" label="최대화 / 복원">
        <Square className="h-3 w-3" aria-hidden />
      </ControlButton>
      <ControlButton action="close" label="닫기" danger>
        <X className="h-3.5 w-3.5" aria-hidden />
      </ControlButton>
    </div>
  );
}

function ControlButton({
  action,
  label,
  danger,
  children,
}: {
  action: WindowControlAction;
  label: string;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={() => void windowModeService.control(action)}
      aria-label={label}
      title={label}
      className={cn(
        "flex h-8 w-11 items-center justify-center transition-colors",
        "text-text-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-sky",
        danger
          ? "hover:bg-brand-coral hover:text-white"
          : "hover:bg-surface-2 hover:text-text-primary",
      )}
    >
      {children}
    </button>
  );
}
