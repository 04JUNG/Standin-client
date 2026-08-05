import { Navigate, useNavigate, useParams } from "react-router-dom";
import { Loader2, Save } from "lucide-react";
import { AppShell } from "@/shared/components/AppShell";
import { Button } from "@/shared/components/Button";
import { LazyBvhPreview } from "../components/LazyBvhPreview";
import { RefineBadge } from "../components/RefineBadge";
import { useSelectionReview } from "../hooks/useSelectionReview";

/**
 * 저장 직전 확인 화면(ADR-010, FE-04).
 *
 * 저장 화면은 진입 즉시 자동 저장한다(ADR-009). refine이 적용되면 작가가 후보 카드에서
 * 고른 포즈와 실제로 저장되는 포즈가 달라지므로, 저장을 되돌릴 수 없게 되기 전에 실제
 * 저장 대상을 보여 주는 단계를 사이에 둔다.
 */
export function ReviewPage() {
  const { jobId } = useParams<{ jobId: string }>();
  const navigate = useNavigate();
  const { items, isRefining } = useSelectionReview(jobId);

  if (!jobId) return <Navigate to="/app/home" replace />;
  if (!isRefining && items.length === 0) return <Navigate to={`/app/jobs/${jobId}`} replace />;

  return (
    <AppShell title="저장할 포즈 확인">
      <div className="flex h-full flex-col gap-4">
        <p className="text-[13px] text-text-secondary">
          아래 포즈가 저장됩니다. 러프에 맞춰 조정된 경우 후보 썸네일과 다를 수 있습니다.
        </p>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => (
            <div
              key={item.personIndex}
              className="flex flex-col gap-2 rounded-xl border border-border bg-surface-0 p-3"
            >
              <div className="flex items-center justify-between">
                <span className="text-[13px] font-semibold text-text-primary">
                  인물 {item.personIndex + 1}
                </span>
                <span className="text-[12px] text-text-secondary">{item.candidate.title}</span>
              </div>
              {item.exportUrl ? (
                <LazyBvhPreview url={item.exportUrl} label={item.candidate.title} />
              ) : (
                <div className="flex aspect-[4/3] items-center justify-center rounded-lg bg-surface-2 text-[12px] text-text-secondary">
                  미리보기를 사용할 수 없습니다.
                </div>
              )}
              {/* refine을 시도조차 하지 않은 선택(저신뢰 인물·기능 off)은 배지를 달지
                  않는다 — "원본을 유지했다"는 안전 판정이 있었던 것처럼 읽힌다. */}
              {!item.skipped && <RefineBadge refined={item.refined} />}
            </div>
          ))}
        </div>

        <div className="mt-auto flex items-center justify-between gap-4 border-t border-border pt-4">
          <Button variant="ghost" onClick={() => navigate(`/app/jobs/${jobId}`)}>
            후보 다시 고르기
          </Button>
          <Button
            size="lg"
            disabled={isRefining}
            onClick={() => navigate(`/app/jobs/${jobId}/save`)}
          >
            {isRefining ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                포즈를 조정하는 중…
              </>
            ) : (
              <>
                <Save className="h-4 w-4" aria-hidden />이 포즈로 저장 ({items.length})
              </>
            )}
          </Button>
        </div>
      </div>
    </AppShell>
  );
}
