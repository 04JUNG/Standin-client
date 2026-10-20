import { useLayoutEffect, useRef } from "react";

type Transition = {
  scope: string;
  target: number;
  offset: number | null;
  scrollTop: number;
};

/** 인물별 후보 길이가 달라도 아래 인물 목록이 viewport에서 움직이지 않게 한다. */
export function usePersonScrollContinuity(scope: string, activeIndex: number | undefined) {
  const contentRef = useRef<HTMLDivElement>(null);
  const indexRef = useRef<HTMLElement>(null);
  const pending = useRef<Transition | null>(null);

  function beforeSwitch(target: number) {
    const scroller = contentRef.current?.closest("main");
    const index = indexRef.current;
    if (!scroller || !index || target === activeIndex) return;
    const viewport = scroller.getBoundingClientRect();
    const bounds = index.getBoundingClientRect();
    const visible = bounds.bottom > viewport.top && bounds.top < viewport.bottom;
    pending.current = {
      scope,
      target,
      // 원본 상자로 인물을 고를 때 목록이 화면 밖에 있으면 현재 스크롤을 유지한다.
      offset: visible ? bounds.top - viewport.top : null,
      scrollTop: scroller.scrollTop,
    };
  }

  useLayoutEffect(() => {
    const transition = pending.current;
    const content = contentRef.current;
    const index = indexRef.current;
    const scroller = content?.closest("main");
    if (
      !transition ||
      transition.scope !== scope ||
      transition.target !== activeIndex ||
      !content ||
      !index ||
      !scroller
    )
      return;

    // 이미지·체형 정보가 늦게 도착해도 동일한 목록 위치를 유지한다.
    // 사용자가 직접 스크롤하거나 다음 컨트롤을 누르는 순간 보정을 끝낸다.
    let stopped = false;
    const restore = () => {
      if (stopped) return;
      const offset = index.getBoundingClientRect().top - scroller.getBoundingClientRect().top;
      const target =
        transition.offset === null
          ? transition.scrollTop
          : scroller.scrollTop + offset - transition.offset;
      if (Math.abs(target - scroller.scrollTop) > 0.5) scroller.scrollTop = Math.max(0, target);
    };
    const observer = new ResizeObserver(restore);
    const stop = () => {
      stopped = true;
      observer.disconnect();
      if (pending.current === transition) pending.current = null;
    };
    restore();
    observer.observe(content);
    const events = ["wheel", "touchstart", "pointerdown", "keydown"] as const;
    for (const event of events) scroller.addEventListener(event, stop, { passive: true });
    return () => {
      stop();
      for (const event of events) scroller.removeEventListener(event, stop);
    };
  }, [scope, activeIndex]);

  return { contentRef, indexRef, beforeSwitch };
}
