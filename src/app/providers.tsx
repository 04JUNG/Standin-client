import { type ReactNode, useEffect } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./queryClient";
import {
  getInstallationEnvironment,
  useInstallationStore,
} from "@/features/installation/installationStore";
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
    // 설치 등록과 같은 출처에서 환경값을 받는다. 여기서 따로 채우면 같은 property가
    // 등록 때와 다른 값("Win32" vs "windows")으로 쌓인다.
    void getInstallationEnvironment().then((environment) => {
      trackEvent("app_started", {
        ...environment,
        locale: navigator.language || "unknown",
      });
    });
  }, [installationId, status]);
  return null;
}
