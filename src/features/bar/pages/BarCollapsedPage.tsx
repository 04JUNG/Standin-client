import { useNavigate } from "react-router-dom";
import { Camera } from "lucide-react";
import { cn } from "@/shared/lib/cn";

/**
 * 접힌 바(ADR-008). 옮길 수 있는 원형 버튼 하나.
 *
 * 창 전체가 56×56이라 셸의 드래그 핸들을 따로 둘 자리가 없다. 버튼 바깥 링을
 * 드래그 영역으로 쓰고 가운데를 클릭하면 펼쳐진다.
 */
export function BarCollapsedPage() {
  const navigate = useNavigate();

  return (
    <div
      data-tauri-drag-region
      className="flex h-full w-full items-center justify-center rounded-full border border-border bg-surface-0 shadow-lg"
      title="드래그해서 옮기기"
    >
      <button
        type="button"
        onClick={() => navigate("/bar/actions", { replace: true })}
        aria-label="Standin 열기"
        title="Standin 열기"
        className={cn(
          "flex h-11 w-11 items-center justify-center rounded-full transition-colors",
          "bg-brand-coral text-white hover:bg-brand-coral-dark",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-sky",
        )}
      >
        <Camera className="h-5 w-5" aria-hidden />
      </button>
    </div>
  );
}
