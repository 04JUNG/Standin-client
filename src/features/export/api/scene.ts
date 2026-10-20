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
export async function downloadScene(jobId: string, persons: SceneReference[]) {
  const response = await apiFetchResponse(`/v1/analysis/jobs/${encodeURIComponent(jobId)}/scene`, {
    method: "POST",
    auth: false,
    body: { persons },
  });
  const digest = response.headers.get("X-Standin-Artifact-SHA256");
  if (
    !digest ||
    !/^[a-f0-9]{64}$/.test(digest) ||
    response.headers.get("X-Standin-Person-Count") !== String(persons.length) ||
    response.headers.get("X-Standin-Scene-Version") !== "rough-layout-v1"
  )
    throw new Error("장면 파일 정보를 확인하지 못했습니다.");
  const bytes = await response.arrayBuffer();
  await verifyDigest(bytes, digest);
  if (new TextDecoder().decode(bytes.slice(0, 23)) !== "Kaydara FBX Binary  \0\x1a\0")
    throw new Error("장면 FBX 파일 형식이 올바르지 않습니다.");
  return new Uint8Array(bytes);
}
