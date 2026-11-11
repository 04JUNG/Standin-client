import { windowModeService } from "@/features/bar/api/windowMode.service";
import { type ReactNode, useEffect, useState } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { apiFetch } from "@/shared/api/client";
import { env } from "@/shared/lib/env";
import { openExternal } from "@/shared/lib/openExternal";
import { useRequiredUpdateStore } from "@/shared/stores/requiredUpdateStore";
import { Button } from "@/shared/components/Button";
import { AppUpdateSection } from "./AppUpdateSection";
import { isSupportedClientVersion, MINIMUM_CLIENT_VERSION } from "@/shared/lib/clientVersion";

export function RequiredUpdateGate({ children }: { children: ReactNode }) {
  const minimumVersion = useRequiredUpdateStore((s) => s.minimumVersion);
  const requireUpdate = useRequiredUpdateStore((s) => s.requireUpdate);
  const localUnsupported = isTauri() && !isSupportedClientVersion(import.meta.env.VITE_APP_VERSION);
  const [openError, setOpenError] = useState(false);

  useEffect(() => {
    if (localUnsupported) requireUpdate();
    if (!env.useMockPoseApi) {
      // The API client latches UPDATE_REQUIRED globally, including later server policy changes.
      void apiFetch("/v1/client-policy", {
        auth: false,
        installation: false,
      }).catch(() => {});
    }
  }, [localUnsupported, requireUpdate]);

  useEffect(() => {
    if (!minimumVersion && !localUnsupported) return;
    document.body.dataset.windowMode = "app";
    void windowModeService.setMode("app").catch(() => {});
  }, [minimumVersion, localUnsupported]);

  if (!minimumVersion && !localUnsupported) return <>{children}</>;

  return (
    <main className="h-screen overflow-y-auto bg-surface-0 p-4 text-text-primary">
      <div className="mx-auto flex max-w-lg flex-col gap-5 py-6">
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-xl font-bold" data-tauri-drag-region>업데이트가 필요합니다</h1>
          <Button variant="secondary" onClick={() => void windowModeService.control("close")}>
            닫기
          </Button>
        </div>
        <p role="alert">
          Standin {minimumVersion ?? MINIMUM_CLIENT_VERSION} 이상으로 업데이트해야 사용할 수
          있습니다. 설치 후 앱을 다시 시작해 주세요.
        </p>
        <AppUpdateSection required />
        <Button
          variant="secondary"
          onClick={() => {
            setOpenError(false);
            void openExternal(env.webBaseUrl).catch(() => setOpenError(true));
          }}
        >
          Standin 홈페이지에서 새 버전 받기
        </Button>
        {openError && (
          <p role="alert">
            브라우저를 열지 못했습니다. Standin 홈페이지에서 새 버전을 받아 주세요.
          </p>
        )}
      </div>
    </main>
  );
}
