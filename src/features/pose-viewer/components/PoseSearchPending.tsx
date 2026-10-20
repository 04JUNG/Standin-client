import { useState } from "react";
import { ImageOff, Loader2 } from "lucide-react";
import { cn } from "@/shared/lib/cn";
import type { UploadDraft } from "@/shared/types/upload";

type PoseSearchPendingProps = {
  preview?: Pick<UploadDraft, "previewUrl" | "originalName"> | null;
  compact?: boolean;
  restoring?: boolean;
};

/** 앱과 바의 검색 대기 화면. 원본은 그대로 두고 테두리만 천천히 움직인다. */
export function PoseSearchPending({
  preview,
  compact = false,
  restoring = false,
}: PoseSearchPendingProps) {
  const [failedPreviewUrl, setFailedPreviewUrl] = useState<string | null>(null);
  const showImage = preview?.previewUrl && preview.previewUrl !== failedPreviewUrl;

  return (
    <div
      className={cn(
        "flex w-full min-w-0 flex-col items-center text-center",
        compact ? "gap-4 py-4" : "gap-6 py-6",
      )}
    >
      {/* 기록 조회에는 다른 작업의 draft가 남아 있을 수 있어 원본을 표시하지 않는다. */}
      {!restoring && (
        <figure className={cn("w-full min-w-0", compact ? "max-w-[320px]" : "max-w-[440px]")}>
          <div className="relative isolate overflow-hidden rounded-2xl bg-border p-[2px] shadow-sm">
            <span
              aria-hidden="true"
              className="pointer-events-none absolute -inset-full bg-[conic-gradient(var(--border)_45%,var(--brand-sky)_60%,var(--brand-coral)_70%,var(--border)_85%)] opacity-70 motion-safe:animate-[spin_12s_linear_infinite]"
            />
            <div className="relative rounded-[14px] bg-surface-0 p-3">
              <div
                className={cn(
                  "flex items-center justify-center overflow-hidden rounded-lg bg-brand-paper p-3",
                  compact ? "h-[164px]" : "h-[clamp(160px,32vh,280px)]",
                )}
              >
                {showImage ? (
                  <img
                    src={preview.previewUrl}
                    alt="검색 중인 러프"
                    decoding="async"
                    onError={() => setFailedPreviewUrl(preview.previewUrl)}
                    className="h-full w-full object-contain"
                  />
                ) : (
                  <div className="flex flex-col items-center gap-2 text-text-secondary">
                    <ImageOff className="h-6 w-6" aria-hidden="true" />
                    <p className="text-[12px]">러프 미리보기를 표시할 수 없어요.</p>
                    <p className="text-[12px]">포즈 검색은 계속 진행됩니다.</p>
                  </div>
                )}
              </div>
            </div>
          </div>
          <figcaption
            className={cn(
              "mt-3 flex min-w-0 items-center justify-center text-[12px] text-text-secondary",
              compact ? "flex-col gap-1" : "gap-2",
            )}
          >
            <span className="shrink-0">검색 중인 러프</span>
            {preview?.originalName && (
              <span className="max-w-full truncate" title={preview.originalName}>
                {!compact && "· "}
                {preview.originalName}
              </span>
            )}
          </figcaption>
        </figure>
      )}

      <div role="status" className="flex flex-col items-center gap-2">
        <p
          className={cn(
            "flex items-center justify-center gap-2 font-semibold text-text-primary",
            compact ? "text-[13px]" : "text-[16px]",
          )}
        >
          <Loader2
            className="h-4 w-4 shrink-0 text-brand-coral motion-safe:animate-spin"
            aria-hidden="true"
          />
          {restoring ? "이전 분석 결과를 불러오고 있어요" : "가까운 포즈 후보를 찾고 있어요"}
        </p>
        <p className="text-[12px] text-text-secondary">
          {restoring ? "잠시만 기다려 주세요." : "준비되면 이 화면에 후보가 나타나요."}
        </p>
      </div>
    </div>
  );
}
