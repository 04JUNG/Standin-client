import { useEffect } from "react";
import { useInstallationStore } from "@/features/installation/installationStore";
import { useQualityConsentStore } from "@/features/installation/qualityConsentStore";
import { observeReplay } from "@/shared/lib/replayBridge";
import {
  beginReplay,
  flushReplay,
  stopReplay,
  withdrawReplay,
  replayGap,
  replayActive,
} from "./client";

export function ReplayBootstrap() {
  const status = useInstallationStore((s) => s.status);
  const owner = useInstallationStore((s) => s.credentials?.installationId);
  const consentId = useQualityConsentStore((s) => s.consent.consentId);
  useEffect(() => {
    const off = observeReplay((tag) => {
      if (tag === "replay_withdraw")
        void withdrawReplay().catch(() => replayGap("withdrawal_pending"));
    });
    return off;
  }, []);
  useEffect(() => {
    if (status !== "registered" || !owner) {
      stopReplay();
      return;
    }
    let cancelled = false;
    let cleanup: (() => void) | undefined;
    void beginReplay(owner, consentId ?? undefined)
      .then(() => {
        if (!cancelled && replayActive())
          void import("./recorder")
            .then(({ startRecorder }) => {
              if (!cancelled) cleanup = startRecorder();
            })
            .catch(() => replayGap("recorder_unavailable"));
      })
      .catch(() => replayGap("recorder_unavailable"));
    const online = () => {
      void flushReplay();
    };
    const timer = setInterval(online, 10_000);
    window.addEventListener("online", online);
    return () => {
      cancelled = true;
      cleanup?.();
      clearInterval(timer);
      window.removeEventListener("online", online);
      stopReplay();
    };
  }, [status, owner, consentId]);
  return null;
}
