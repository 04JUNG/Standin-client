import { apiFetch, apiFetchResponse, ApiError } from "@/shared/api/client";
import { blobToDataUrl } from "@/features/pose-viewer/api/thumbnails";
import { validRotation } from "@/features/pose-viewer/preview/modelContract";
import {
  manifestSchema,
  optionsSchema,
  preferencesSchema,
  selectionSchema,
  sameBody,
  type BodyChange,
  type BodyManifest,
  type BodySelection,
} from "./contract";
export const personPath = (job: string, person: number) =>
  `/v1/analysis/jobs/${encodeURIComponent(job)}/people/${person}`;
export const bodyKeys = {
  person: (owner: string, job: string, person: number) => ["body", owner, job, person] as const,
  selection: (owner: string, job: string, person: number) =>
    [...bodyKeys.person(owner, job, person), "selection"] as const,
  preferences: (owner: string) => ["body", owner, "preferences"] as const,
};
export async function getSelection(job: string, person: number, signal?: AbortSignal) {
  const value = selectionSchema.parse(
    await apiFetch(personPath(job, person) + "/body-selection", { auth: false, signal }),
  );
  if (value.personIndex !== person) throw new Error("체형 인물을 확인하지 못했습니다.");
  return value;
}
export async function putSelection(
  job: string,
  person: number,
  change: BodyChange,
  revision: number,
) {
  await apiFetch(personPath(job, person) + "/body-selection", {
    auth: false,
    method: "PUT",
    body: { ...change, expectedRevision: revision, mutationId: crypto.randomUUID() },
  });
  // Idempotent replays may return an older revision. Always read current state.
  return getSelection(job, person);
}
export async function getOptions(job: string, person: number, signal?: AbortSignal) {
  return optionsSchema.parse(
    await apiFetch(personPath(job, person) + "/body-options", { auth: false, signal }),
  );
}
export async function getPreferences(signal?: AbortSignal) {
  return preferencesSchema.parse(
    await apiFetch("/v1/installations/current/body-preferences", { auth: false, signal }),
  );
}
export async function putPreferences(
  value: { mode: "auto" | "fixed_default"; defaultCharacterId: string | null },
  revision: number,
) {
  await apiFetch("/v1/installations/current/body-preferences", {
    auth: false,
    method: "PUT",
    body: { ...value, expectedRevision: revision, mutationId: crypto.randomUUID() },
  });
  return getPreferences();
}
export async function getManifest(
  job: string,
  person: number,
  selection: BodySelection,
  signal?: AbortSignal,
) {
  const manifest = manifestSchema.parse(
    await apiFetch(personPath(job, person) + "/body-previews", { auth: false, signal }),
  );
  if (
    manifest.jobId !== job ||
    manifest.personIndex !== person ||
    manifest.selectionRevision !== selection.selectionRevision ||
    !sameBody(manifest.resolvedBody, selection.resolvedBody)
  )
    throw new Error("체형 선택이 변경되었습니다. 다시 확인해 주세요.");
  const prefix = personPath(job, person) + "/body-previews/" + manifest.renderKey + "/";
  for (const c of manifest.candidates) {
    if (
      c.thumbnailUrl !== prefix + encodeURIComponent(c.candidateId) + "/png" ||
      c.previewModel.url !== prefix + encodeURIComponent(c.candidateId) + "/glb" ||
      !validRotation(c.previewModel.rotation) ||
      c.previewModel.sourceSha !== c.sourceBvhSha256 ||
      c.previewModel.characterId !== manifest.resolvedBody.characterId ||
      c.previewModel.characterSha256 !== manifest.resolvedBody.assetSha256 ||
      c.previewModel.modelRevision !== manifest.runtime.modelRevision ||
      c.previewModel.previewRevision !== manifest.runtime.previewRevision
    )
      throw new Error("체형 미리보기 계약을 확인하지 못했습니다.");
  }
  return manifest;
}
export async function verifyDigest(bytes: ArrayBuffer, expected: string) {
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  if (
    Array.from(new Uint8Array(hash), (x) => x.toString(16).padStart(2, "0")).join("") !== expected
  )
    throw new Error("미리보기 파일이 변경되었습니다.");
}
async function bodyBytes(
  url: string,
  manifest: BodyManifest,
  candidate: BodyManifest["candidates"][number],
  signal: AbortSignal,
) {
  const response = await apiFetchResponse(url, { auth: false, signal });
  const headers = response.headers;
  const expected: Record<string, string> = {
    "Body-Render-Key": manifest.renderKey,
    "Body-Revision": String(manifest.selectionRevision),
    "Character-SHA256": manifest.resolvedBody.assetSha256,
    "Source-BVH-SHA256": candidate.sourceBvhSha256,
    "Preview-Revision": manifest.runtime.previewRevision,
    "Model-Revision": manifest.runtime.modelRevision,
  };
  for (const [key, value] of Object.entries(expected))
    if (headers.get("X-Standin-" + key) !== value)
      throw new Error("체형 미리보기 버전이 다릅니다.");
  const blob = await response.blob();
  await verifyDigest(await blob.arrayBuffer(), headers.get("X-Standin-Artifact-SHA256") ?? "");
  return blob;
}
export async function renderBodyCandidate(
  manifest: BodyManifest,
  candidate: BodyManifest["candidates"][number],
  signal: AbortSignal,
) {
  try {
    const blob = await bodyBytes(candidate.previewModel.url, manifest, candidate, signal);
    if (blob.type !== "model/gltf-binary") throw new Error("model unavailable");
    const { renderCandidate } = await import("@/features/pose-viewer/preview/renderCandidate");
    return await renderCandidate(
      await blob.arrayBuffer(),
      candidate.previewModel,
      manifest.resolvedBody.characterId,
      signal,
    );
  } catch (error) {
    signal.throwIfAborted();
    if (error instanceof ApiError && [400, 401, 403, 404, 409].includes(error.status)) throw error;
  }
  const blob = await bodyBytes(candidate.thumbnailUrl, manifest, candidate, signal);
  if (blob.type !== "image/png") throw new Error("미리보기 형식을 확인하지 못했습니다.");
  return blobToDataUrl(blob);
}
