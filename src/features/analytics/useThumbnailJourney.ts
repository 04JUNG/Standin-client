import { useCallback, useEffect, useRef } from "react";
import { trackEvent } from "./analyticsClient";

export function useThumbnailJourney(
  jobId: string | undefined,
  candidateId: string,
  failed: boolean,
  imageKey?: string,
) {
  const reported = useRef<string>();
  const report = useCallback(() => {
    const key = `${jobId}:${candidateId}:${imageKey}`;
    if (!jobId || reported.current === key) return;
    reported.current = key;
    trackEvent("thumbnail_failed", { candidateId, code: "IMAGE_UNAVAILABLE" }, jobId);
  }, [jobId, candidateId, imageKey]);
  useEffect(() => {
    if (failed) report();
  }, [failed, report]);
  return report;
}
