import { apiFetchResponse } from "@/shared/api/client";
import type { BodyScope } from "@/features/pose-viewer/api/outputScope";
import { framedExportUrl } from "@/features/export/lib/framedExport";
import { blobToDataUrl } from "@/features/pose-viewer/api/thumbnails";
import { sha, type BodySelection } from "./contract";
import { verifyDigest } from "./api";
export type BodyReview = {
  previewUrl: string;
  downloadUrl: string;
  exportUrl: string;
  personIndex: number;
  candidateId: string;
  selection: BodySelection;
  scope: BodyScope;
  artifactSha256: string;
  reviewKey: string;
};
export async function loadBodyReview(
  jobId: string,
  exportUrl: string,
  personIndex: number,
  candidateId: string,
  scope: BodyScope,
  selection: BodySelection,
  signal: AbortSignal,
): Promise<BodyReview> {
  if (selection.resolutionStatus !== "ready" || !selection.resolvedBody)
    throw new Error("체형을 다시 선택해 주세요.");
  const identity = new URL(exportUrl, "https://standin.invalid");
  if (
    identity.searchParams.get("jobId") !== jobId ||
    identity.searchParams.get("personIndex") !== String(personIndex) ||
    identity.searchParams.get("candidateId") !== candidateId ||
    selection.personIndex !== personIndex
  )
    throw new Error("확인할 인물과 포즈가 일치하지 않습니다.");
  const base = framedExportUrl(exportUrl, scope, "preview", null);
  const url = base + "&bodySelectionRevision=" + selection.selectionRevision;
  const res = await apiFetchResponse(url, { auth: false, signal });
  const reviewKey = sha.parse(res.headers.get("X-Standin-Review-Key"));
  const artifactSha256 = sha.parse(res.headers.get("X-Standin-Artifact-SHA256"));
  if (
    res.headers.get("X-Standin-Body-Revision") !== String(selection.selectionRevision) ||
    res.headers.get("X-Standin-Character-SHA256") !== selection.resolvedBody.assetSha256
  )
    throw new Error("확인할 체형이 변경되었습니다.");
  const blob = await res.blob();
  if (blob.type !== "image/png") throw new Error("결과 이미지를 확인하지 못했습니다.");
  const downloadUrl =
    framedExportUrl(exportUrl, scope, "fbx", null) +
    "&bodySelectionRevision=" +
    selection.selectionRevision +
    "&reviewKey=" +
    reviewKey;
  return {
    previewUrl: await blobToDataUrl(blob),
    downloadUrl,
    exportUrl,
    personIndex,
    candidateId,
    scope,
    selection,
    artifactSha256,
    reviewKey,
  };
}
export async function downloadBodyReview(receipt: BodyReview) {
  const res = await apiFetchResponse(receipt.downloadUrl, { auth: false });
  if (
    res.headers.get("X-Standin-Review-Key") !== receipt.reviewKey ||
    res.headers.get("X-Standin-Artifact-SHA256") !== receipt.artifactSha256 ||
    res.headers.get("X-Standin-Body-Revision") !== String(receipt.selection.selectionRevision) ||
    res.headers.get("X-Standin-Character-SHA256") !== receipt.selection.resolvedBody?.assetSha256
  )
    throw new Error("확인한 결과와 파일이 다릅니다. 확인 화면으로 돌아가 주세요.");
  const data = await res.arrayBuffer();
  await verifyDigest(data, receipt.artifactSha256);
  return new Uint8Array(data);
}
