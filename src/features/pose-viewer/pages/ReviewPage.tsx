import { HandChips } from "@/features/hand-selection/HandChips";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { ImageOff, Loader2, Save } from "lucide-react";
import { AppShell } from "@/shared/components/AppShell";
import { Button } from "@/shared/components/Button";
import { useFramedReview } from "../hooks/useFramedReview";
import { ReviewModelPreview } from "../components/ReviewModelPreview";
import { tourAnchor } from "@/shared/lib/tourAnchor";

/**
 * 저장 직전 확인 화면(ADR-010).
 *
 * 저장 화면은 진입 즉시 자동 저장한다(ADR-009). 조정이 걸리면 되돌릴 수 없으므로 그 전에
 * 한 번 멈추는 자리가 필요하다.
 *
 * 모델 지원 시 최종 표면을 GPU에 유지하고, 미지원 기기는 범위별 PNG를 쓴다.
 * 지원하지 않는 서버/BVH 경로는 기존 후보·보정 미리보기를 유지한다.
 */
export function ReviewPage() {
  const { jobId } = useParams<{ jobId: string }>();
  const navigate = useNavigate();
  const {
    items,
    hands,
    isRefining,
    previewLoading,
    previewError,
    previewNotice,
    retryPreview,
    shapedBake,
  } = useFramedReview(jobId);

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
          <div className="flex flex-col gap-3 rounded-xl border border-border bg-surface-0 p-4">
            <p className="text-[13px] text-text-secondary">
              {hands?.pending || previewLoading
                ? "최종 미리보기를 준비하고 있습니다…"
                : "아래 포즈를 확인한 뒤 저장하세요."}
            </p>
            <ul className="grid grid-cols-2 gap-3">
              {items.map((item) => (
                <li
                  key={item.personIndex}
                  className="flex flex-col overflow-hidden rounded-lg border border-border"
                >
                  {item.previewModel ? (
                    <ReviewModelPreview model={item.previewModel} onStatus={item.onModelStatus} />
                  ) : item.previewUrl ? (
                    <img
                      src={item.previewUrl}
                      alt={
                        item.previewReference
                          ? `인물 ${item.personIndex + 1}의 원본 BVH 포즈 참고`
                          : `인물 ${item.personIndex + 1}에 저장될 포즈${item.scopeLabel ? ` · ${item.scopeLabel}` : ""}`
                      }
                      className="aspect-square w-full bg-surface-2 object-contain"
                    />
                  ) : (
                    <div className="flex aspect-square w-full items-center justify-center bg-surface-2 text-text-secondary">
                      <ImageOff className="h-6 w-6" aria-hidden />
                    </div>
                  )}
                  <div className="flex flex-col gap-0.5 p-2">
                    <span className="text-[13px] font-semibold text-text-primary">
                      인물 {item.personIndex + 1}
                      {item.scopeLabel ? ` · ${item.scopeLabel}` : ""}
                    </span>
                    <span className="truncate text-[12px] text-text-secondary">
                      {item.candidate.title}
                    </span>
                    {item.candidate.manualExportAllowed && (
                      <p className="text-[11px] text-text-secondary">
                        직접 선택한 포즈 · 러프에 맞춘 자동 보정 없음
                      </p>
                    )}
                    {item.previewReference && (
                      <p className="px-2 text-[10px] text-text-secondary">
                        포즈 참고 · 체형·손 미적용 · BVH는 전체 관절로 저장
                      </p>
                    )}
                    {/* 조정 여부는 그림만 봐서는 알 수 없다. 러프에 맞춰 손댄 결과라는 것을
                        알아야 "후보와 조금 다른데"가 오류로 읽히지 않는다. */}
                    {item.refined && (
                      <span className="mt-0.5 inline-flex w-fit rounded bg-brand-sky/20 px-1.5 py-0.5 text-[11px] font-semibold text-text-primary">
                        러프에 맞춰 조정됨
                      </span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
            {hands?.enabled &&
              items.map((item) => (
                <HandChips key={item.personIndex} state={hands} personIndex={item.personIndex} />
              ))}
          </div>
        )}

        {previewNotice && <p className="text-[12px] text-text-secondary">{previewNotice}</p>}
        {previewLoading && (
          <p role="status" className="text-[12px] text-text-secondary">
            {shapedBake
              ? "조절한 체형을 실제 포즈에 반영하는 중… 1~2분 걸릴 수 있어요."
              : "선택한 범위의 미리보기를 만드는 중…"}
          </p>
        )}
        {previewError && (
          <div role="alert" className="text-[12px] text-brand-coral">
            미리보기를 만들지 못했습니다.{" "}
            <button onClick={retryPreview} className="underline">
              다시 시도
            </button>
          </div>
        )}
        <div className="mt-auto flex items-center justify-between gap-4 border-t border-border pt-4">
          <Button variant="ghost" onClick={() => navigate(`/app/jobs/${jobId}`)}>
            후보 다시 고르기
          </Button>
          <Button
            {...tourAnchor("review.confirm")}
            size="lg"
            disabled={isRefining || previewLoading || previewError}
            onClick={() => navigate(`/app/jobs/${jobId}/save`)}
          >
            <Save className="h-4 w-4" aria-hidden />이 포즈로 저장 ({items.length})
          </Button>
        </div>
      </div>
    </AppShell>
  );
}
