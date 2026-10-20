import { useNavigate } from "react-router-dom";
import { cn } from "@/shared/lib/cn";
import { windowModeService } from "../api/windowMode.service";
import { useDragOrClick } from "../hooks/useDragOrClick";

/**
 * 접힌 바(ADR-008). 옮길 수 있는 원형 버튼 하나.
 *
 * 창은 사각형이지만 투명(tauri.conf.json `transparent`)이라 원 바깥은 비쳐 보인다.
 * 그래서 흰 배경판을 두지 않고 원이 창 전체를 채운다.
 *
 * 눌러서 펴고 끌어서 옮겨야 하므로 `data-tauri-drag-region` 대신 useDragOrClick을 쓴다
 * (그 속성은 mousedown에서 클릭을 삼킨다).
 */
export function BarCollapsedPage() {
  const navigate = useNavigate();
  const handlers = useDragOrClick(() => navigate("/bar/actions", { replace: true }));

  return (
    // 창 경계에서 원이 잘리지 않도록 4px 안쪽에 그린다(barSizes 주석 참고).
    <div className="flex h-full w-full items-center justify-center pointer-events-none bg-transparent p-1">
      <button
        type="button"
        {...handlers}
        onContextMenu={(event) => {
          event.preventDefault();
          event.stopPropagation();
          void windowModeService.control("showBarMenu");
        }}
        onKeyDown={(event) => {
          if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) {
            event.preventDefault();
            void windowModeService.control("showBarMenu");
          }
        }}
        aria-label="Standin 열기"
        title="눌러서 열기 · 끌어서 옮기기 · 우클릭으로 닫기"
        className={cn(
          "pointer-events-auto flex h-full w-full cursor-pointer items-center justify-center rounded-full [clip-path:circle(50%)]",
          // 원본 SVG 바깥에 배경·테두리·그림자를 더하지 않는다.
          "border-0 bg-transparent p-0 transition-[filter] hover:brightness-110 active:cursor-grabbing",
          "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-brand-sky",
        )}
      >
        <img
          src="/favicon_circle.svg"
          alt=""
          draggable={false}
          className="pointer-events-none h-full w-full select-none"
        />
      </button>
    </div>
  );
}
