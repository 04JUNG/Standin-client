import { useNavigate } from "react-router-dom";
import { AlertTriangle } from "lucide-react";
import { cn } from "@/shared/lib/cn";
import { resolveAccelerator } from "@/shared/lib/shortcutRegistry";
import { useShortcutStore } from "@/shared/stores/shortcutStore";
import { ShortcutKey } from "./ShortcutKey";

/**
 * 전역 캡처 단축키 등록 실패를 화면에 노출한다.
 *
 * 등록 실패는 원래 store에만 기록되고 설정 화면에서만 보였다. 작가 인터뷰에서
 * 단축키가 죽어 있는 채로 시연이 진행됐고 아무도 그 사실을 몰랐다 — 실패한 기능이
 * 조용하면 실패하지 않은 것처럼 보인다(CLAUDE.md §10). 그래서 실제로 쓰는 화면인
 * 앱 셸과 플로팅 바에 함께 띄운다.
 *
 * `failed`일 때만 렌더한다. `unavailable`(브라우저 개발 모드)은 사용자가 할 수 있는
 * 일이 없으므로 경고하지 않는다 — 치트시트와 설정 화면이 이미 설명한다.
 */

/** 실패 시 사용자가 실제로 쓸 수 있는 대체 경로. 문구를 한 곳에서만 관리한다. */
const FALLBACK_HINT = "지금은 Standin 창이 활성일 때만 이 키가 동작합니다.";

function useGlobalShortcutFailure() {
  const status = useShortcutStore((s) => s.globalStatus);
  const error = useShortcutStore((s) => s.globalError);
  const bindings = useShortcutStore((s) => s.bindings);

  if (status !== "failed") return null;
  return {
    accelerator: resolveAccelerator("capture.start", bindings),
    message: error ?? "전역 단축키를 등록하지 못했습니다.",
  };
}

/** 앱 셸용 배너. 상단 바 아래 한 줄로 깔린다. */
export function GlobalShortcutAlert() {
  const failure = useGlobalShortcutFailure();
  const navigate = useNavigate();

  if (!failure) return null;

  return (
    <div
      role="alert"
      className={cn(
        "flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-brand-coral/30",
        "bg-brand-coral/10 px-6 py-2 text-[12px] text-text-primary",
      )}
    >
      <AlertTriangle className="h-4 w-4 shrink-0 text-brand-coral" aria-hidden />
      {failure.accelerator && <ShortcutKey accelerator={failure.accelerator} muted compact />}
      <span className="font-semibold text-brand-coral">전역 단축키가 등록되지 않았습니다.</span>
      <span className="text-text-secondary">
        {failure.message} {FALLBACK_HINT}
      </span>
      <button
        type="button"
        onClick={() => navigate("/app/settings")}
        className={cn(
          "ml-auto shrink-0 rounded px-2 py-1 font-semibold text-brand-coral transition-colors",
          "hover:bg-brand-coral/15",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-sky",
        )}
      >
        단축키 변경
      </button>
    </div>
  );
}

/**
 * 플로팅 바용 아이콘. 바는 폭이 좁아 배너를 넣을 수 없으므로 경고 아이콘만 두고,
 * 누르면 설정으로 보낸다. 앱 창으로 전환되므로 바 흐름을 끊는 동작이라 툴팁으로 알린다.
 */
export function GlobalShortcutIndicator() {
  const failure = useGlobalShortcutFailure();
  const navigate = useNavigate();

  if (!failure) return null;

  return (
    <button
      type="button"
      onClick={() => navigate("/app/settings")}
      aria-label={`전역 단축키가 등록되지 않았습니다. ${failure.message} 설정에서 변경하기`}
      title={`전역 단축키가 등록되지 않았습니다.\n${failure.message}\n${FALLBACK_HINT}\n\n누르면 앱 창의 설정으로 이동합니다.`}
      className={cn(
        "flex h-6 w-6 shrink-0 items-center justify-center rounded transition-colors",
        "text-brand-coral hover:bg-brand-coral/15",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-sky",
      )}
    >
      <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
    </button>
  );
}
