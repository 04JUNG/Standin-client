import { Outlet, useLocation } from "react-router-dom";
import { WindowModeSync } from "@/features/bar/components/WindowModeSync";
import { windowTargetForPath } from "@/features/bar/lib/barSizes";
import { UpdateBanner } from "@/features/updates/components/UpdateBanner";
import { AppTitleBar } from "./AppTitleBar";

/**
 * 모든 라우트를 감싸는 레이아웃. 경로가 없는(pathless) 라우트라 URL에는 영향이 없다.
 *
 * WindowModeSync를 한 번만 마운트하기 위한 것이다 — 창 모드를 라우트에서 파생하므로
 * 앱 전체에 마운트 지점이 하나 필요하다(ADR-008).
 *
 * 앱 모드에서는 제목 표시줄도 여기서 그린다. 창이 항상 무장식이라 OS 제목 표시줄이
 * 없기 때문이다. 바·오버레이 모드는 각자 셸이 있어 제외한다.
 *
 * 업데이트 배너도 같은 이유로 여기 있다. AppShell은 shared/라 features를 import할 수
 * 없고(CLAUDE.md §8), 앱 모드 화면 전체에 한 번만 걸리는 지점이 여기다. 폭이 좁은
 * 바 모드와 캡처 오버레이에는 띄우지 않는다(ADR-011).
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
          <UpdateBanner />
          <div className="min-h-0 flex-1">
            <Outlet />
          </div>
        </div>
      ) : (
        <Outlet />
      )}
    </>
  );
}
