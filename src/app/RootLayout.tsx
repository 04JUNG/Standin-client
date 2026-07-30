import { Link, Outlet, useLocation } from "react-router-dom";
import { WindowModeSync } from "@/features/bar/components/WindowModeSync";
import { windowTargetForPath } from "@/features/bar/lib/barSizes";
import { AppTitleBar } from "./AppTitleBar";

/**
 * 모든 라우트를 감싸는 레이아웃. 경로가 없는(pathless) 라우트라 URL에는 영향이 없다.
 *
 * WindowModeSync를 한 번만 마운트하기 위한 것이다 — 창 모드를 라우트에서 파생하므로
 * 앱 전체에 마운트 지점이 하나 필요하다(ADR-008).
 *
 * 앱 모드에서는 제목 표시줄도 여기서 그린다. 창이 항상 무장식이라 OS 제목 표시줄이
 * 없기 때문이다. 바·오버레이 모드는 각자 셸이 있어 제외한다.
 */
export function RootLayout() {
  const { pathname } = useLocation();
  const isAppMode = windowTargetForPath(pathname).mode === "app";

  return (
    <>
      <WindowModeSync />
      {isAppMode ? (
        <div className="flex h-full flex-col">
          <AppTitleBar />
          <div className="min-h-0 flex-1">
            <Outlet />
          </div>
        </div>
      ) : (
        <Outlet />
      )}

      {/* 임시: 드래그 실험 페이지 진입 버튼. Tauri 창에는 주소창이 없어서 필요하다.
          확인이 끝나면 이 블록과 Link import를 지운다. */}
      {import.meta.env.DEV && isAppMode && pathname !== "/dev/drag-test" && (
        <Link
          to="/dev/drag-test"
          className="fixed bottom-3 right-3 z-50 rounded-full bg-brand-coral px-3 py-2 text-[11px] font-bold text-white shadow-lg hover:opacity-90"
        >
          드래그 실험
        </Link>
      )}
    </>
  );
}
