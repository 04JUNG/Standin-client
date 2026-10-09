import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { useCaptureStore } from "@/features/capture/store/captureStore";
import type { WindowMode, WindowPosition, WindowSize } from "../api/windowMode.contract";
import { windowModeService } from "../api/windowMode.service";
import { barStateForPath, windowTargetForPath } from "../lib/barSizes";
import { useWindowModeStore } from "../stores/windowModeStore";

type WindowTarget = { mode: WindowMode; size: WindowSize };

type Placement = {
  /** 마지막으로 창에 적용한 화면과 크기. */
  applied: { pathname: string; size: WindowSize } | null;
  /** 바 창을 마지막으로 놓은 자리. 지금 위치가 이와 다르면 그사이 사용자가 끌어 옮긴 것이다. */
  placedAt: WindowPosition | null;
};

/**
 * 이만큼(논리 px) 넘게 어긋나면 사용자가 옮긴 것으로 본다. 좌표는 물리 픽셀을 배율로
 * 나눈 값이라 왕복하면 소수점이 흔들릴 수 있다.
 */
const MOVE_TOLERANCE = 1;

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
  // 바 내용이 표보다 크면 창을 키운다. 측정은 BarShell이 하고, 창에 적용하는 곳은
  // 여기 하나로 유지한다 — 크기를 쓰는 곳이 둘이 되면 서로 덮어쓴다.
  const contentHeight = useWindowModeStore((s) => s.barContentHeight);
  const placement = useRef<Placement>({ applied: null, placedAt: null });
  /**
   * 창 조작을 한 줄로 세운다. 겹치면 앞 작업이 클램프로 민 자리를 뒤 작업이 읽어
   * 사용자가 옮긴 것으로 오인한다.
   */
  const queue = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    const base = windowTargetForPath(pathname);
    const barState = barStateForPath(pathname);
    const target: WindowTarget =
      barState && barState !== "candidates" && contentHeight
        ? {
            ...base,
            size: {
              ...base.size,
              height: Math.min(760, Math.max(base.size.height, contentHeight)),
            },
          }
        : base;

    // 바에서는 창 배경을 비워 둥근 모서리 밖이 흰 네모로 보이지 않게 한다(index.css).
    document.body.dataset.windowMode = target.mode;

    const state = placement.current;
    let superseded = false;
    queue.current = queue.current
      // 줄을 서는 동안 다음 목표가 왔으면 건너뛴다. 마지막 목표만 적용하면 된다.
      .then(() => (superseded ? undefined : applyTarget(state, pathname, target)))
      .catch(() => {
        // 창 조작 실패는 치명적이지 않다. 다음 전환을 막지 않도록 줄을 비운다.
      });

    return () => {
      superseded = true;
    };
  }, [pathname, contentHeight]);

  return null;
}

async function applyTarget(state: Placement, pathname: string, target: WindowTarget) {
  const last = state.applied;

  // 같은 화면에서 내용 높이만 바뀌고 창 크기는 그대로면 창을 건드릴 일이 없다.
  // 후보·인물을 넘길 때마다 내용 높이가 바뀐다.
  if (last && last.pathname === pathname && sameSize(last.size, target.size)) return;

  // 바에 있는 동안 사용자가 끌어 옮겼으면 그 자리가 새 기준이다. 바를 떠날 때도
  // 같다 — 다음에 바로 돌아오면 이 자리에 뜬다.
  if (last && barStateForPath(last.pathname)) await adoptUserMove(state);

  // 오버레이는 **캡처한 모니터**를 덮어야 한다. 프레임을 잡은 쪽(capture)이 고른
  // 모니터를 그대로 가져와, 캡처 대상과 오버레이 위치가 갈라질 수 없게 한다.
  // startCaptureFlow가 setFrame 뒤에 navigate하므로 이 시점에 프레임이 있다.
  const monitor = target.mode === "overlay" ? useCaptureStore.getState().frame?.monitor : undefined;
  await windowModeService.setMode(target.mode, target.size, monitor);

  if (barStateForPath(pathname)) {
    // 바의 자리는 늘 "기준 자리를 이 크기로 클램프한 곳"이다. 화면 가장자리에서 큰
    // 화면이 창을 안쪽으로 밀어도, 작은 화면으로 돌아오면 사용자가 둔 자리로 간다.
    // 클램프는 Rust가 한다.
    const anchor = useWindowModeStore.getState().barPosition;
    if (anchor) await windowModeService.setPosition(anchor, target.size);
    state.placedAt = await windowModeService.getPosition();
    // 기준이 아직 없으면(처음 바를 연 경우) 지금 놓인 자리를 기준으로 삼는다.
    if (!anchor && state.placedAt) useWindowModeStore.getState().setBarPosition(state.placedAt);
  } else {
    state.placedAt = null;
  }

  state.applied = { pathname, size: target.size };
}

/**
 * 창이 마지막으로 놓은 자리에 없으면 사용자가 옮긴 것이므로 그 자리를 기준으로 삼는다.
 *
 * 종전에는 바를 떠날 때만 위치를 갈무리했다. 그래서 바 안에서 끌어 옮긴 자리는 다음
 * 크기 변경에서 옛 기준으로 되돌려졌다 — 후보를 넘길 때마다 창이 처음 자리로 튀었다.
 * 반대로 클램프가 민 자리는 사용자가 고른 곳이 아니므로 기준을 바꾸지 않는다.
 */
async function adoptUserMove(state: Placement) {
  const current = await windowModeService.getPosition();
  if (!current) return;
  if (state.placedAt && !moved(state.placedAt, current)) return;
  useWindowModeStore.getState().setBarPosition(current);
}

function sameSize(a: WindowSize, b: WindowSize) {
  return a.width === b.width && a.height === b.height;
}

function moved(a: WindowPosition, b: WindowPosition) {
  return Math.abs(a.x - b.x) > MOVE_TOLERANCE || Math.abs(a.y - b.y) > MOVE_TOLERANCE;
}
