import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import { analyticsConsentId, subscribeAnalyticsConsent } from "./analyticsClient";
import { featureAction, type Feature } from "./featureJourney";
/** URL/model identity stays local. Measures only the observed render/load boundary. */
export function usePreviewJourney(
  jobId: string | undefined,
  identity: unknown,
  feature: Feature,
  phase: string,
) {
  const consent = useSyncExternalStore(subscribeAnalyticsConsent, analyticsConsentId, () => null);
  const attempt = useRef<{
    identity: unknown;
    consent: string;
    jobId: string;
    attemptId: string;
    startedAt: number;
    done: boolean;
  }>();
  const begin = useCallback(() => {
    if (!consent || !jobId || !identity) return;
    if (
      attempt.current?.identity === identity &&
      attempt.current.consent === consent &&
      attempt.current.jobId === jobId
    )
      return attempt.current;
    const next = {
      identity,
      consent,
      jobId,
      attemptId: crypto.randomUUID(),
      startedAt: Date.now(),
      done: false,
    };
    attempt.current = next;
    featureAction(feature, "preview_started", jobId, { attemptId: next.attemptId, phase });
    return next;
  }, [consent, jobId, identity, feature, phase]);
  useEffect(() => {
    begin();
  }, [begin]);
  return useCallback(
    (status: "ready" | "failed") => {
      const active = begin();
      if (!active || active.done) return;
      active.done = true;
      featureAction(feature, status === "ready" ? "preview_completed" : "preview_failed", jobId, {
        attemptId: active.attemptId,
        phase,
        elapsedMs: Math.max(0, Date.now() - active.startedAt),
        ...(status === "failed" ? { errorCategory: "unknown", code: "IMAGE_UNAVAILABLE" } : {}),
      });
    },
    [begin, feature, jobId, phase],
  );
}
