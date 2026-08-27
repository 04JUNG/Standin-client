import { useNavigate } from "react-router-dom";
import { ArrowUpCircle } from "lucide-react";
import { cn } from "@/shared/lib/cn";
import { pendingUpdate, useUpdateStore } from "../store/updateStore";

/**
 * 새 버전이 있다는 것을 앱 화면 어디서나 알린다(ADR-011).
 *
 * 설정 화면에만 두면 대부분의 사용자는 새 버전이 나온 줄 모른다 — 전역 단축키 실패가
 * 설정 화면에만 있어서 아무도 몰랐던 것과 같은 문제다(GlobalShortcutAlert 참고).
 *
 * 설치는 여기서 하지 않고 설정 화면으로 보낸다. 설치·진행률·재시작 흐름을 두 곳에
 * 두면 분석 중 재시작 억제 같은 규칙도 두 벌이 된다.
 */
export function UpdateBanner() {
  const update = useUpdateStore(pendingUpdate);
  const dismiss = useUpdateStore((s) => s.dismissBanner);
  const navigate = useNavigate();

  if (!update) return null;

  return (
    <div
      role="status"
      className={cn(
        "flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-brand-sky/30",
        "bg-brand-sky/10 px-6 py-2 text-[12px] text-text-primary",
      )}
    >
      <ArrowUpCircle className="h-4 w-4 shrink-0 text-brand-sky" aria-hidden />
      <span className="font-semibold">새 버전 {update.version}이(가) 있습니다.</span>
      <span className="text-text-secondary">설정에서 설치할 수 있습니다.</span>
      <div className="ml-auto flex shrink-0 items-center gap-1">
        <button
          type="button"
          onClick={() => navigate("/app/settings")}
          className={cn(
            "rounded px-2 py-1 font-semibold text-brand-sky transition-colors",
            "hover:bg-brand-sky/15",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-sky",
          )}
        >
          업데이트 보기
        </button>
        <button
          type="button"
          onClick={dismiss}
          className={cn(
            "rounded px-2 py-1 text-text-secondary transition-colors",
            "hover:bg-surface-2 hover:text-text-primary",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-sky",
          )}
        >
          나중에
        </button>
      </div>
    </div>
  );
}
