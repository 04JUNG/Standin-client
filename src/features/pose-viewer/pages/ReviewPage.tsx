import { Navigate, useNavigate, useParams } from "react-router-dom";
import { Loader2, Save } from "lucide-react";
import { AppShell } from "@/shared/components/AppShell";
import { Button } from "@/shared/components/Button";
import { useSelectionReview } from "../hooks/useSelectionReview";
import { tourAnchor } from "@/shared/lib/tourAnchor";

/**
 * 저장 직전 확인 화면(ADR-010).
 *
 * 저장 화면은 진입 즉시 자동 저장한다(ADR-009). 조정이 걸리면 되돌릴 수 없으므로 그 전에
 * 한 번 멈추는 자리가 필요하다.
 *
 * ⚠ 3D 미리보기는 뺐다. BVH를 그려 봤지만 실제 자세가 아니라 기본 T자 뼈대가 나왔고,
 *   그건 확인을 돕는 게 아니라 **틀린 것을 보여주는** 상태다(CLAUDE.md §10). 지금은
 *   조정이 도는 동안 진행 상태만 알리고, 무엇이 저장되는지는 목록으로 보여준다.
 *   미리보기를 되살리려면 실제 자세가 나오는 것을 먼저 확인해야 한다.
 */
export function ReviewPage() {
  const { jobId } = useParams<{ jobId: string }>();
  const navigate = useNavigate();
  const { items, isRefining } = useSelectionReview(jobId);

  if (!jobId) return <Navigate to="/app/home" replace />;
  if (!isRefining && items.length === 0) return <Navigate to={`/app/jobs/${jobId}`} replace />;

  return (
    <AppShell title="저장할 포즈 확인">
      <div className="mx-auto flex h-full w-full max-w-[520px] flex-col gap-4">
        {isRefining ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 text-text-secondary">
            <Loader2 className="h-8 w-8 animate-spin text-brand-sky" aria-hidden />
            <p className="text-[14px]">포즈를 러프에 맞춰 조정하고 있습니다…</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2 rounded-xl border border-border bg-surface-0 p-4">
            <p className="text-[13px] text-text-secondary">아래 포즈가 저장됩니다.</p>
            <ul className="flex flex-col divide-y divide-border">
              {items.map((item) => (
                <li key={item.personIndex} className="flex items-center justify-between gap-3 py-2">
                  <span className="text-[13px] font-semibold text-text-primary">
                    인물 {item.personIndex + 1}
                  </span>
                  <span className="truncate text-[12px] text-text-secondary">
                    {item.candidate.title}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="mt-auto flex items-center justify-between gap-4 border-t border-border pt-4">
          <Button variant="ghost" onClick={() => navigate(`/app/jobs/${jobId}`)}>
            후보 다시 고르기
          </Button>
          <Button
            {...tourAnchor("review.confirm")}
            size="lg"
            disabled={isRefining}
            onClick={() => navigate(`/app/jobs/${jobId}/save`)}
          >
            <Save className="h-4 w-4" aria-hidden />이 포즈로 저장 ({items.length})
          </Button>
        </div>
      </div>
    </AppShell>
  );
}
