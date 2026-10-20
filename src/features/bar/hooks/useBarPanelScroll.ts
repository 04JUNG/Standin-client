import { useLayoutEffect, useRef } from "react";

type Position = { offset: number };
type Transition = { scope: string; expanded: boolean; position: Position };

/** Remember each person's pose/body viewport inside the floating shell only. */
export function useBarPanelScroll(scope: string, expanded: boolean) {
  const sectionRef = useRef<HTMLElement>(null);
  const positions = useRef({ scope, views: new Map<boolean, Position>() });
  const pending = useRef<Transition | null>(null);

  function beforeSwitch(next: boolean) {
    const section = sectionRef.current;
    const scroller = section?.closest<HTMLElement>("[data-bar-scroll]");
    if (!section || !scroller || next === expanded) return;
    if (positions.current.scope !== scope) positions.current = { scope, views: new Map() };
    const current = {
      offset: section.getBoundingClientRect().top - scroller.getBoundingClientRect().top,
    };
    positions.current.views.set(expanded, current);
    pending.current = {
      scope,
      expanded: next,
      position: positions.current.views.get(next) ?? current,
    };
  }

  useLayoutEffect(() => {
    if (positions.current.scope !== scope) {
      positions.current = { scope, views: new Map() };
      pending.current = null;
    }
    const transition = pending.current;
    const section = sectionRef.current;
    const scroller = section?.closest<HTMLElement>("[data-bar-scroll]");
    if (
      !transition ||
      transition.scope !== scope ||
      transition.expanded !== expanded ||
      !section ||
      !scroller
    )
      return;

    let stopped = false;
    const restore = () => {
      if (stopped) return;
      const offset = section.getBoundingClientRect().top - scroller.getBoundingClientRect().top;
      const target = Math.max(0, scroller.scrollTop + offset - transition.position.offset);
      if (Math.abs(target - scroller.scrollTop) > 0.5) scroller.scrollTop = target;
    };
    const observer = new ResizeObserver(restore);
    const stop = () => {
      stopped = true;
      observer.disconnect();
      if (pending.current === transition) pending.current = null;
    };
    // Restore before paint, then retry after a short loading panel grows or the
    // native floating window resizes. Keep the intended position when clamped.
    restore();
    observer.observe(section);
    observer.observe(scroller);
    if (scroller.firstElementChild) observer.observe(scroller.firstElementChild);
    const events = ["wheel", "touchstart", "pointerdown", "keydown"] as const;
    for (const event of events) scroller.addEventListener(event, stop, { passive: true });
    return () => {
      stop();
      for (const event of events) scroller.removeEventListener(event, stop);
    };
  }, [scope, expanded]);

  return { sectionRef, beforeSwitch };
}
