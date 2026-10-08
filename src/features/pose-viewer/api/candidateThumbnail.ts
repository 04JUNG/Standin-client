import { apiFetchBlob } from "@/shared/api/client";
import type { CandidateModel } from "../preview/modelContract";
import { blobToDataUrl } from "./thumbnails";

/** A library JPEG is a few KB and needs no Blender or model decoding. */
export function quickCandidateThumbnailOptions(url: string) {
  return {
    queryKey: ["candidate-quick-preview", url],
    queryFn: async ({ signal }: { signal: AbortSignal }) => {
      signal.throwIfAborted();
      const timeout = new AbortController();
      const onAbort = () => timeout.abort(signal.reason);
      signal.addEventListener("abort", onAbort, { once: true });
      const timer = setTimeout(() => timeout.abort(new Error("preview deadline")), 2_500);
      try {
        const blob = await apiFetchBlob(url, { auth: false, signal: timeout.signal });
        if (blob.type !== "image/jpeg" && blob.type !== "image/png")
          throw new Error("미리보기 형식을 확인하지 못했습니다.");
        return await blobToDataUrl(blob);
      } finally {
        clearTimeout(timer);
        signal.removeEventListener("abort", onAbort);
      }
    },
    retry: false,
    staleTime: 600_000,
    gcTime: 600_000,
  };
}

/** Share the same authenticated render between app/bar cards and final review. */
export function candidateThumbnailOptions(
  url: string | undefined,
  model?: CandidateModel,
  characterId = "standin-master-v2",
) {
  return {
    queryKey: ["candidate-camera-preview", url, model, characterId],
    enabled: !!url,
    queryFn: async ({ signal }: { signal: AbortSignal }) => {
      const withCharacter = (path: string) =>
        `${path}${path.includes("?") ? "&" : "?"}characterId=${encodeURIComponent(characterId)}`;
      if (model) {
        try {
          const blob = await apiFetchBlob(withCharacter(model.url), { auth: false, signal });
          if (blob.type !== "model/gltf-binary") throw new Error("model unavailable");
          const { renderCandidate } = await import("../preview/renderCandidate");
          return await renderCandidate(await blob.arrayBuffer(), model, characterId, signal);
        } catch {
          signal.throwIfAborted(); // Cancellation must not start an expensive fallback.
        }
      }
      const blob = await apiFetchBlob(withCharacter(url!), { auth: false, signal });
      if (blob.type !== "image/png") throw new Error("미리보기 형식을 확인하지 못했습니다.");
      return blobToDataUrl(blob);
    },
    retry: false,
    staleTime: 600_000,
    gcTime: 600_000,
  };
}
