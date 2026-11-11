import { useEffect, useRef, useSyncExternalStore } from "react";
import { safeStorage } from "@/shared/lib/safeStorage";
import { analyticsConsentId, subscribeAnalyticsConsent, trackEvent } from "./analyticsClient";
export type Feature =
  | "hand_library"
  | "semantic_search"
  | "body_selection"
  | "body_custom"
  | "history"
  | "capture"
  | "file_input"
  | "clipboard"
  | "analysis"
  | "pose_selection"
  | "export";
export type Action =
  | "exposure"
  | "open"
  | "search_started"
  | "search_completed"
  | "search_failed"
  | "cancelled"
  | "selected"
  | "applied"
  | "adjusted"
  | "reset"
  | "creation_started"
  | "saved"
  | "reused"
  | "failed"
  | "upload_started"
  | "upload_completed"
  | "upload_failed"
  | "preview_started"
  | "preview_completed"
  | "preview_failed";
type Props = Record<string, string | number | boolean | null>;
const usageKey = "standin.analytics.feature-usage.v1";
function readUsage(): Record<string, Feature[]> {
  try {
    const stored = JSON.parse(safeStorage.getItem(usageKey) ?? "null");
    if (
      analyticsConsentId() &&
      stored?.consentId === analyticsConsentId() &&
      stored?.jobs &&
      typeof stored.jobs === "object"
    )
      return Object.fromEntries(
        Object.entries(stored.jobs).filter(
          ([job, values]) =>
            /^[a-zA-Z0-9_-]{1,128}$/.test(job) &&
            Array.isArray(values) &&
            values.every((v) => typeof v === "string"),
        ),
      ) as Record<string, Feature[]>;
  } catch {
    /* corrupt local metadata is not an application error */
  }
  return {};
}
export function featureAction(
  feature: Feature,
  action: Action,
  jobId?: string,
  properties: Props = {},
) {
  if (analyticsConsentId() && jobId && ["applied", "reused", "search_completed"].includes(action)) {
    const jobs = readUsage();
    jobs[jobId] = [...new Set([...(jobs[jobId] ?? []), feature])];
    const entries = Object.entries(jobs).slice(-100);
    safeStorage.setItem(
      usageKey,
      JSON.stringify({ consentId: analyticsConsentId(), jobs: Object.fromEntries(entries) }),
    );
  }
  trackEvent("feature_action", { feature, action, ...properties }, jobId);
}
export function featureAttribution(jobId: string) {
  const features = new Set(readUsage()[jobId] ?? []);
  return {
    usedHandLibrary: features?.has("hand_library") ?? false,
    usedBodySelection: features?.has("body_selection") ?? false,
    usedBodyCustom: features?.has("body_custom") ?? false,
    fromHistory: features?.has("history") ?? false,
    fromSemanticSearch: features?.has("semantic_search") ?? false,
  };
}
export function useFeatureView(
  feature: Feature,
  available: boolean,
  action: "exposure" | "open" | "creation_started" = "exposure",
  jobId?: string,
  scope = "",
  properties: Props = {},
) {
  const consent = useSyncExternalStore(subscribeAnalyticsConsent, analyticsConsentId, () => null);
  const seen = useRef<string>();
  const propertyKey = JSON.stringify(properties);
  useEffect(() => {
    const key = `${consent}:${feature}:${action}:${jobId}:${scope}`;
    if (!consent || !available || seen.current === key) return;
    seen.current = key;
    featureAction(feature, action, jobId, JSON.parse(propertyKey) as Props);
  }, [consent, feature, available, action, jobId, scope, propertyKey]);
}
export function journeyExit(
  feature: Feature,
  phase: string,
  reason: "back" | "home" | "close" | "cancel",
  jobId?: string,
) {
  trackEvent("journey_exit", { feature, phase, reason }, jobId);
}
import { failureProperties } from "./failureProperties";
export { failureProperties };
export function useFeatureFailure(feature: Feature, error: unknown, jobId?: string) {
  const consent = useSyncExternalStore(subscribeAnalyticsConsent, analyticsConsentId, () => null);
  const seen = useRef<unknown>();
  useEffect(() => {
    if (!consent || !error) {
      seen.current = undefined;
      return;
    }
    if (seen.current === error) return;
    seen.current = error;
    featureAction(feature, "failed", jobId, failureProperties(error, feature));
  }, [consent, feature, error, jobId]);
}
