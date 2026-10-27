import { usePreviewJourney } from "@/features/analytics/usePreviewJourney";
import { useState } from "react";
import { ImageOff, Loader2 } from "lucide-react";
import type { ReviewModel } from "../preview/mountReviewModel";
import { ReviewModelPreview } from "./ReviewModelPreview";

/** A review stays visibly busy until its actual image or model is on screen. */
export function ReviewPosePreview({
  model,
  src,
  label,
  title,
  loading,
  error,
  onModelStatus,
  telemetryJobId,
}: {
  telemetryJobId?: string;
  model?: ReviewModel;
  src?: string;
  label: string;
  title?: string;
  loading: boolean;
  error: boolean;
  onModelStatus: (status: "ready" | "failed") => void;
}) {
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
      {model ? (
        <ReviewModelPreview
          model={model}
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
      {pending && (
        <div className="absolute inset-0 flex items-center justify-center" role="status">
          <Loader2
            className="h-8 w-8 animate-spin text-brand-sky motion-reduce:animate-none"
            aria-hidden
          />
          <span className="sr-only">{label} 불러오는 중</span>
        </div>
      )}
      {failed && (
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
