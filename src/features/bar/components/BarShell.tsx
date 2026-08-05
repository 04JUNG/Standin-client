import { type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { GripVertical, Minus, Maximize2 } from "lucide-react";
import { cn } from "@/shared/lib/cn";
import { GlobalShortcutIndicator } from "@/shared/components/GlobalShortcutAlert";
import { useShortcuts } from "@/shared/hooks/useShortcuts";
import { appRouteForBarPath } from "@/shared/lib/modeRoutes";
import { useUploadStore } from "@/features/upload/store/uploadStore";
import { usePoseSelectionStore } from "@/features/pose-viewer/store/poseSelectionStore";

type BarShellProps = {
  title?: string;
  /** 접기 버튼을 숨긴다(이미 접힌 상태). */
  hideCollapse?: boolean;
  children: ReactNode;
};

/**
 * 바 모드의 셸(ADR-008). AppShell의 대응물이지만 사이드바·탑바가 없다.
 *
 * 드래그는 `data-tauri-drag-region`으로 처리한다 — JS 없이 웹뷰가 창을 옮긴다.
 * 버튼 위에서는 드래그가 걸리면 안 되므로 핸들 영역에만 붙인다.
 */
export function BarShell({ title, hideCollapse, children }: BarShellProps) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const jobId = usePoseSelectionStore((s) => s.jobId);
  const hasDraft = useUploadStore((s) => s.draft !== null);

  useShortcuts({
    // 바에서 Esc는 접기(앱 모드로 나가지 않는다).
    "bar.collapse": hideCollapse ? undefined : () => navigate("/bar", { replace: true }),
  });

  return (
    <div className="flex h-full w-full flex-col overflow-hidden rounded-xl border border-border bg-surface-0 shadow-lg">
      <div className="flex items-center gap-1 border-b border-border px-1.5 py-1">
        {/* 드래그 핸들. 이 영역을 잡고 바를 옮긴다. */}
        <div
          data-tauri-drag-region
          className="flex flex-1 cursor-grab items-center gap-1.5 px-1 py-1 active:cursor-grabbing"
          title="드래그해서 옮기기"
        >
          <GripVertical className="h-3.5 w-3.5 shrink-0 text-text-secondary" aria-hidden />
          {title && (
            <span className="truncate text-[11px] font-semibold text-text-secondary">{title}</span>
          )}
        </div>

        {/* 전역 단축키가 죽어 있으면 바에서도 알린다. 바는 폭이 좁아 아이콘만 둔다. */}
        <GlobalShortcutIndicator />

        {!hideCollapse && (
          <BarIconButton label="접기 (Esc)" onClick={() => navigate("/bar", { replace: true })}>
            <Minus className="h-3.5 w-3.5" aria-hidden />
          </BarIconButton>
        )}
        {/* 확대는 지금 단계를 그대로 앱 창에서 이어 연다 — 홈으로 돌아가면 흐름을 잃는다. */}
        <BarIconButton
          label="앱 창으로 열기"
          onClick={() => navigate(appRouteForBarPath(pathname, { jobId, hasDraft }))}
        >
          <Maximize2 className="h-3.5 w-3.5" aria-hidden />
        </BarIconButton>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">{children}</div>
    </div>
  );
}

function BarIconButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn(
        "flex h-6 w-6 shrink-0 items-center justify-center rounded transition-colors",
        "text-text-secondary hover:bg-surface-2 hover:text-text-primary",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-sky",
      )}
    >
      {children}
    </button>
  );
}
