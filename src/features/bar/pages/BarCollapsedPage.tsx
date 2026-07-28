import { useNavigate } from "react-router-dom";
import { Camera } from "lucide-react";
import { cn } from "@/shared/lib/cn";
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
    <div className="flex h-full w-full items-center justify-center bg-transparent">
      <button
        type="button"
        {...handlers}
        aria-label="Standin 열기"
        title="눌러서 열기 · 끌어서 옮기기"
        className={cn(
          "flex h-full w-full cursor-pointer items-center justify-center rounded-full",
          // 창이 원과 같은 크기라 그림자는 잘려 네모 얼룩으로 보인다. ring만 쓴다(실측).
          "bg-brand-coral text-white ring-1 ring-black/20 transition-colors",
          "hover:bg-brand-coral-dark active:cursor-grabbing",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-sky",
        )}
      >
        <Camera className="h-5 w-5 shrink-0" aria-hidden />
      </button>
    </div>
  );
}
