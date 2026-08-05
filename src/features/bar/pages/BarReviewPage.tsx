import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { ChevronLeft, ChevronRight, Loader2, Save } from "lucide-react";
import { cn } from "@/shared/lib/cn";
import { Button } from "@/shared/components/Button";
import { BvhPreview } from "@/features/pose-viewer/components/BvhPreview";
import { RefineBadge } from "@/features/pose-viewer/components/RefineBadge";
import { useSelectionReview } from "@/features/pose-viewer/hooks/useSelectionReview";
import { usePoseSelectionStore } from "@/features/pose-viewer/store/poseSelectionStore";
import { BarShell } from "../components/BarShell";

/**
 * 바 모드의 저장 전 확인(ADR-010). 앱 모드 ReviewPage와 같은 훅을 쓰고 레이아웃만 다르다.
 *
 * 420px 폭에 여러 인물을 한 번에 넣을 수 없어 BarCandidatesPage와 같은 스테퍼로 넘긴다.
 */
export function BarReviewPage() {
  const navigate = useNavigate();
  const jobId = usePoseSelectionStore((s) => s.jobId);
  const [cursor, setCursor] = useState(0);
  const { items, isRefining } = useSelectionReview(jobId ?? undefined);

  if (!jobId) return <Navigate to="/bar/actions" replace />;
  if (!isRefining && items.length === 0) return <Navigate to="/bar/candidates" replace />;

  const item = items[Math.min(cursor, items.length - 1)];

  return (
    <BarShell title="저장할 포즈 확인">
      <div className="flex h-full flex-col gap-2 p-2">
        {items.length > 1 && (
          <div className="flex shrink-0 items-center justify-between px-1">
            <button
              type="button"
              aria-label="이전 인물"
              disabled={cursor === 0}
              onClick={() => setCursor((i) => Math.max(0, i - 1))}
              className={stepperClass}
            >
              <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
            </button>
            <span className="text-[11px] font-semibold text-text-secondary">
              인물 {cursor + 1} / {items.length}
            </span>
            <button
              type="button"
              aria-label="다음 인물"
              disabled={cursor >= items.length - 1}
              onClick={() => setCursor((i) => Math.min(items.length - 1, i + 1))}
              className={stepperClass}
            >
              <ChevronRight className="h-3.5 w-3.5" aria-hidden />
            </button>
          </div>
        )}

        <div className="flex min-h-0 flex-1 flex-col gap-1.5">
          {item?.exportUrl ? (
            <BvhPreview url={item.exportUrl} label={item.candidate.title} />
          ) : (
            <div className="flex flex-1 items-center justify-center text-[11px] text-text-secondary">
              미리보기를 사용할 수 없습니다.
            </div>
          )}
          {item && !item.skipped && <RefineBadge refined={item.refined} compact />}
        </div>

        <div className="flex shrink-0 items-center gap-1.5 border-t border-border pt-2">
          <Button
            variant="ghost"
            size="sm"
            className="min-w-0 flex-1"
            onClick={() => navigate("/bar/candidates")}
          >
            다시 고르기
          </Button>
          <Button
            size="sm"
            className="min-w-0 flex-1"
            disabled={isRefining}
            onClick={() => navigate("/bar/save")}
          >
            {isRefining ? (
              <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" aria-hidden />
            ) : (
              <Save className="h-3.5 w-3.5 shrink-0" aria-hidden />
            )}
            {isRefining ? "조정 중…" : "이 포즈로 저장"}
          </Button>
        </div>
      </div>
    </BarShell>
  );
}

const stepperClass = cn(
  "flex h-6 w-6 items-center justify-center rounded transition-colors",
  "text-text-secondary hover:bg-surface-2 hover:text-text-primary",
  "disabled:cursor-not-allowed disabled:opacity-40",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-sky",
);
