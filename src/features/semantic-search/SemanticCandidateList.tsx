import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Button } from "@/shared/components/Button";

/** The server returns one complete result; scrolling only mounts 20 more local cards. */
export function SemanticCandidateList<T>({
  rows,
  label,
  gridClass,
  render,
}: {
  rows: readonly T[];
  label: string;
  gridClass: string;
  render: (row: T) => ReactNode;
}) {
  const [visibleCount, setVisibleCount] = useState(20);
  const sentinel = useRef<HTMLDivElement>(null);
  const id = useId();
  const end = Math.min(visibleCount, rows.length);
  const hasMore = end < rows.length;
  useEffect(() => {
    if (!hasMore || !sentinel.current || typeof IntersectionObserver === "undefined") return;
    const target = sentinel.current;
    let appended = false;
    const append = () => {
      if (appended) return;
      appended = true;
      observer.disconnect();
      setVisibleCount((count) => count + 20);
    };
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) append();
      },
      { rootMargin: "100px" },
    );
    // A fast wheel/PageDown can jump entirely past a one-pixel sentinel between
    // observer samples. Also fill a group whose end is already above the viewport.
    const checkPosition = () => {
      let bottom = window.innerHeight;
      let ancestor = target.parentElement;
      while (ancestor) {
        if (/auto|scroll/.test(getComputedStyle(ancestor).overflowY)) {
          bottom = Math.min(bottom, ancestor.getBoundingClientRect().bottom);
          break;
        }
        ancestor = ancestor.parentElement;
      }
      if (target.getBoundingClientRect().top <= bottom + 100) append();
    };
    observer.observe(target);
    window.addEventListener("scroll", checkPosition, true);
    checkPosition();
    return () => {
      appended = true;
      observer.disconnect();
      window.removeEventListener("scroll", checkPosition, true);
    };
  }, [hasMore, end]);
  return (
    <div className="space-y-3">
      <div id={id} className={gridClass}>
        {rows.slice(0, end).map(render)}
      </div>
      <p role="status" aria-live="polite" className="text-xs text-text-secondary">
        {label} {end} / {rows.length}개
      </p>
      {hasMore && (
        <div ref={sentinel}>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            aria-controls={id}
            aria-label={`${label} 20개 더 보기`}
            onClick={() => setVisibleCount((count) => count + 20)}
          >
            20개 더 보기
          </Button>
        </div>
      )}
    </div>
  );
}
