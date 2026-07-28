import { Outlet } from "react-router-dom";
import { WindowModeSync } from "@/features/bar/components/WindowModeSync";

/**
 * 모든 라우트를 감싸는 레이아웃. 경로가 없는(pathless) 라우트라 URL에는 영향이 없다.
 *
 * WindowModeSync를 한 번만 마운트하기 위한 것이다 — 창 모드를 라우트에서 파생하므로
 * 앱 전체에 마운트 지점이 하나 필요하다(ADR-008).
 */
export function RootLayout() {
  return (
    <>
      <WindowModeSync />
      <Outlet />
    </>
  );
}
