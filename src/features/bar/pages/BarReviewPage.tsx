import "@/shared/styles/horizontal-scroll.css";
import { GeneratedFbxNotice } from "@/features/pose-viewer/components/GeneratedFbxNotice";
import { HandChips } from "@/features/hand-selection/HandChips";
import { Navigate, useNavigate } from "react-router-dom";
import { Loader2, Save } from "lucide-react";
import { Button } from "@/shared/components/Button";
import { useFramedReview } from "@/features/pose-viewer/hooks/useFramedReview";
import { ReviewPosePreview } from "@/features/pose-viewer/components/ReviewPosePreview";
import { usePoseSelectionStore } from "@/features/pose-viewer/store/poseSelectionStore";
import { BarShell } from "../components/BarShell";

/**
 * 바 모드의 저장 전 확인(ADR-010). 앱 모드 ReviewPage와 같은 훅을 쓰고 레이아웃만 다르다.
 *
 * 바는 높이가 좁아 카드도 설명도 못 넣는다. 대신 그림만 한 줄로 늘어놓는다 — 확인 화면이
 * 답해야 하는 질문은 "무엇이 저장되는가" 하나이고, 거기에는 그림이면 충분하다.
 */
export function BarReviewPage() {
  const navigate = useNavigate();
  const jobId = usePoseSelectionStore((s) => s.jobId);
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
  } = useFramedReview(jobId ?? undefined);

  if (!jobId) return <Navigate to="/bar/actions" replace />;
  if (!isRefining && items.length === 0) return <Navigate to="/bar/candidates" replace />;

  return (
    <BarShell title="저장할 포즈 확인">
      <div className={`flex h-full flex-col gap-2 p-2.5 ${hands?.enabled ? "min-h-[440px]" : ""}`}>
        <div className="flex min-h-0 flex-1 items-center justify-center gap-2 text-text-secondary">
          {isRefining ? (
            <>
              <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden />
              <span className="text-[12px]">포즈를 조정하는 중…</span>
            </>
          ) : (
            <ul
              tabIndex={0}
              aria-label="저장할 인물 포즈"
              className={`horizontal-scroll flex w-full min-w-0 items-center gap-1.5 overflow-x-auto overflow-y-hidden pb-2 ${items.length === 1 ? "justify-center" : "justify-start"}`}
            >
              {items.map((item) => (
                <li
                  key={item.personIndex}
                  className={`min-w-[160px] flex-1 basis-0 ${items.length === 1 ? "max-w-[320px]" : "max-w-[256px]"}`}
                >
                  <ReviewPosePreview
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
                  {item.previewReference && (
                    <p className="px-2 text-[10px] text-text-secondary">
                      포즈만 확인하는 모습이에요. BVH에는 체형{item.includesHands ? "·손 모양" : ""}{" "}
                      없이 전체 동작이 저장돼요.
                    </p>
                  )}
                  {item.scopeLabel && (
                    <p className="text-center text-[10px] text-text-secondary">{item.scopeLabel}</p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        {hands?.enabled && (
          <div className="max-h-[180px] shrink-0 overflow-y-auto">
            {items.map((item) => (
              <HandChips
                key={item.personIndex}
                state={hands}
                personIndex={item.personIndex}
                compact
              />
            ))}
          </div>
        )}
        {preparationLoading && !isRefining && (
          <p role="status" className="text-[11px] text-text-secondary">
            {preparationNotice}
          </p>
        )}
        {requiresFbx && <GeneratedFbxNotice />}
        {(preparationError || previewError) && (
          <p role="alert" className="text-[11px] text-brand-coral">
            {preparationError
              ? previewFailure.message
              : "미리보기를 표시하지 못했어요. 준비된 파일은 다운로드할 수 있어요."}{" "}
            <button
              onClick={() =>
                previewFailure.action === "choose"
                  ? navigate("/bar/candidates")
                  : void retryPreview()
              }
              className="underline"
            >
              {previewFailure.label}
            </button>
          </p>
        )}
        {!previewLoading && !previewError && !requiresFbx && previewNotice && (
          <p className="truncate text-[10px] text-text-secondary" title={previewNotice}>
            {previewNotice}
          </p>
        )}
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
            disabled={!downloadReady}
            onClick={() => {
              if (requestDownload()) navigate("/bar/save");
            }}
          >
            <Save className="h-3.5 w-3.5 shrink-0" aria-hidden />
            {downloadLabel}
          </Button>
        </div>
      </div>
    </BarShell>
  );
}
