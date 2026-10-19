import { useQuery } from "@tanstack/react-query";
import { ApiError } from "@/shared/api/errors";
import { apiFetchResponse, apiFetchBytes } from "@/shared/api/client";
import { useInstallationStore } from "@/features/installation/installationStore";
import { blobToDataUrl } from "./thumbnails";
import type { PreviewCandidate } from "./posePresentation";
import { quickCandidateThumbnailOptions } from "./candidateThumbnail";

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
export type PosePoster = { url: string; kind: "default-body" | "pose-only" };
export async function loadPosePoster(
  url: string,
  signal: AbortSignal,
  expectedSource?: string,
  scope = "full",
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
  return { url: await blobToDataUrl(new Blob([bytes], { type: "image/png" })), kind };
}
export function useDefaultPosePoster({
  url,
  source,
  fallbackUrl,
  candidate,
  scope = "full",
}: {
  url?: string;
  source?: string;
  fallbackUrl?: string;
  candidate?: PreviewCandidate;
  scope?: string;
}) {
  const owner = useInstallationStore((s) => s.credentials?.installationId ?? "");
  const scopedUrl = url
    ? url + (url.includes("?") ? "&" : "?") + new URLSearchParams({ scope })
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
    ],
    enabled: !!owner && (!!url || !!fallbackUrl || !!candidate),
    queryFn: async ({ signal }): Promise<PosePoster> => {
      if (url) {
        try {
          return await loadPosePoster(scopedUrl!, signal, source, scope);
        } catch (error) {
          signal.throwIfAborted();
          if (!(error instanceof ApiError) || [401, 403, 409].includes(error.status)) throw error;
        }
      }
      if (fallbackUrl && !source && scope === "full") {
        const value = await quickCandidateThumbnailOptions(fallbackUrl).queryFn({ signal });
        return { url: value, kind: "pose-only" };
      }
      if (!candidate) throw Error("포즈 이미지가 없습니다.");
      if (
        !/^\/v1\/analysis\/jobs\/[^/]+\/people\/\d+\/pose-previews\/preview_[a-f0-9]{64}\/[a-f0-9]{64}$/.test(
          candidate.asset.preview_bvh_url,
        )
      )
        throw Error("잘못된 BVH 참고 경로입니다.");
      const bytes = await apiFetchBytes(candidate.asset.preview_bvh_url, { auth: false, signal });
      if (bytes.length > 2_000_000) throw Error("BVH가 너무 큽니다.");
      const hash = [
        ...new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array(bytes).buffer)),
      ]
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
      if (hash !== candidate.asset.bvh_sha256) throw Error("BVH가 변경되었습니다.");
      const { renderBvh } = await import("../preview/bvhPreview");
      const image = await renderBvh(
        new TextDecoder("utf-8", { fatal: true }).decode(bytes),
        scope,
        {
          ...candidate.render_camera,
          projection: "orthographic",
          rotation: [
            [1, 0, 0],
            [0, 1, 0],
            [0, 0, 1],
          ],
          yaw_degrees: 0,
          pitch_degrees: 0,
          roll_degrees: 0,
          distance_torso: null,
          projection_rule: "xy=(x,-y)",
          projection_matches_search: false,
        },
        0,
      );
      signal.throwIfAborted();
      return { url: image, kind: "pose-only" };
    },
    retry: false,
    staleTime: 600_000,
    gcTime: 600_000,
  });
}
