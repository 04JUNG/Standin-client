import { apiFetchResponse } from "@/shared/api/client";
import { verifyDigest } from "@/features/body-selection/api";

export interface SceneReference {
  personIndex: number;
  candidateId: string;
  exportPath: string;
  sha256: string;
}
export async function sceneReference(
  personIndex: number,
  candidateId: string,
  path: string,
  bytes: Uint8Array,
): Promise<SceneReference> {
  const url = new URL(path, "https://standin.invalid");
  const digest = await crypto.subtle.digest("SHA-256", new Uint8Array(bytes));
  return {
    personIndex,
    candidateId,
    exportPath: url.pathname + url.search,
    sha256: Array.from(new Uint8Array(digest), (v) => v.toString(16).padStart(2, "0")).join(""),
  };
}
export async function downloadScene(
  jobId: string,
  persons: SceneReference[],
  review?: SceneReview,
) {
  const response = await apiFetchResponse(`/v1/analysis/jobs/${encodeURIComponent(jobId)}/scene`, {
    method: "POST",
    auth: false,
    body: { persons, ...(review ? { reviewKey: review.reviewKey } : {}) },
  });
  const digest = response.headers.get("X-Standin-Artifact-SHA256");
  if (
    !digest ||
    !/^[a-f0-9]{64}$/.test(digest) ||
    response.headers.get("X-Standin-Person-Count") !== String(persons.length) ||
    response.headers.get("X-Standin-Scene-Version") !==
      (review ? "scene-refinement-v4" : "rough-layout-v1") ||
    (review !== undefined && digest !== review.artifactSha256)
  )
    throw new Error("장면 파일 정보를 확인하지 못했습니다.");
  const bytes = await response.arrayBuffer();
  await verifyDigest(bytes, digest);
  if (new TextDecoder().decode(bytes.slice(0, 23)) !== "Kaydara FBX Binary  \0\x1a\0")
    throw new Error("장면 FBX 파일 형식이 올바르지 않습니다.");
  return new Uint8Array(bytes);
}

export interface SceneReview {
  artifactContract?: "verified-scene-fbx-v1";
  previewFailed?: boolean;
  version: "scene-refinement-v4";
  reviewKey: string;
  artifactSha256: string;
  previewSha256: string;
  previewBase64: string;
  personCount: number;
  summary: {
    personIndex: number;
    poseId?: string;
    previousPoseId?: string;
    outputScope: string;
    interaction: string;
    armGoalCount: number;
  }[];
}
export async function prepareScene(jobId: string, persons: SceneReference[]): Promise<SceneReview> {
  const response = await apiFetchResponse(`/v1/analysis/jobs/${encodeURIComponent(jobId)}/scene`, {
    method: "POST",
    auth: false,
    body: { persons, prepare: true, artifactOnly: true },
  });
  const result = (await response.json()) as SceneReview;
  if (
    result.version !== "scene-refinement-v4" ||
    typeof result.reviewKey !== "string" ||
    !/^[a-f0-9]{48}$/.test(result.reviewKey) ||
    !/^[a-f0-9]{64}$/.test(result.artifactSha256) ||
    result.personCount !== persons.length ||
    typeof result.previewBase64 !== "string" ||
    result.previewBase64.length > 12 * 1024 * 1024 ||
    !Array.isArray(result.summary)
  )
    throw new Error("보정 장면 정보를 확인하지 못했습니다.");
  if (result.artifactContract === "verified-scene-fbx-v1") {
    if (result.previewBase64 !== "") throw new Error("준비 파일 정보를 확인하지 못했습니다.");
    return result;
  }
  const preview = Uint8Array.from(atob(result.previewBase64), (x) => x.charCodeAt(0));
  if (![137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => preview[i] === v))
    throw new Error("장면 미리보기 형식이 올바르지 않습니다.");
  await verifyDigest(preview.buffer, result.previewSha256);
  return result;
}

export async function loadScenePreview(
  jobId: string,
  persons: SceneReference[],
  review: SceneReview,
  signal: AbortSignal,
) {
  const response = await apiFetchResponse(`/v1/analysis/jobs/${encodeURIComponent(jobId)}/scene`, {
    method: "POST",
    auth: false,
    signal,
    body: { persons, reviewKey: review.reviewKey, preview: true },
  });
  if (response.headers.get("X-Standin-Artifact-SHA256") !== review.artifactSha256)
    throw new Error("장면 파일이 변경되었습니다.");
  const digest = response.headers.get("X-Standin-Preview-Artifact-SHA256") ?? "";
  if (!/^[a-f0-9]{64}$/.test(digest)) throw new Error("장면 미리보기를 확인하지 못했습니다.");
  const data = await response.arrayBuffer();
  if (
    response.headers.get("Content-Type")?.split(";")[0] !== "image/png" ||
    data.byteLength > 4 * 1024 * 1024
  )
    throw new Error("장면 미리보기 형식을 확인하지 못했습니다.");
  await verifyDigest(data, digest);
  const blob = new Blob([data], { type: "image/png" });
  signal.throwIfAborted();
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1]!);
    reader.onerror = () => reject(new Error("장면 미리보기를 확인하지 못했습니다."));
    reader.readAsDataURL(blob);
  });
}
