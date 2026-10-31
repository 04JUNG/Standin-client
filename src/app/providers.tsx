import { ReplayBootstrap } from "@/features/replay/ReplayBootstrap";
import { RequiredUpdateGate } from "@/features/updates/components/RequiredUpdateGate";
import { useAppStarted } from "@/features/analytics/useAppStarted";
import { resetJourneyCapability, flushEvents } from "@/features/analytics/analyticsClient";
import { type ReactNode, useEffect } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./queryClient";
import {
  getInstallationEnvironment,
  useInstallationStore,
} from "@/features/installation/installationStore";
import { useStartupUpdateCheck } from "@/features/updates/hooks/useStartupUpdateCheck";
import { reportInstalledUpdate, useUpdateStore } from "@/features/updates/store/updateStore";

import { useQualityConsentStore } from "@/features/installation/qualityConsentStore";

/** 전역 Provider(docs/02 §4). */
export function Providers({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <UpdateBootstrap>
        <InstallationBootstrap />
        <ReplayBootstrap />
        <RequiredUpdateGate>{children}</RequiredUpdateGate>
      </UpdateBootstrap>
    </QueryClientProvider>
  );
}

/**
 * 시작 시 업데이트를 조용히 확인한다(ADR-011). 창 모드와 무관하게 한 번만 돌아야 해서
 * RootLayout이 아니라 여기 있다 — 바 모드로만 쓰는 세션도 확인은 지나가야 한다.
 */
function UpdateBootstrap({ children }: { children: ReactNode }) {
  useStartupUpdateCheck();
  const startupComplete = useUpdateStore((s) => s.startupComplete);
  const phase = useUpdateStore((s) => s.installPhase);
  if (!startupComplete || phase === "installing" || phase === "restarting") {
    return (
      <main className="flex h-screen flex-col items-center justify-center gap-3 bg-surface-0 text-text-primary">
        <h1 className="text-lg font-semibold">Standin</h1>
        <p role="status" className="text-sm text-text-secondary">
          {phase === "installing"
            ? "업데이트를 적용하고 있습니다…"
            : phase === "restarting"
              ? "새 버전으로 다시 시작합니다…"
              : "앱을 준비하고 있습니다…"}
        </p>
      </main>
    );
  }
  return children;
}

function InstallationBootstrap() {
  const version = useUpdateStore((state) => state.version);
  const quality = useQualityConsentStore();
  useEffect(() => {
    if (version && quality.loaded && !quality.pendingChoices) {
      reportInstalledUpdate(
        version,
        quality.consent.personalData &&
          quality.consent.contentLicense &&
          Boolean(quality.consent.consentId),
      );
    }
  }, [version, quality.loaded, quality.pendingChoices, quality.consent]);
  const initialize = useInstallationStore((state) => state.initialize);
  const status = useInstallationStore((state) => state.status);
  const installationId = useInstallationStore((state) => state.credentials?.installationId);
  useEffect(() => {
    void initialize();
  }, [initialize]);
  useEffect(() => {
    const refresh = () => {
      if (useInstallationStore.getState().status === "registered")
        void useQualityConsentStore.getState().refresh();
    };
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, []);
  useAppStarted(status === "registered" ? installationId : undefined, getInstallationEnvironment);
  useEffect(() => {
    if (status !== "registered") {
      resetJourneyCapability();
      return;
    }
    const flush = () => {
      void flushEvents();
    };
    const timer = window.setInterval(flush, 30_000);
    window.addEventListener("online", flush);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("online", flush);
    };
  }, [status]);
  return null;
}
