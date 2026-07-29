import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { windowModeService } from "../api/windowMode.service";
import { barStateForPath, windowTargetForPath } from "../lib/barSizes";
import { useWindowModeStore } from "../stores/windowModeStore";

/**
 * 라우트에서 창 모드를 파생해 네이티브에 반영한다(ADR-008).
 *
 * 렌더하는 것이 없고 라우터 안에 한 번만 마운트된다. 모드의 진실 공급원이 라우트
 * 하나이므로 "창은 56×56인데 화면은 홈" 같은 불일치가 구조적으로 불가능하다.
 *
 * 브라우저 개발 모드에서는 service가 no-op이라 UI만 렌더된다 — /bar/* 레이아웃을
 * 브라우저에서 그대로 개발할 수 있다.
 */
export function WindowModeSync() {
  const { pathname } = useLocation();
  const previousBarState = useRef<string | null>(null);

  useEffect(() => {
    const target = windowTargetForPath(pathname);
    const barState = barStateForPath(pathname);
    const wasBar = previousBarState.current !== null;

    // 바에서는 창 배경을 비워 둥근 모서리 밖이 흰 네모로 보이지 않게 한다(index.css).
    document.body.dataset.windowMode = target.mode;

    let cancelled = false;

    void (async () => {
      // 바를 떠나기 직전에 사용자가 옮긴 위치를 갈무리한다.
      if (wasBar && !barState) {
        const position = await windowModeService.getPosition();
        if (position) useWindowModeStore.getState().setBarPosition(position);
      }

      if (cancelled) return;
      await windowModeService.setMode(target.mode, target.size);
      if (cancelled) return;

      if (barState) {
        // 바로 들어오거나 바 안에서 크기가 바뀌면 저장된 자리로 되돌린다.
        // 크기가 커질 때 화면 밖으로 나가지 않도록 클램프는 Rust가 한다.
        const saved = useWindowModeStore.getState().barPosition;
        if (saved) await windowModeService.setPosition(saved, target.size);
      }

      previousBarState.current = barState;
    })();

    return () => {
      cancelled = true;
    };
  }, [pathname]);

  return null;
}
