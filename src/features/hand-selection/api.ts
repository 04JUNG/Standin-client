import { preparedIdentity, preparedUrl } from "@/features/export/lib/preparedArtifact";
import { ApiError } from "@/shared/api/errors";
import { endpoints } from "@/shared/api/endpoints";
import { apiFetch, apiFetchResponse } from "@/shared/api/client";
import { blobToDataUrl } from "@/features/pose-viewer/api/thumbnails";
import { verifyDigest } from "@/features/body-selection/api";
import { catalogSchema, selectionSchema, sha, type HandSelection } from "./contract";

const path = endpoints.analysis.hands;
export const handKeys = {
  catalog: (owner: string) => ["hands", owner, "catalog"] as const,
  selection: (owner: string, job: string, person: number) => ["hands", owner, job, person] as const,
};
export async function getHandCatalog(signal?: AbortSignal) {
  const catalog = catalogSchema.parse(
    await apiFetch(endpoints.hands.catalog, { auth: false, signal, cache: "no-cache" }),
  );
  const ids = catalog.categories.flatMap((c) => c.presets.map((p) => p.id));
  if (new Set(ids).size !== ids.length || !ids.includes(catalog.default_preset))
    throw new Error("손 목록을 확인하지 못했습니다.");
  // Only authenticated BFF-relative image paths, never arbitrary upstream URLs.
  for (const p of catalog.categories.flatMap((c) => c.presets))
    if (
      p.thumbnails &&
      (p.thumbnails.left !== `/v1/hands/${p.id}/thumbnail?side=left` ||
        p.thumbnails.right !== `/v1/hands/${p.id}/thumbnail?side=right`)
    )
      throw new Error("손 이미지 주소를 확인하지 못했습니다.");
  return catalog;
}
export async function getHandSelection(job: string, person: number, signal?: AbortSignal) {
  const selection = selectionSchema.parse(
    await apiFetch(path(job, person), { auth: false, signal }),
  );
  if (selection.personIndex !== person) throw new Error("손을 선택할 인물을 확인하지 못했습니다.");
  return selection;
}
export async function putHandSelection(
  job: string,
  selection: HandSelection,
  patch: { left?: string; right?: string },
) {
  const response = selectionSchema.parse(
    await apiFetch(path(job, selection.personIndex), {
      auth: false,
      method: "PUT",
      body: {
        ...patch,
        library_sha256: selection.library_sha256,
        expectedRevision: selection.revision,
      },
    }),
  );
  if (
    response.personIndex !== selection.personIndex ||
    response.library_sha256 !== selection.library_sha256
  )
    throw new Error("저장한 손 선택을 확인하지 못했습니다.");
  return response;
}
export interface HandReview {
  downloadUrl: string;
  reviewKey: string;
  artifactSha256: string;
  revision: number;
  librarySha256: string;
}
export function handReviewFromResponse(
  response: Response,
  selection: HandSelection,
  downloadUrl: string,
): HandReview {
  if (
    response.headers.get("X-Standin-Hand-Revision") !== String(selection.revision) ||
    response.headers.get("X-Standin-Hand-Library-SHA256") !== selection.library_sha256
  )
    throw new ApiError(409, "HANDS_CHANGED", "손 선택이 변경되었습니다. 다시 확인해 주세요.");
  const reviewKey = sha.parse(response.headers.get("X-Standin-Review-Key"));
  const url = new URL(downloadUrl, "https://standin.invalid");
  url.searchParams.set("handSelectionRevision", String(selection.revision));
  url.searchParams.set("reviewKey", reviewKey);
  return {
    downloadUrl: url.pathname + url.search,
    reviewKey,
    artifactSha256: sha.parse(response.headers.get("X-Standin-Artifact-SHA256")),
    revision: selection.revision,
    librarySha256: selection.library_sha256,
  };
}
export async function downloadHandReview(receipt: HandReview) {
  const response = await apiFetchResponse(receipt.downloadUrl, { auth: false });
  if (
    response.headers.get("X-Standin-Review-Key") !== receipt.reviewKey ||
    response.headers.get("X-Standin-Artifact-SHA256") !== receipt.artifactSha256 ||
    response.headers.get("X-Standin-Hand-Revision") !== String(receipt.revision) ||
    response.headers.get("X-Standin-Hand-Library-SHA256") !== receipt.librarySha256
  )
    throw new ApiError(
      409,
      "HANDS_CHANGED",
      "확인한 손과 파일이 다릅니다. 확인 화면으로 돌아가 주세요.",
    );
  const bytes = await response.arrayBuffer();
  await verifyDigest(bytes, receipt.artifactSha256);
  return new Uint8Array(bytes);
}
export async function loadHandReview(
  previewUrl: string,
  downloadUrl: string,
  selection: HandSelection,
  signal: AbortSignal,
  prepareOnly = false,
) {
  const response = await apiFetchResponse(previewUrl, { auth: false, signal });
  const handReceipt = handReviewFromResponse(response, selection, downloadUrl);
  if (prepareOnly) {
    preparedIdentity(response);
    handReceipt.downloadUrl = preparedUrl(handReceipt.downloadUrl, handReceipt.reviewKey, "fbx");
    signal.throwIfAborted();
    return { image: "", handReceipt };
  }
  const blob = await response.blob();
  if (blob.type !== "image/png") throw new Error("손이 적용된 미리보기를 확인하지 못했습니다.");
  return { image: await blobToDataUrl(blob), handReceipt };
}
