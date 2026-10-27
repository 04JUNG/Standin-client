import { invoke } from "@tauri-apps/api/core";
import { z } from "zod";
import { apiFetchResponse } from "@/shared/api/client";
import { ApiError } from "@/shared/api/errors";
import { canRelease } from "@/features/pose-viewer/api/routedSearch";
import type { ReviewItem } from "@/features/pose-viewer/hooks/useSelectionReview";
import { modelIdentity, type LocalModel } from "./contract";
import { localBodyApi } from "./api";
const sha = z.string().regex(/^[a-f0-9]{64}$/);
const artifactSchema = z.object({
  snapshotHash: sha,
  artifactHash: sha,
  contentBase64: z.string().max(360 * 1024 * 1024),
});
export type LocalArtifact = {
  binding: string;
  content: Uint8Array;
  artifactHash: string;
  poseHash: string;
  snapshotHash: string;
};
export async function digest(bytes: Uint8Array) {
  return Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", bytes.slice().buffer)),
    (b) => b.toString(16).padStart(2, "0"),
  ).join("");
}
function base64(bytes: Uint8Array) {
  let result = "";
  for (let i = 0; i < bytes.length; i += 32768)
    result += String.fromCharCode(...bytes.subarray(i, i + 32768));
  return btoa(result);
}
export function localBinding(model: LocalModel, item: ReviewItem, scope: string, hands: unknown) {
  return JSON.stringify([
    modelIdentity(model),
    item.personIndex,
    item.candidate.id,
    item.candidate.sourceBvhSha256,
    item.exportUrl,
    item.refined,
    scope,
    hands,
  ]);
}
/** Use the existing installation-owned selected-candidate endpoint; never use an inference path or preview-only BVH. */
export async function finalPose(job: string, item: ReviewItem, signal: AbortSignal) {
  if (!canRelease(item.candidate) || item.candidate.source === "generation" || !item.exportUrl)
    throw new ApiError(409, "INVALID_SELECTION", "");
  const url = new URL(item.exportUrl, "https://standin.invalid");
  if (
    url.origin !== "https://standin.invalid" ||
    !/^\/v1\/pose-candidates\/[^/]+\/export$/.test(url.pathname) ||
    url.searchParams.get("jobId") !== job ||
    url.searchParams.get("personIndex") !== String(item.personIndex) ||
    url.searchParams.get("candidateId") !== item.candidate.id
  )
    throw new ApiError(409, "INVALID_EXPORT", "");
  // Strip body/hand/preview parameters. The BFF validates the selection and resolves final refined/base bytes.
  const query = new URLSearchParams({
    jobId: job,
    personIndex: String(item.personIndex),
    candidateId: item.candidate.id,
    format: "bvh",
  });
  const response = await apiFetchResponse(url.pathname + "?" + query, { auth: false, signal });
  const bytes = new Uint8Array(await response.arrayBuffer());
  signal.throwIfAborted();
  if (
    bytes.length > 8 * 1024 * 1024 ||
    !new TextDecoder().decode(bytes.subarray(0, 256)).trimStart().startsWith("HIERARCHY")
  )
    throw new ApiError(409, "INVALID_EXPORT", "");
  return { bytes, hash: await digest(bytes) };
}
export async function prepareLocal(
  job: string,
  model: LocalModel,
  item: ReviewItem,
  scope: string,
  binding: string,
  signal: AbortSignal,
): Promise<LocalArtifact> {
  if (scope !== "full") throw { code: "SCOPE_UNSUPPORTED" };
  const pose = await finalPose(job, item, signal);
  const jobId = crypto.randomUUID();
  const cancel = () => {
    void localBodyApi.cancel(jobId);
  };
  signal.addEventListener("abort", cancel, { once: true });
  try {
    signal.throwIfAborted();
    const result = artifactSchema.parse(
      await invoke("personal_body_apply", {
        jobId,
        id: model.localModelId,
        sourceHash: model.sourceHash,
        poseBase64: base64(pose.bytes),
        poseHash: pose.hash,
        selectionId: crypto.randomUUID(),
      }),
    );
    signal.throwIfAborted();
    const content = Uint8Array.from(atob(result.contentBase64), (c) => c.charCodeAt(0));
    if ((await digest(content)) !== result.artifactHash) throw { code: "STALE_RESULT" };
    return {
      binding,
      content,
      artifactHash: result.artifactHash,
      poseHash: pose.hash,
      snapshotHash: result.snapshotHash,
    };
  } finally {
    signal.removeEventListener("abort", cancel);
  }
}
