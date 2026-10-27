import { usePreviewJourney } from "./usePreviewJourney";
import { failureProperties } from "./failureProperties";
import { useCallback, useEffect, useRef } from "react";
import { trackEvent } from "./analyticsClient";

export function useThumbnailJourney(
  jobId: string | undefined,
  candidateId: string,
  failed: boolean,
  imageKey?: string,
  error?: unknown,
) {
  const preview = usePreviewJourney(jobId, imageKey, "pose_selection", "candidate_image");
  const reported = useRef<string>();
  const report = useCallback(() => {
    const key = `${jobId}:${candidateId}:${imageKey}`;
    if (!jobId || reported.current === key) return;
    reported.current = key;
    preview("failed");
    trackEvent(
      "thumbnail_failed",
      {
        ...failureProperties(error, "pose_selection"),
        candidateId,
        code: error ? failureProperties(error, "pose_selection").code : "IMAGE_UNAVAILABLE",
      },
      jobId,
    );
  }, [jobId, candidateId, imageKey, error, preview]);
  useEffect(() => {
    if (failed) report();
  }, [failed, report]);
  return Object.assign(report, { onLoad: () => preview("ready") });
}
