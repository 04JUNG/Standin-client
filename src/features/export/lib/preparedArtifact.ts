import { ApiError } from "@/shared/api/errors";
import { apiFetchResponse } from "@/shared/api/client";
import { verifyDigest } from "@/features/body-selection/api";
import { blobToDataUrl } from "@/features/pose-viewer/api/thumbnails";

export function preparedIdentity(response: Response) {
  const read = (name: string) => {
    const value = response.headers.get(`X-Standin-${name}`) ?? "";
    if (!/^[a-f0-9]{64}$/.test(value)) throw new ApiError(409, "PREVIEW_CHANGED", "");
    return value;
  };
  if (response.headers.get("X-Standin-Artifact-Contract") !== "verified-fbx-v1")
    throw new ApiError(409, "PREVIEW_CHANGED", "");
  return {
    reviewKey: read("Review-Key"),
    artifactSha256: read("Artifact-SHA256"),
    sourceSha: read("Source-BVH-SHA256"),
    characterSha: read("Character-SHA256"),
  };
}
export function preparedUrl(url: string, receipt: string, format: "preview" | "fbx") {
  const parsed = new URL(url, "https://standin.invalid");
  parsed.searchParams.set("format", format);
  parsed.searchParams.delete("previewType");
  parsed.searchParams.set("artifactReceipt", receipt);
  parsed.searchParams.set("reviewKey", receipt);
  return parsed.pathname + parsed.search;
}
export async function loadPreparedImage(downloadUrl: string, signal: AbortSignal) {
  const url = new URL(downloadUrl, "https://standin.invalid");
  const response = await apiFetchResponse(
    preparedUrl(downloadUrl, url.searchParams.get("artifactReceipt")!, "preview"),
    { auth: false, signal },
  );
  const identity = preparedIdentity(response);
  if (identity.reviewKey !== url.searchParams.get("artifactReceipt"))
    throw new ApiError(409, "PREVIEW_CHANGED", "");
  const digest = response.headers.get("X-Standin-Preview-Artifact-SHA256") ?? "";
  if (!/^[a-f0-9]{64}$/.test(digest)) throw new ApiError(409, "PREVIEW_CHANGED", "");
  const data = await response.arrayBuffer();
  if (
    response.headers.get("Content-Type")?.split(";")[0] !== "image/png" ||
    data.byteLength > 4 * 1024 * 1024
  )
    throw new Error("미리보기 형식을 확인하지 못했습니다.");
  await verifyDigest(data, digest);
  const blob = new Blob([data], { type: "image/png" });
  signal.throwIfAborted();
  return blobToDataUrl(blob);
}
