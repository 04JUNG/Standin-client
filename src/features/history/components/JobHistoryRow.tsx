import { ImageOff, Trash2, Users } from "lucide-react";
import { cn } from "@/shared/lib/cn";
import type { JobHistoryItem } from "../api/history.contract";
import { useAuthedImage } from "../hooks/useAuthedImage";
import { formatJobDate } from "../lib/formatJobDate";
import { isOpenable, jobStatusDisplay, unopenableReason } from "../lib/jobStatusLabel";
import { JobStatusBadge } from "./JobStatusBadge";

type JobHistoryRowProps = {
  item: JobHistoryItem;
  onOpen(jobId: string): void;
  onRequestDelete(item: JobHistoryItem): void;
  isDeleting: boolean;
};

export function JobHistoryRow({ item, onOpen, onRequestDelete, isDeleting }: JobHistoryRowProps) {
  const thumbnail = useAuthedImage(item.thumbnailUrl);
  const status = jobStatusDisplay(item);
  const openable = isOpenable(item);
  const blockedReason = unopenableReason(item);

  return (
    <li
      className={cn(
        "flex items-center gap-4 rounded-xl border border-border bg-surface-0 p-4 transition-colors",
        openable && "hover:border-brand-sky",
        isDeleting && "opacity-50",
      )}
    >
      {/* 카드 전체를 버튼으로 만들지 않는다 — 삭제 버튼이 그 안에 중첩되기 때문이다. */}
      <button
        type="button"
        onClick={() => onOpen(item.jobId)}
        disabled={!openable || isDeleting}
        aria-disabled={!openable}
        title={blockedReason ?? undefined}
        className={cn(
          "flex flex-1 items-center gap-4 text-left",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-sky rounded-lg",
          !openable && "cursor-default",
        )}
      >
        {thumbnail ? (
          <img
            src={thumbnail}
            alt=""
            className="h-16 w-16 shrink-0 rounded-lg object-cover"
          />
        ) : (
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-text-secondary">
            <ImageOff className="h-5 w-5" aria-hidden />
          </div>
        )}

        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex items-center gap-2">
            <span className="text-[14px] font-semibold text-text-primary">
              {formatJobDate(item.createdAt)}
            </span>
            <JobStatusBadge label={status.label} tone={status.tone} />
          </div>

          <div className="flex items-center gap-3 text-[12px] text-text-secondary">
            {item.personCount > 0 && (
              <span className="inline-flex items-center gap-1">
                <Users className="h-3.5 w-3.5" aria-hidden />
                인물 {item.personCount}명
              </span>
            )}
            {openable && <span>{item.hasSelection ? "선택 완료" : "선택 없음"}</span>}
          </div>

          {(status.detail ?? blockedReason) && (
            <p className="truncate text-[12px] text-text-secondary">
              {status.detail ?? blockedReason}
            </p>
          )}
        </div>
      </button>

      <button
        type="button"
        onClick={() => onRequestDelete(item)}
        disabled={isDeleting}
        aria-label={`${formatJobDate(item.createdAt)} 작업 삭제`}
        title="이 작업을 삭제합니다"
        className={cn(
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-colors",
          "text-text-secondary hover:bg-surface-2 hover:text-brand-coral",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-sky",
          "disabled:cursor-not-allowed disabled:opacity-50",
        )}
      >
        <Trash2 className="h-4 w-4" aria-hidden />
      </button>
    </li>
  );
}
