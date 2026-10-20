import { Maximize2, Minus, Square, X } from "lucide-react";
import { cn } from "@/shared/lib/cn";
import { isMac } from "@/shared/lib/platform";
import { windowModeService } from "../api/windowMode.service";
import type { WindowControlAction } from "../api/windowMode.contract";

/**
 * 앱 모드의 창 제어 버튼(ADR-008).
 *
 * 창을 항상 무장식으로 두기 때문에 제목 표시줄을 앱이 직접 그린다. 런타임
 * `set_decorations(false)`가 Windows에서 적용되지 않아(실측) 모드마다 장식을
 * 토글하는 방식을 포기했고, 그 대가로 이 컴포넌트가 필요해졌다.
 *
 * macOS는 왼쪽 traffic-light 모양, Windows/Linux는 오른쪽 사각 버튼을 쓴다.
 * 최소화는 네이티브가 가로채 플로팅 바로 접는다.
 */
export function WindowControls() {
  if (isMac())
    return (
      <div className="group flex h-8 shrink-0 items-center px-2">
        <MacControlButton action="close" label="닫기" color="bg-[#ff5f57]">
          <X className="h-2.5 w-2.5" aria-hidden />
        </MacControlButton>
        <MacControlButton action="minimize" label="플로팅 바로 접기" color="bg-[#febc2e]">
          <Minus className="h-2.5 w-2.5" aria-hidden />
        </MacControlButton>
        <MacControlButton action="toggleMaximize" label="최대화 / 복원" color="bg-[#28c840]">
          <Maximize2 className="h-2 w-2" aria-hidden />
        </MacControlButton>
      </div>
    );
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

/** 창 모드와 기존 command를 공유해 캡처·플로팅 바 전환 중 장식 변경을 피한다. */
function MacControlButton({
  action,
  label,
  color,
  children,
}: {
  action: WindowControlAction;
  label: string;
  color: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={() => void windowModeService.control(action)}
      aria-label={label}
      title={label}
      className="flex h-8 w-5 items-center justify-center rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-sky"
    >
      <span
        className={cn(
          "flex h-3 w-3 items-center justify-center rounded-full border border-black/10 text-black/70 active:brightness-90",
          color,
        )}
      >
        <span className="opacity-0 group-hover:opacity-100 group-focus-within:opacity-100">
          {children}
        </span>
      </span>
    </button>
  );
}
