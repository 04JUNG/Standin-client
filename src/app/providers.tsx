import { type ReactNode, useEffect } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./queryClient";
import { useInstallationStore } from "@/features/installation/installationStore";
import { trackEvent } from "@/features/analytics/analyticsClient";

let startedInstallationId: string | null = null;

/** 전역 Provider(docs/02 §4). */
export function Providers({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <InstallationBootstrap />
      {children}
    </QueryClientProvider>
  );
}

function InstallationBootstrap() {
  const initialize = useInstallationStore((state) => state.initialize);
  const status = useInstallationStore((state) => state.status);
  const installationId = useInstallationStore((state) => state.credentials?.installationId);
  useEffect(() => {
    void initialize();
  }, [initialize]);
  useEffect(() => {
    if (status !== "registered" || !installationId || startedInstallationId === installationId) return;
    startedInstallationId = installationId;
    trackEvent("app_started", {
      appVersion: import.meta.env.VITE_APP_VERSION || "0.1.0",
      osName: navigator.platform || "unknown",
      osVersion: "unknown",
      architecture: "unknown",
      locale: navigator.language || "unknown",
    });
  }, [installationId, status]);
  return null;
}
