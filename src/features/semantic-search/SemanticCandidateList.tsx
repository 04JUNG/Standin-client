import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Button } from "@/shared/components/Button";
import type { useSemanticPages } from "./useSemanticPages";

const BATCH = 20;
/** Metadata pages append in rank order; offscreen rows keep their height without mounted images. */
export function SemanticCandidateList<T>({
  rows,
  label,
  gridClass,
  render,
  pages,
  paged = false,
}: {
  rows: readonly T[];
  label: string;
  gridClass: string;
  render: (row: T) => ReactNode;
  paged?: boolean;
  pages?: ReturnType<typeof useSemanticPages>;
}) {
  const [visibleCount, setVisibleCount] = useState(BATCH);
  const [windowRows, setWindowRows] = useState({
    first: 0,
    count: 12,
    columns: 5,
    height: 0,
    gap: 8,
  });
  const root = useRef<HTMLDivElement>(null);
  const grid = useRef<HTMLDivElement>(null);
  const sentinel = useRef<HTMLDivElement>(null);
  const id = useId();
  const remote = paged || !!pages;
  const end = remote ? rows.length : Math.min(visibleCount, rows.length);
  const hasMore = end < rows.length || !!pages?.info.nextCursor;
  const blocked = !!pages?.pending || !!pages?.error || !!pages?.paused;
  const appendRef = useRef<() => void>();
  appendRef.current = () => {
    if (blocked) return;
    if (end < rows.length) setVisibleCount(end + BATCH);
    else if (pages?.info.nextCursor) void pages.loadMore();
  };
  useLayoutEffect(() => {
    const target = root.current,
      container = grid.current;
    if (!target || !container) return;
    let frame = 0;
    const update = () => {
      const css = getComputedStyle(container);
      const columns = Math.max(1, css.gridTemplateColumns.split(" ").filter(Boolean).length);
      const cell = container.querySelector<HTMLElement>("[data-semantic-cell]");
      const height = cell?.firstElementChild?.getBoundingClientRect().height ?? 0;
      if (height <= 0) return;
      const gap = parseFloat(css.rowGap) || 8;
      let top = 0,
        bottom = window.innerHeight;
      let parent = target.parentElement;
      while (parent) {
        if (/auto|scroll/.test(getComputedStyle(parent).overflowY)) {
          const bounds = parent.getBoundingClientRect();
          top = Math.max(0, bounds.top);
          bottom = Math.min(bottom, bounds.bottom);
          break;
        }
        parent = parent.parentElement;
      }
      const offset = Math.max(0, top - target.getBoundingClientRect().top);
      const count = Math.min(
        Math.floor(60 / columns),
        Math.ceil((bottom - top) / (height + gap)) + 4,
      );
      const last = Math.max(0, Math.ceil(end / columns) - count);
      const first = Math.min(last, Math.max(0, Math.floor(offset / (height + gap)) - 2));
      setWindowRows((old) =>
        old.first === first &&
        old.count === count &&
        old.columns === columns &&
        Math.abs(old.height - height) < 1 &&
        old.gap === gap
          ? old
          : { first, count, columns, height, gap },
      );
    };
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(update);
    };
    const resize = typeof ResizeObserver !== "undefined" ? new ResizeObserver(schedule) : undefined;
    resize?.observe(container);
    if (container.firstElementChild) resize?.observe(container.firstElementChild);
    window.addEventListener("scroll", schedule, true);
    window.addEventListener("resize", schedule);
    update();
    return () => {
      cancelAnimationFrame(frame);
      resize?.disconnect();
      window.removeEventListener("scroll", schedule, true);
      window.removeEventListener("resize", schedule);
    };
  }, [end]);
  useEffect(() => {
    const target = sentinel.current;
    if (!hasMore || blocked || !target) return;
    let active = true;
    const append = () => {
      if (active) appendRef.current?.();
    };
    const observer =
      typeof IntersectionObserver !== "undefined"
        ? new IntersectionObserver(
            (entries) => {
              if (entries.some((entry) => entry.isIntersecting)) append();
            },
            { rootMargin: "150px" },
          )
        : undefined;
    const check = () => {
      let bottom = window.innerHeight;
      let parent = target.parentElement;
      while (parent) {
        if (/auto|scroll/.test(getComputedStyle(parent).overflowY)) {
          bottom = Math.min(bottom, parent.getBoundingClientRect().bottom);
          break;
        }
        parent = parent.parentElement;
      }
      const bounds = target.getBoundingClientRect();
      if (bounds.width === 0 && bounds.height === 0) return;
      if (bounds.top <= bottom + 150) append();
    };
    observer?.observe(target);
    const resize = typeof ResizeObserver !== "undefined" ? new ResizeObserver(check) : undefined;
    if (root.current) resize?.observe(root.current);
    window.addEventListener("scroll", check, true);
    check();
    return () => {
      active = false;
      resize?.disconnect();
      observer?.disconnect();
      window.removeEventListener("scroll", check, true);
    };
  }, [hasMore, end, blocked, pages?.info.nextCursor]);
  const { first, count, columns, height, gap } = windowRows;
  const start = height ? first * columns : 0;
  const stop = height ? Math.min(end, (first + count) * columns) : end;
  const totalRows = Math.ceil(end / columns);
  const after = height ? Math.max(0, totalRows - Math.ceil(stop / columns)) : 0;
  return (
    <div ref={root} className="space-y-3" data-semantic-list>
      <div id={id}>
        {start > 0 && <div aria-hidden style={{ height: first * (height + gap) }} />}
        <div ref={grid} className={gridClass} style={height ? { gridAutoRows: height } : undefined}>
          {rows.slice(start, stop).map((row, index) => (
            <div key={start + index} data-semantic-cell>
              {render(row)}
            </div>
          ))}
        </div>
        {after > 0 && <div aria-hidden style={{ height: after * (height + gap) }} />}
      </div>
      <p role="status" aria-live="polite" className="text-xs text-text-secondary">
        {pages
          ? `포즈 ${pages.info.loaded} / ${pages.info.total}개`
          : `${label} ${end} / ${rows.length}개`}
      </p>
      {!hasMore && <p className="text-xs text-text-secondary">마지막 포즈까지 확인했어요</p>}
      {pages?.error && (
        <p role="alert" className="text-xs text-text-secondary">
          {"code" in pages.error && pages.error.code === "SEMANTIC_SNAPSHOT_CHANGED"
            ? "포즈 목록이 바뀌었어요. 다시 검색해 주세요."
            : "포즈를 더 불러오지 못했어요. 다시 시도해 주세요."}
        </p>
      )}
      {hasMore && (
        <div ref={sentinel}>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            aria-controls={id}
            aria-label={pages?.error ? "다시 불러오기" : `${label} 20개 더 보기`}
            disabled={pages?.pending || pages?.paused}
            onClick={() => (pages?.error ? void pages.loadMore() : appendRef.current?.())}
          >
            {pages?.pending ? "포즈 불러오는 중…" : pages?.error ? "다시 불러오기" : "20개 더 보기"}
          </Button>
        </div>
      )}
    </div>
  );
}
