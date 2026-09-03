import { useMemo } from "react";
import { useLocation } from "react-router-dom";
import { useUploadStore } from "@/features/upload/store/uploadStore";
import type { TourContext } from "../lib/resolveActiveStep";
import type { AnchorSnapshot } from "./useAnchorSnapshot";

/** 라우트와 앱 상태를 스텝 술어가 읽는 형태로 모은다. */
export function useTourContext(snapshot: AnchorSnapshot): TourContext {
  const { pathname } = useLocation();
  // 업로드와 캡처 두 경로가 모두 여기로 모인다(useImageInput·startCaptureFlow).
  const hasDraft = useUploadStore((s) => s.draft !== null);

  return useMemo(
    () => ({
      pathname,
      hasDraft,
      hasAnchor: (id) => snapshot.has(id),
      isAnchorEnabled: (id) => snapshot.get(id)?.enabled ?? false,
    }),
    [pathname, hasDraft, snapshot],
  );
}
