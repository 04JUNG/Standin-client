import { useId, useState, type ReactNode } from "react";
import { Button } from "@/shared/components/Button";

/** Keep only one page of expensive 3D previews mounted, including in the compact bar. */
export function CandidatePages<T>({
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
  const [page, setPage] = useState(0);
  const id = useId();
  const pageSize = 5;
  const lastPage = Math.max(0, Math.ceil(rows.length / pageSize) - 1);
  const currentPage = Math.min(page, lastPage);
  const start = currentPage * pageSize;
  const end = Math.min(start + pageSize, rows.length);
  return (
    <div className="space-y-3">
      <div id={id} className={gridClass}>
        {rows.slice(start, end).map(render)}
      </div>
      {rows.length > pageSize && (
        <nav
          aria-label={`${label} 페이지`}
          className="flex flex-wrap items-center justify-between gap-2"
        >
          <p
            role="status"
            aria-live="polite"
            aria-atomic="true"
            className="text-xs text-text-secondary"
          >
            {label} {start + 1}–{end} / {rows.length}개
          </p>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              aria-controls={id}
              aria-label={`${label} 이전 5개`}
              disabled={currentPage === 0}
              onClick={() => setPage(currentPage - 1)}
              className="focus-visible:ring-2 focus-visible:ring-brand-sky"
            >
              이전
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              aria-controls={id}
              aria-label={`${label} 다음 5개`}
              disabled={currentPage === lastPage}
              onClick={() => setPage(currentPage + 1)}
              className="focus-visible:ring-2 focus-visible:ring-brand-sky"
            >
              다음 5개
            </Button>
          </div>
        </nav>
      )}
    </div>
  );
}
