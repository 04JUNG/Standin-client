import { type ReactNode, useEffect } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./queryClient";
import {
  getInstallationEnvironment,
  useInstallationStore,
} from "@/features/installation/installationStore";
import { trackEvent } from "@/features/analytics/analyticsClient";
import { useStartupUpdateCheck } from "@/features/updates/hooks/useStartupUpdateCheck";

let startedInstallationId: string | null = null;

/** 전역 Provider(docs/02 §4). */
export function Providers({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <InstallationBootstrap />
      <UpdateBootstrap />
      {children}
    </QueryClientProvider>
  );
}

/**
 * 시작 시 업데이트를 조용히 확인한다(ADR-011). 창 모드와 무관하게 한 번만 돌아야 해서
 * RootLayout이 아니라 여기 있다 — 바 모드로만 쓰는 세션도 확인은 지나가야 한다.
 */
function UpdateBootstrap() {
  useStartupUpdateCheck();
  return null;
}

function InstallationBootstrap() {
  const initialize = useInstallationStore((state) => state.initialize);
  const status = useInstallationStore((state) => state.status);
  const installationId = useInstallationStore((state) => state.credentials?.installationId);
  useEffect(() => {
    void initialize();
  }, [initialize]);
  useEffect(() => {
    if (status !== "registered" || !installationId || startedInstallationId === installationId)
      return;
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
