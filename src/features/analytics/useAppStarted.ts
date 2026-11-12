import type { InstallationEnvironment } from "@/features/installation/installationStore";
import { useEffect, useSyncExternalStore } from "react";
import {
  analyticsConsentId,
  subscribeAnalyticsConsent,
  trackEvent,
  refreshJourneyCapability,
} from "./analyticsClient";
const started = new Set<string>();
export function useAppStarted(
  installationId: string | undefined,
  environment: () => Promise<InstallationEnvironment>,
) {
  const consent = useSyncExternalStore(subscribeAnalyticsConsent, analyticsConsentId, () => null);
  useEffect(() => {
    if (!installationId || !consent || started.has(installationId)) return;
    let cancelled = false;
    void refreshJourneyCapability();
    void environment()
      .catch(() => ({}))
      .then((metadata) => {
        if (cancelled || analyticsConsentId() !== consent || started.has(installationId)) return;
        trackEvent("app_started", { ...metadata, locale: navigator.language || "unknown" });
        started.add(installationId);
        if (started.size > 50) started.delete(started.values().next().value!);
      });
    return () => {
      cancelled = true;
    };
  }, [installationId, consent, environment]);
}
