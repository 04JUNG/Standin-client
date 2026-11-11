import {
  sceneManifestSchema,
  manifestRequest,
  manifestRelease,
  SCENE_MANIFEST_VERSION,
  type OriginalSceneReceipt,
} from "./sceneMetadata";
import { z } from "zod";
import { apiFetchResponse } from "@/shared/api/client";
import { ApiError } from "@/shared/api/errors";
import { verifyDigest } from "@/features/body-selection/api";
import { bodyScopeSchema } from "@/features/pose-viewer/api/outputScope";

export const SCENE_CONTRACT = "scene-save-v1";
export const SCENE_REVIEW_VERSION = "scene-review-v1";
export const sceneSaveContractSchema = z.object({
  version: z.literal(SCENE_CONTRACT),
  saveModes: z.array(z.enum(["original-selection", "auto-correct-v4"])),
  manifestVersion: z.literal(SCENE_MANIFEST_VERSION).optional(),
  reviewVersion: z.literal(SCENE_REVIEW_VERSION),
  reviewTtlSeconds: z.number().int().positive(),
  cancellation: z.object({ httpRequest: z.literal(true), serverOperation: z.literal(false) }),
});
export type SceneSaveContract = z.infer<typeof sceneSaveContractSchema>;
export type SceneSaveMode = SceneSaveContract["saveModes"][number];
export function readSceneSaveContract(value: unknown): SceneSaveContract | undefined {
  const parsed = sceneSaveContractSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}
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
const sha = z.string().regex(/^[a-f0-9]{64}$/);
const sceneReviewSchema = z.object({
  manifest: sceneManifestSchema.optional(),
  contractVersion: z.literal(SCENE_CONTRACT),
  saveMode: z.literal("auto-correct-v4"),
  reviewVersion: z.literal(SCENE_REVIEW_VERSION),
  expiresAt: z.string().datetime({ offset: true }),
  artifactContract: z.literal("verified-scene-fbx-v1").optional(),
  version: z.literal("scene-refinement-v4"),
  reviewKey: z.string().regex(/^[a-f0-9]{48}$/),
  artifactSha256: sha,
  previewSha256: z.string(),
  previewBase64: z.string().max(12 * 1024 * 1024),
  personCount: z.number().int().min(1).max(8),
  fileCount: z.literal(1),
  summary: z.array(
    z.object({
      personIndex: z.number().int().nonnegative(),
      poseId: z.string().nullable(),
      previousPoseId: z.string().nullable(),
      previousOutputScope: bodyScopeSchema,
      outputScope: bodyScopeSchema,
      poseChanged: z.boolean(),
      outputScopeChanged: z.boolean(),
      previousDirection: z.null(),
      directionChanged: z.null(),
      direction: z
        .object({
          torso_camera_yaw: z.number().min(-360).max(360).nullable(),
          torso_label: z.string().max(64).nullable(),
          head_label: z.string().max(64).nullable(),
          head_camera_yaw: z.number().min(-360).max(360).nullable(),
          head_relative_yaw: z.number().min(-360).max(360).nullable(),
          head_pitch_degrees: z.number().min(-360).max(360).nullable(),
        })
        .nullable(),
      interaction: z.enum(["preserve", "restraining", "reaching"]).nullable(),
      armGoalCount: z.number().int().nonnegative().nullable(),
    }),
  ),
});
export type SceneReview = z.infer<typeof sceneReviewSchema> & { previewFailed?: boolean };
const integrity = () => new ApiError(502, "SCENE_INTEGRITY", "");
export function assertSceneCurrent(review: Pick<SceneReview, "expiresAt">) {
  if (Date.parse(review.expiresAt) <= Date.now())
    throw new ApiError(409, "SCENE_REVIEW_EXPIRED", "");
}
function confirmedBody(persons: SceneReference[], review: SceneReview | OriginalSceneReceipt) {
  assertSceneCurrent(review);
  return {
    contractVersion: SCENE_CONTRACT,
    saveMode: review.saveMode,
    ...(review.manifest
      ? manifestRelease(
          review.manifest,
          review.manifest.people.missing
            .filter((p) => p.reason === "user_excluded")
            .map((p) => p.personIndex),
        )
      : {}),
    reviewVersion: review.reviewVersion,
    artifactSha256: review.artifactSha256,
    reviewKey: review.reviewKey,
    persons,
  };
}
export async function downloadScene(
  jobId: string,
  persons: SceneReference[],
  review?: SceneReview | OriginalSceneReceipt,
  options: { signal?: AbortSignal; negotiated?: boolean } = {},
) {
  const response = await apiFetchResponse(`/v1/analysis/jobs/${encodeURIComponent(jobId)}/scene`, {
    method: "POST",
    auth: false,
    ...(options.signal ? { signal: options.signal } : {}),
    body: review
      ? confirmedBody(persons, review)
      : {
          persons,
          ...(options.negotiated
            ? { contractVersion: SCENE_CONTRACT, saveMode: "original-selection" }
            : {}),
        },
  });
  const digest = response.headers.get("X-Standin-Artifact-SHA256");
  if (
    !digest ||
    !sha.safeParse(digest).success ||
    response.headers.get("X-Standin-Person-Count") !== String(persons.length) ||
    response.headers.get("X-Standin-Scene-Version") !==
      (review ? review.version : "rough-layout-v1") ||
    (review !== undefined && digest !== review.artifactSha256) ||
    ((review || options.negotiated) &&
      (response.headers.get("X-Standin-Scene-Contract") !== SCENE_CONTRACT ||
        response.headers.get("X-Standin-Scene-Save-Mode") !==
          (review ? review.saveMode : "original-selection"))) ||
    (review?.manifest !== undefined &&
      (response.headers.get("X-Standin-File-Count") !== "1" ||
        response.headers.get("X-Standin-Scene-Manifest-Version") !== SCENE_MANIFEST_VERSION ||
        response.headers.get("X-Standin-Scene-Snapshot-SHA256") !== review.manifest.snapshotSha256))
  )
    throw integrity();
  const bytes = await response.arrayBuffer();
  try {
    await verifyDigest(bytes, digest);
  } catch {
    throw integrity();
  }
  if (new TextDecoder().decode(bytes.slice(0, 23)) !== "Kaydara FBX Binary  \0\x1a\0")
    throw integrity();
  options.signal?.throwIfAborted();
  return new Uint8Array(bytes);
}
export async function prepareScene(
  jobId: string,
  persons: SceneReference[],
  signal?: AbortSignal,
  excludedPersonIds?: number[],
): Promise<SceneReview> {
  const response = await apiFetchResponse(`/v1/analysis/jobs/${encodeURIComponent(jobId)}/scene`, {
    method: "POST",
    auth: false,
    signal,
    body: {
      contractVersion: SCENE_CONTRACT,
      saveMode: "auto-correct-v4",
      persons,
      prepare: true,
      artifactOnly: true,
      ...(excludedPersonIds ? manifestRequest(excludedPersonIds) : {}),
    },
  });
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw integrity();
  }
  const parsed = sceneReviewSchema.safeParse(payload);
  if (!parsed.success) throw integrity();
  const result = parsed.data;
  const indices = result.summary.map((p) => p.personIndex);
  if (
    result.personCount !== persons.length ||
    indices.length !== persons.length ||
    new Set(indices).size !== persons.length ||
    persons.some((p) => !indices.includes(p.personIndex))
  )
    throw integrity();
  assertSceneCurrent(result);
  if (result.artifactContract === "verified-scene-fbx-v1") {
    if (result.previewBase64 !== "") throw integrity();
  } else {
    try {
      const preview = Uint8Array.from(atob(result.previewBase64), (x) => x.charCodeAt(0));
      if (![137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => preview[i] === v)) throw integrity();
      await verifyDigest(preview.buffer, result.previewSha256);
    } catch {
      throw integrity();
    }
  }
  signal?.throwIfAborted();
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
    body: { ...confirmedBody(persons, review), preview: true },
  });
  if (response.headers.get("X-Standin-Artifact-SHA256") !== review.artifactSha256)
    throw integrity();
  const digest = response.headers.get("X-Standin-Preview-Artifact-SHA256") ?? "";
  if (!sha.safeParse(digest).success) throw integrity();
  const data = await response.arrayBuffer();
  if (
    response.headers.get("Content-Type")?.split(";")[0] !== "image/png" ||
    data.byteLength > 4 * 1024 * 1024 ||
    ![137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => new Uint8Array(data)[i] === v)
  )
    throw integrity();
  try {
    await verifyDigest(data, digest);
  } catch {
    throw integrity();
  }
  signal.throwIfAborted();
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (signal.aborted) reject(signal.reason);
      else resolve(String(reader.result).split(",")[1]!);
    };
    reader.onerror = () => reject(integrity());
    reader.readAsDataURL(new Blob([data], { type: "image/png" }));
  });
}
