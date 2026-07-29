import { useRef, type PointerEvent as ReactPointerEvent } from "react";
import { windowModeService } from "../api/windowMode.service";

/** 이 거리(px)를 넘겨야 끌기로 본다. 미만이면 클릭이다. */
const DRAG_THRESHOLD = 4;

/**
 * 같은 요소에서 클릭과 창 끌기를 함께 받는다.
 *
 * `data-tauri-drag-region`은 mousedown 시점에 preventDefault하고 바로 끌기를 시작해
 * 클릭 이벤트를 삼킨다(tauri 2.11.5 window/scripts/drag.js). 접힌 바처럼 "눌러서 펴고,
 * 끌어서 옮기는" 요소는 그래서 직접 처리해야 한다.
 *
 * 포인터가 임계값을 넘게 움직인 뒤에야 startDragging을 호출하므로, 제자리 클릭은
 * 그대로 onClick으로 살아난다.
 */
export function useDragOrClick(onClick: () => void) {
  const origin = useRef<{ x: number; y: number } | null>(null);
  const dragged = useRef(false);

  function onPointerDown(e: ReactPointerEvent) {
    if (e.button !== 0) return;
    origin.current = { x: e.clientX, y: e.clientY };
    dragged.current = false;
  }

  function onPointerMove(e: ReactPointerEvent) {
    const start = origin.current;
    if (!start || dragged.current) return;
    if (Math.hypot(e.clientX - start.x, e.clientY - start.y) < DRAG_THRESHOLD) return;

    dragged.current = true;
    origin.current = null;
    // 끌기가 시작되면 이후 포인터 이벤트는 OS가 가져간다.
    void windowModeService.startDragging();
  }

  function onPointerUp() {
    origin.current = null;
  }

  function handleClick() {
    // 끌고 난 직후의 click은 무시한다(제자리 클릭만 동작).
    if (dragged.current) {
      dragged.current = false;
      return;
    }
    onClick();
  }

  return { onPointerDown, onPointerMove, onPointerUp, onClick: handleClick };
}
