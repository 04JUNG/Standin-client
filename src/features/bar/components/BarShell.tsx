import { useEffect, useLayoutEffect, useRef, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { GripVertical, Minus, Maximize2, X } from "lucide-react";
import { cn } from "@/shared/lib/cn";
import { GlobalShortcutIndicator } from "@/shared/components/GlobalShortcutAlert";
import { useShortcuts } from "@/shared/hooks/useShortcuts";
import { appRouteForBarPath } from "@/shared/lib/modeRoutes";
import { useUploadStore } from "@/features/upload/store/uploadStore";
import { usePoseSelectionStore } from "@/features/pose-viewer/store/poseSelectionStore";
import { windowModeService } from "../api/windowMode.service";
import { CompactPoseLayout } from "./CompactPoseLayout";
import { useWindowModeStore } from "../stores/windowModeStore";

type BarShellProps = {
  title?: string;
  /** 접기 버튼을 숨긴다(이미 접힌 상태). */
  hideCollapse?: boolean;
  footer?: ReactNode;
  preferredWidth?: number;
  children: ReactNode;
};

/**
 * 바 모드의 셸(ADR-008). AppShell의 대응물이지만 사이드바·탑바가 없다.
 *
 * 점 아이콘·제목·빈 영역의 mousedown을 네이티브 드래그로 전달한다.
 * 창 제어 버튼은 핸들 밖에 두어 클릭과 창 이동을 분리한다.
 */
export function BarShell({ title, hideCollapse, children, footer, preferredWidth }: BarShellProps) {
  const navigate = useNavigate();
  const { pathname, state: routeState } = useLocation();
  const jobId = usePoseSelectionStore((s) => s.jobId);
  const hasDraft = useUploadStore((s) => s.draft !== null);
  const shellRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const footerRef = useRef<HTMLDivElement>(null);
  const hasFooter = !!footer;

  useLayoutEffect(() => {
    const setWidth = useWindowModeStore.getState().setBarContentWidth;
    setWidth(preferredWidth ?? null);
    return () => setWidth(null);
  }, [pathname, preferredWidth]);

  useShortcuts({
    // 바에서 Esc는 접기(앱 모드로 나가지 않는다).
    "bar.collapse": hideCollapse ? undefined : () => navigate("/bar", { replace: true }),
  });

  /**
   * 내용의 고유 높이에 헤더·하단 버튼 높이를 더해 창을 맞춘다.
   * 창 높이에서 파생된 값을 재면 확대·축소가 반복되므로 스크롤 viewport는 재지 않는다.
   * 실제 창 크기와 상한은 WindowModeSync가 적용한다.
   */
  useEffect(() => {
    const content = contentRef.current;
    const shell = shellRef.current;
    if (!content || !shell) return;

    const setHeight = useWindowModeStore.getState().setBarContentHeight;
    const measure = () => {
      // 헤더와 테두리는 내용 밖이므로 셸에서 스크롤 영역을 뺀 만큼을 더한다.
      const chrome = shell.offsetHeight - (content.parentElement?.clientHeight ?? 0);
      setHeight(Math.ceil(content.scrollHeight + chrome));
    };

    measure();
    // 줄바꿈·이미지·체형 안내가 연속으로 바뀌면 마지막 레이아웃을 한 번 적용한다.
    let timer: ReturnType<typeof setTimeout>;
    const observer = new ResizeObserver(() => {
      clearTimeout(timer);
      timer = setTimeout(measure, 80);
    });
    observer.observe(content);
    if (headerRef.current) observer.observe(headerRef.current);
    if (footerRef.current) observer.observe(footerRef.current);
    return () => {
      clearTimeout(timer);
      observer.disconnect();
      // 다음 화면이 자기 높이를 올릴 때까지 표 기본값으로 돌아간다.
      setHeight(null);
    };
  }, [pathname, hasFooter]);

  return (
    <div
      ref={shellRef}
      className="flex h-full w-full flex-col overflow-hidden rounded-xl border border-border bg-surface-0 shadow-lg"
    >
      <div
        ref={headerRef}
        className="flex shrink-0 items-center gap-1 border-b border-border px-1.5 py-1"
      >
        {/* 드래그 핸들. 이 영역을 잡고 바를 옮긴다. */}
        <div
          onMouseDown={(event) => {
            if (event.button !== 0 || event.ctrlKey) return;
            event.preventDefault();
            void windowModeService.startDragging();
          }}
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
          onClick={() =>
            navigate(appRouteForBarPath(pathname, { jobId, hasDraft }), {
              state: pathname === "/bar/search" ? routeState : undefined,
            })
          }
        >
          <Maximize2 className="h-3.5 w-3.5" aria-hidden />
        </BarIconButton>
        <BarIconButton label="닫기" onClick={() => void windowModeService.control("close")}>
          <X className="h-3.5 w-3.5" aria-hidden />
        </BarIconButton>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        {/* 내용 높이를 재기 위한 래퍼. 스크롤 영역 자체는 창 크기를 따라가므로 잴 수 없다. */}
        <div ref={contentRef}>
          {pathname === "/bar/candidates" ? (
            <CompactPoseLayout>{children}</CompactPoseLayout>
          ) : (
            children
          )}
        </div>
      </div>
      {footer && (
        <div ref={footerRef} className="shrink-0 border-t border-border bg-surface-0 px-2">
          {footer}
        </div>
      )}
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
