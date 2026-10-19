import { useQuery } from "@tanstack/react-query";
import { ApiError } from "@/shared/api/errors";
import { apiFetchResponse } from "@/shared/api/client";
import { useInstallationStore } from "@/features/installation/installationStore";
import { blobToDataUrl } from "./thumbnails";
import type { PreviewCandidate } from "./posePresentation";

function validPosterPath(value: string): boolean {
  if (!value.startsWith("/v1/") || value.includes("#")) return false;
  const parsed = new URL(value, "https://standin.invalid");
  if (parsed.origin !== "https://standin.invalid") return false;
  return (
    /^\/v1\/analysis\/jobs\/[^/]+\/people\/\d+\/pose-previews\/preview_[a-f0-9]{64}\/[a-f0-9]{64}\/poster$/.test(
      parsed.pathname,
    ) || /^\/v1\/pose-candidates\/[^/]+\/poster$/.test(parsed.pathname)
  );
}
export type PosePoster = {
  url: string;
  kind: "default-body" | "pose-only";
  method?: "reference-skinning-v1";
};
export async function loadPosePoster(
  url: string,
  signal: AbortSignal,
  expectedSource?: string,
  scope = "full",
  allowReferenceRendering = true,
): Promise<PosePoster> {
  if (!validPosterPath(url)) throw Error("잘못된 포즈 이미지 경로입니다.");
  const response = await apiFetchResponse(url, { auth: false, signal });
  const kind = response.headers.get("X-Standin-Poster-Kind");
  const source = response.headers.get("X-Standin-Source-BVH-SHA256");
  const sha = (s: string | null) => !!s && /^[a-f0-9]{64}$/.test(s);
  if (
    response.headers.get("Content-Type") !== "image/png" ||
    response.headers.get("X-Standin-Poster-Version") !== "default-body-poster-v1" ||
    response.headers.get("X-Standin-Output-Scope") !== scope ||
    response.headers.get("X-Standin-Preview-Projection") !== "orthographic" ||
    response.headers.get("X-Standin-Preview-Only") !== "true" ||
    !sha(source) ||
    (expectedSource && source !== expectedSource) ||
    !sha(response.headers.get("X-Standin-Preview-Revision")) ||
    !(
      (kind === "default-body" &&
        response.headers.get("X-Standin-Character-Id") === "standin-master-v2" &&
        sha(response.headers.get("X-Standin-Character-SHA256"))) ||
      (kind === "pose-only" &&
        response.headers.get("X-Standin-Character-Id") === "none" &&
        response.headers.get("X-Standin-Character-SHA256") === "none")
    )
  ) {
    await response.body?.cancel();
    throw Error("포즈 참고 이미지의 출처를 확인하지 못했습니다.");
  }
  const reader = response.body?.getReader();
  if (!reader) throw Error("빈 포즈 이미지입니다.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const p = await reader.read();
      if (p.done) break;
      size += p.value.byteLength;
      if (size > 2 * 1024 * 1024) throw Error("포즈 이미지가 너무 큽니다.");
      chunks.push(p.value);
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  if (bytes.length < 8 || ![137, 80, 78, 71, 13, 10, 26, 10].every((b, i) => bytes[i] === b))
    throw Error("잘못된 PNG입니다.");
  const digest = [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  if (digest !== response.headers.get("X-Standin-Artifact-SHA256"))
    throw Error("포즈 이미지가 변경되었습니다.");
  signal.throwIfAborted();
  const method = response.headers.get("X-Standin-Preview-Method");
  if (
    (method && !["frozen-retarget-v1", "pose-only", "reference-skinning-v1"].includes(method)) ||
    (method === "pose-only" && kind !== "pose-only") ||
    (method === "frozen-retarget-v1" && kind !== "default-body") ||
    (method === "reference-skinning-v1" &&
      (kind !== "default-body" ||
        response.headers.get("X-Standin-Character-SHA256") !==
          "7c648b97a24a3bb4914b6e5d515708c33727979881d92ef916d5726e22301f3d" ||
        !sha(response.headers.get("X-Standin-Template-SHA256"))))
  )
    throw Error("인체 참고 방식의 출처를 확인하지 못했습니다.");
  if (kind === "pose-only") {
    if (!allowReferenceRendering) throw Error("저장된 인체 포즈 이미지가 없습니다.");
    // A verified skeleton is still an unfinished human preview, including in
    // direct save-review consumers of this loader. Render the exact source mesh.
    const parsed = new URL(url, "https://standin.invalid");
    const presentation = parsed.pathname.includes("/pose-previews/");
    const sourceUrl = presentation
      ? parsed.pathname.slice(0, -7)
      : parsed.pathname.replace(/\/poster$/, "/poster-source") + parsed.search;
    const { loadHumanReference } = await import("./humanReference");
    return {
      url: await loadHumanReference(sourceUrl, source!, scope, signal, presentation),
      kind: "default-body",
      method: "reference-skinning-v1",
    };
  }

  return {
    url: await blobToDataUrl(new Blob([bytes], { type: "image/png" })),
    kind,
    ...(method === "reference-skinning-v1" ? { method } : {}),
  };
}
export function useDefaultPosePoster({
  url,
  source,
  fallbackUrl,
  candidate,
  scope = "full",
  enabled = true,
  savedOnly = false,
}: {
  url?: string;
  source?: string;
  fallbackUrl?: string;
  candidate?: PreviewCandidate;
  scope?: string;
  enabled?: boolean;
  savedOnly?: boolean;
}) {
  const owner = useInstallationStore((s) => s.credentials?.installationId ?? "");
  const posterUrl = url ?? (candidate ? candidate.asset.preview_bvh_url + "/poster" : undefined);
  const scopedUrl = posterUrl
    ? posterUrl + (posterUrl.includes("?") ? "&" : "?") + new URLSearchParams({ scope })
    : undefined;
  return useQuery({
    // The chosen body/shape/hands are deliberately absent: this is a stable,
    // authenticated canonical reference, not the final chosen-body artifact.
    queryKey: [
      "default-pose-poster",
      owner,
      scopedUrl,
      source,
      fallbackUrl,
      candidate?.asset.preview_bvh_url,
      scope,
      savedOnly,
    ],
    enabled: enabled && !!owner && (!!url || !!fallbackUrl || !!candidate),
    queryFn: async ({ signal }): Promise<PosePoster> => {
      if (posterUrl) {
        try {
          const poster = await loadPosePoster(
            scopedUrl!,
            signal,
            source ?? candidate?.asset.bvh_sha256,
            scope,
            !savedOnly,
          );
          if (poster.kind === "default-body") return poster;
        } catch (error) {
          signal.throwIfAborted();
          if (!(error instanceof ApiError) || [401, 403, 409].includes(error.status)) throw error;
        }
      }
      if (savedOnly) throw Error("저장된 포즈 이미지를 불러오지 못했어요.");
      // A pose-only image is not completed human preview. Use the shared real
      // human mesh with this exact owned BVH, never a card-triggered Converter.
      const sourceUrl =
        candidate?.asset.preview_bvh_url ??
        (scopedUrl ? scopedUrl.replace(/\/poster\?/, "/poster-source?") : undefined);
      if (!sourceUrl) throw Error("인체 포즈 참고 원본이 없습니다.");
      const { loadHumanReference } = await import("./humanReference");
      const image = await loadHumanReference(
        sourceUrl,
        source ?? candidate?.asset.bvh_sha256,
        scope,
        signal,
        !!candidate,
      );
      return { url: image, kind: "default-body", method: "reference-skinning-v1" };
    },
    retry: false,
    staleTime: 600_000,
    gcTime: 600_000,
  });
}
