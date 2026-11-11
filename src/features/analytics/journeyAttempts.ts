import { featureAttribution } from "./featureJourney";
import { currentSurface, trackEvent, type Surface } from "./analyticsClient";

export type ExportAttempt = {
  attemptId: string;
  startedAt: number;
  surface: Surface;
  attribution: ReturnType<typeof featureAttribution>;
};
const pending = new Map<string, ExportAttempt>();

/** The review button and native save must share an attempt, even across route changes. */
export function requestExport(jobId: string, trigger = "review_button"): ExportAttempt {
  const attempt = {
    attemptId: crypto.randomUUID(),
    startedAt: Date.now(),
    surface: currentSurface(),
    attribution: featureAttribution(jobId),
  };
  pending.set(jobId, attempt);
  if (pending.size > 50) pending.delete(pending.keys().next().value!);
  trackEvent(
    "export_requested",
    { attemptId: attempt.attemptId, surface: attempt.surface, trigger, ...attempt.attribution },
    jobId,
  );
  return attempt;
}

export function takeExportAttempt(jobId: string): ExportAttempt {
  const attempt = pending.get(jobId) ?? requestExport(jobId, "save_attempt");
  pending.delete(jobId);
  return attempt;
}

export function attemptProperties(attempt: ExportAttempt) {
  return {
    ...attempt.attribution,
    attemptId: attempt.attemptId,
    surface: attempt.surface,
    elapsedMs: Math.max(0, Date.now() - attempt.startedAt),
  };
}
