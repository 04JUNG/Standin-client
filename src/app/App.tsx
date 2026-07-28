import { useEffect } from "react";
import { RouterProvider } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useAuthStore } from "@/features/auth/store/authStore";
import { initDeepLinkAuth } from "@/features/auth/lib/deepLinkAuth";
import { initCaptureShortcut } from "@/features/capture/lib/captureShortcut";
import { initCollapseToBar } from "@/features/bar/lib/collapseListener";
import { router } from "./router";

/** 앱 진입: 세션 복원 후 라우터를 렌더. initializing 동안 splash(docs/06 §7). */
export function App() {
  const status = useAuthStore((s) => s.status);
  const restore = useAuthStore((s) => s.restore);

  useEffect(() => {
    void restore();
    void initDeepLinkAuth();
    void initCaptureShortcut();
    void initCollapseToBar();
  }, [restore]);

  if (status === "initializing") {
    return (
      <div className="flex h-full items-center justify-center bg-brand-paper">
        <Loader2 className="h-6 w-6 animate-spin text-brand-ink" aria-label="불러오는 중" />
      </div>
    );
  }

  return <RouterProvider router={router} />;
}
