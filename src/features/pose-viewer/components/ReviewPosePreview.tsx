import { InteractiveReview, type InteractiveReviewData } from "../interactive/InteractiveReview";
import { usePreviewJourney } from "@/features/analytics/usePreviewJourney";
import { useState } from "react";
import { ImageOff, Loader2 } from "lucide-react";
import type { PoseCandidate } from "../api/pose.contract";
import { candidatePosterOptions } from "../api/candidatePoster";
import { useDefaultPosePoster } from "../api/posePoster";
import type { ReviewModel } from "../preview/mountReviewModel";
import { ReviewModelPreview } from "./ReviewModelPreview";

/** A review stays visibly busy until its actual image or model is on screen. */
export function ReviewPosePreview({
  model,
  interactive,
  candidate,
  src,
  label,
  title,
  loading,
  error,
  onModelStatus,
  outlineWidth = 0,
  telemetryJobId,
}: {
  outlineWidth?: number;
  telemetryJobId?: string;
  model?: ReviewModel;
  interactive?: InteractiveReviewData;
  candidate?: PoseCandidate;
  src?: string;
  label: string;
  title?: string;
  loading: boolean;
  error: boolean;
  onModelStatus: (status: "ready" | "failed") => void;
}) {
  const posterOptions = candidatePosterOptions(candidate);
  // Reuse the candidate-card query. In a cold cache only ask for the
  // directional reference, never start another final model or FBX operation.
  const poster = useDefaultPosePoster({
    ...posterOptions,
    enabled: !!interactive && !src && !!candidate && posterOptions.directional,
  });
  const referenceSrc = src || (candidate && (poster.data?.url || candidate.quickThumbnailUrl));
  const [failedReference, setFailedReference] = useState<string>();
  const fallback = interactive && referenceSrc && referenceSrc !== failedReference ? (
    <>
      <img
        key={referenceSrc}
        src={referenceSrc}
        alt="선택한 포즈의 참고 이미지"
        className="absolute inset-0 h-full w-full object-contain"
        onError={() => setFailedReference(referenceSrc)}
      />
      {!src && (
        <span className="absolute left-2 top-2 rounded bg-surface-0/95 px-1.5 py-0.5 text-[10px] text-text-secondary">
          후보 포즈 참고 이미지
        </span>
      )}
    </>
  ) : undefined;
  const reportPreview = usePreviewJourney(
    telemetryJobId,
    model ?? src,
    "export",
    model ? "review_model" : "review_image",
  );
  const [image, setImage] = useState<{ src: string; status: "ready" | "failed" }>();
  const [surface, setSurface] = useState<{ model: ReviewModel; status: "ready" | "failed" }>();
  const imageStatus = image?.src === src ? image?.status : undefined;
  const modelStatus = surface?.model === model ? surface?.status : undefined;
  const pending = model ? !modelStatus : src ? !imageStatus : loading && !error;
  const failed = model ? modelStatus === "failed" : src ? imageStatus === "failed" : !pending;

  return (
    <div
      className="relative aspect-square w-full overflow-hidden rounded border border-border bg-surface-2"
      aria-busy={pending}
      title={title}
    >
      {interactive ? (
        <InteractiveReview data={interactive} fallback={fallback} />
      ) : model ? (
        <ReviewModelPreview
          model={model}
          outlineWidth={outlineWidth}
          label={label}
          onStatus={(status) => {
            reportPreview(status);
            setSurface({ model, status });
            onModelStatus(status);
          }}
        />
      ) : src && !failed ? (
        <img
          key={src}
          src={src}
          alt={label}
          className={`aspect-square w-full object-contain ${pending ? "invisible" : ""}`}
          onLoad={() => {
            reportPreview("ready");
            setImage({ src, status: "ready" });
          }}
          onError={() => {
            reportPreview("failed");
            setImage({ src, status: "failed" });
          }}
        />
      ) : null}
      {pending && !interactive && (
        <div className="absolute inset-0 flex items-center justify-center" role="status">
          <Loader2
            className="h-8 w-8 animate-spin text-brand-sky motion-reduce:animate-none"
            aria-hidden
          />
          <span className="sr-only">{label} 불러오는 중</span>
        </div>
      )}
      {failed && !interactive && (
        <div
          className="absolute inset-0 flex items-center justify-center text-text-secondary"
          role="img"
          aria-label={`${label}를 불러오지 못했어요`}
        >
          <ImageOff className="h-6 w-6" aria-hidden />
        </div>
      )}
    </div>
  );
}
