import { LocalFbxPreview } from "@/features/personal-body/LocalFbxPreview";
import { journeyExit } from "@/features/analytics/featureJourney";
import { GeneratedFbxNotice } from "@/features/pose-viewer/components/GeneratedFbxNotice";
import { HandChips } from "@/features/hand-selection/HandChips";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { Loader2, Save } from "lucide-react";
import { AppShell } from "@/shared/components/AppShell";
import { Button } from "@/shared/components/Button";
import { useFramedReview } from "../hooks/useFramedReview";
import { ReviewPosePreview } from "../components/ReviewPosePreview";
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
    preparationLoading,
    preparationError,
    preparationNotice,
    downloadReady,
    downloadLabel,
    requestDownload,
    previewError,
    previewFailure,
    requiresFbx,
    previewNotice,
    retryPreview,
  } = useFramedReview(jobId);

  if (!jobId) return <Navigate to="/app/home" replace />;
  if (!isRefining && items.length === 0) return <Navigate to={`/app/jobs/${jobId}`} replace />;

  return (
    <AppShell title="저장할 포즈 확인">
      <div className="mx-auto flex h-full w-full max-w-[760px] flex-col gap-4">
        {isRefining ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 text-text-secondary">
            <Loader2 className="h-8 w-8 animate-spin text-brand-sky" aria-hidden />
            <p className="text-[14px]">포즈를 러프에 맞춰 조정하고 있습니다…</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3 rounded-xl border border-border bg-surface-0 p-4">
            <ul
              className={`grid gap-3 ${items.length === 1 ? "mx-auto w-full max-w-[clamp(140px,calc(100dvh_-_480px),480px)] grid-cols-1" : "grid-cols-2"}`}
            >
              {items.map((item) => (
                <li
                  key={item.personIndex}
                  className="flex flex-col overflow-hidden rounded-lg border border-border"
                >
                  {item.localName ? (
                    <LocalFbxPreview content={item.localFbx} name={item.localName} />
                  ) : (
                    <ReviewPosePreview
                      telemetryJobId={hands?.jobId}
                      model={item.previewModel}
                      src={item.previewUrl}
                      label={
                        item.previewReference
                          ? `인물 ${item.personIndex + 1}의 동작 미리보기`
                          : `인물 ${item.personIndex + 1}에 저장될 포즈${item.scopeLabel ? ` · ${item.scopeLabel}` : ""}`
                      }
                      loading={previewLoading}
                      error={previewError}
                      onModelStatus={item.onModelStatus}
                    />
                  )}
                  <div className="flex flex-col gap-0.5 p-2">
                    <span className="text-[13px] font-semibold text-text-primary">
                      인물 {item.personIndex + 1}
                      {item.scopeLabel ? ` · ${item.scopeLabel}` : ""}
                    </span>
                    <span className="truncate text-[12px] text-text-secondary">
                      {item.candidate.title}
                    </span>
                    {item.previewReference && (
                      <p className="px-2 text-[10px] text-text-secondary">
                        포즈만 확인하는 모습이에요. BVH에는 체형
                        {item.includesHands ? "·손 모양" : ""} 없이 전체 동작이 저장돼요.
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

        {!previewLoading && !previewError && !requiresFbx && previewNotice && (
          <p className="text-[12px] text-text-secondary">{previewNotice}</p>
        )}
        {preparationLoading && !isRefining && (
          <p role="status" className="text-[12px] text-text-secondary">
            {preparationNotice}
          </p>
        )}
        {requiresFbx && <GeneratedFbxNotice />}
        {(preparationError || previewError) && (
          <div role="alert" className="text-[12px] text-brand-coral">
            {preparationError
              ? previewFailure.message
              : "미리보기를 표시하지 못했어요. 준비된 파일은 다운로드할 수 있어요."}{" "}
            <button
              onClick={() =>
                previewFailure.action === "choose"
                  ? navigate(`/app/jobs/${jobId}`)
                  : void retryPreview()
              }
              className="underline"
            >
              {previewFailure.label}
            </button>
          </div>
        )}
        <div className="mt-auto flex items-center justify-between gap-4 border-t border-border pt-4">
          <Button
            variant="ghost"
            onClick={() => {
              journeyExit("export", "review", "back", hands?.jobId);
              navigate(`/app/jobs/${jobId}`);
            }}
          >
            후보 다시 고르기
          </Button>
          <Button
            {...tourAnchor("review.confirm")}
            size="lg"
            disabled={!downloadReady}
            onClick={() => {
              if (requestDownload()) navigate(`/app/jobs/${jobId}/save`);
            }}
          >
            <Save className="h-4 w-4" aria-hidden />
            {downloadLabel} ({items.length})
          </Button>
        </div>
      </div>
    </AppShell>
  );
}
