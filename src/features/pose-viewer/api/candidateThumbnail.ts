import { apiFetchBlob } from "@/shared/api/client";
import { blobToDataUrl } from "./thumbnails";

/** Share the same authenticated render between app/bar cards and final review. */
export function candidateThumbnailOptions(url: string | undefined) {
  return {
    queryKey: ["candidate-camera-preview", url],
    enabled: !!url,
    queryFn: async ({ signal }: { signal: AbortSignal }) => {
      const blob = await apiFetchBlob(url!, { auth: false, signal });
      if (blob.type !== "image/png") throw new Error("미리보기 형식을 확인하지 못했습니다.");
      return blobToDataUrl(blob);
    },
    retry: false,
    staleTime: 600_000,
    gcTime: 600_000,
  };
}
