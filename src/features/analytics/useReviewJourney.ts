import { useEffect, useRef } from "react";
import { currentSurface, trackEvent } from "./analyticsClient";

/** Observation only: never controls readiness, retries, or file identity. */
export function useReviewJourney(input: {
  jobId?: string;
  binding: string;
  ready: boolean;
  failed: boolean;
  format: string;
}) {
  const seen = useRef<string>();
  const preparation = useRef<{
    key: string;
    attemptId: string;
    startedAt: number;
    outcome?: string;
  }>();
  const { jobId, binding, ready, failed, format } = input;
  useEffect(() => {
    if (!jobId) return;
    const key = `${jobId}:${binding}:${format}`;
    if (seen.current !== jobId) {
      seen.current = jobId;
      trackEvent("review_viewed", { format, surface: currentSurface() }, jobId);
    }
    if (preparation.current?.key !== key || (!ready && !failed && preparation.current.outcome)) {
      preparation.current = { key, attemptId: crypto.randomUUID(), startedAt: Date.now() };
      trackEvent(
        "preparation_started",
        { attemptId: preparation.current.attemptId, format },
        jobId,
      );
    }
    const attempt = preparation.current;
    const outcome = failed ? "failed" : ready ? "ready" : undefined;
    if (!outcome || attempt.outcome === outcome) return;
    attempt.outcome = outcome;
    trackEvent(
      outcome === "ready" ? "preparation_ready" : "preparation_failed",
      {
        attemptId: attempt.attemptId,
        elapsedMs: Math.max(0, Date.now() - attempt.startedAt),
        format,
        ...(failed ? { code: "PREPARATION_UNAVAILABLE" } : {}),
      },
      jobId,
    );
  }, [jobId, binding, ready, failed, format]);
}
