import { z } from "zod";
import { cameraRecipeSchema, validateSceneCamera } from "./sceneCamera";
import { apiFetchResponse } from "@/shared/api/client";
import { ApiError } from "@/shared/api/errors";
import type { SceneReference, SceneSaveMode } from "./scene";
export const SCENE_MANIFEST_VERSION = "csp-scene-manifest-v1";
const sha = z.string().regex(/^[a-f0-9]{64}$/);
const ids = z.array(z.number().int().nonnegative()).max(8);
export const sourceImageSchema = z.object({
  identity: z.string(),
  originalName: z.string().max(1024).nullable(),
  sha256: sha.nullable(),
  width: z.number().int().positive().nullable(),
  height: z.number().int().positive().nullable(),
  captureMapping: z.object({ status: z.literal("unavailable"), reason: z.literal("not_recorded") }),
});
const availability = z.object({ available: z.boolean(), reasons: z.array(z.string()) });
export const sceneAvailabilitySchema = z.object({
  version: z.literal("scene-availability-v1"),
  selectionValidation: z.literal("required_on_prepare"),
  originalSelection: availability,
  autoCorrectV4: availability,
  manifest: availability,
  candidateEligibility: z.array(
    z.object({
      personIndex: z.number().int().nonnegative(),
      reason: z.string().nullable(),
      candidates: z.array(
        z.object({ candidateId: z.string(), available: z.boolean(), reasons: z.array(z.string()) }),
      ),
    }),
  ),
});
export type SceneAvailability = z.infer<typeof sceneAvailabilitySchema>;
export const sceneManifestSchema = z.object({
  version: z.literal(SCENE_MANIFEST_VERSION),
  jobId: z.string(),
  snapshotSha256: sha,
  sourceImage: sourceImageSchema,
  artifact: z.object({
    sha256: sha,
    saveMode: z.enum(["original-selection", "auto-correct-v4"]),
    layoutVersion: z.enum(["rough-layout-v1", "scene-refinement-v4"]),
    fileCount: z.literal(1),
  }),
  people: z.object({
    detectedIds: ids,
    requestedIds: ids,
    includedIds: ids,
    missing: z.array(
      z.object({
        personIndex: z.number().int().nonnegative(),
        reason: z.enum(["no_candidates", "user_excluded", "not_requested"]),
      }),
    ),
    partial: z.boolean(),
    confirmationRequired: z.boolean(),
  }),
  camera: z.discriminatedUnion("status", [
    z.object({
      version: z.literal("scene-camera-v1"),
      status: z.literal("unavailable"),
      reason: z.string(),
      recipe: z.null(),
      applicationRequired: z.literal(true),
      automaticApplication: z.literal("unsupported"),
      cspValidation: z.literal("unverified"),
    }),
    z.object({
      version: z.literal("scene-camera-v1"),
      status: z.literal("available"),
      reason: z.null(),
      artifactSha256: sha,
      recipe: cameraRecipeSchema,
      applicationRequired: z.literal(true),
      automaticApplication: z.literal("unsupported"),
      cspValidation: z.literal("unverified"),
    }),
  ]),
});
export type SceneManifest = z.infer<typeof sceneManifestSchema>;
const receiptSchema = z.object({
  contractVersion: z.literal("scene-save-v1"),
  saveMode: z.literal("original-selection"),
  reviewVersion: z.literal("scene-review-v1"),
  reviewKey: z.string().regex(/^[a-f0-9]{48}$/),
  artifactSha256: sha,
  expiresAt: z.string().datetime({ offset: true }),
  fileCount: z.literal(1),
  personCount: z.number().int().positive(),
  version: z.literal("rough-layout-v1"),
  manifest: sceneManifestSchema,
});
export type OriginalSceneReceipt = z.infer<typeof receiptSchema>;
export const sceneIntegrity = () => new ApiError(502, "SCENE_INTEGRITY", "");
function sameIds(a: number[], b: number[]) {
  return (
    a.length === b.length &&
    new Set(a).size === a.length &&
    [...a].sort((x, y) => x - y).every((v, i) => v === [...b].sort((x, y) => x - y)[i])
  );
}
export function validateSceneManifest(
  value: unknown,
  expected: {
    jobId: string;
    mode: SceneSaveMode;
    sha256: string;
    references: SceneReference[];
    detected: number[];
    excluded: number[];
    noCandidates: number[];
    sourceImage?: z.infer<typeof sourceImageSchema>;
  },
) {
  const parsed = sceneManifestSchema.safeParse(value);
  if (!parsed.success) throw sceneIntegrity();
  const m = parsed.data;
  if (m.camera.status === "available") {
    if (!m.sourceImage.width || !m.sourceImage.height) throw sceneIntegrity();
    validateSceneCamera(
      {
        version: "scene-camera-artifact-v1",
        artifact_sha256: m.camera.artifactSha256,
        recipe: m.camera.recipe,
      },
      expected.sha256,
      { width: m.sourceImage.width, height: m.sourceImage.height },
    );
  }
  const p = m.people;
  const requested = expected.references.map((r) => r.personIndex);
  const missing = expected.detected.filter((id) => !requested.includes(id));
  if (
    m.jobId !== expected.jobId ||
    m.sourceImage.identity !== `${expected.jobId}:input` ||
    m.artifact.sha256 !== expected.sha256 ||
    m.artifact.saveMode !== expected.mode ||
    m.artifact.layoutVersion !==
      (expected.mode === "original-selection" ? "rough-layout-v1" : "scene-refinement-v4") ||
    !sameIds(p.detectedIds, expected.detected) ||
    !sameIds(p.requestedIds, requested) ||
    !sameIds(p.includedIds, requested) ||
    !sameIds(
      p.missing.map((x) => x.personIndex),
      missing,
    ) ||
    p.partial !== missing.length > 0 ||
    p.confirmationRequired !== p.partial ||
    p.missing.some(
      (x) =>
        x.reason !==
        (expected.noCandidates.includes(x.personIndex)
          ? "no_candidates"
          : expected.excluded.includes(x.personIndex)
            ? "user_excluded"
            : "not_requested"),
    ) ||
    (expected.sourceImage && JSON.stringify(m.sourceImage) !== JSON.stringify(expected.sourceImage))
  )
    throw sceneIntegrity();
  return m;
}
export function manifestRequest(excluded: number[]) {
  return {
    manifestVersion: SCENE_MANIFEST_VERSION,
    cameraContractVersion: "scene-camera-artifact-v1",
    excludedPersonIds: excluded,
  };
}
export function manifestRelease(manifest: SceneManifest, excluded: number[]) {
  return {
    ...manifestRequest(excluded),
    ...(manifest.people.partial
      ? { partialConfirmation: { snapshotSha256: manifest.snapshotSha256 } }
      : {}),
  };
}
export async function prepareOriginalScene(
  jobId: string,
  persons: SceneReference[],
  excluded: number[],
  signal: AbortSignal,
) {
  const res = await apiFetchResponse(`/v1/analysis/jobs/${encodeURIComponent(jobId)}/scene`, {
    auth: false,
    method: "POST",
    signal,
    body: {
      contractVersion: "scene-save-v1",
      saveMode: "original-selection",
      prepare: true,
      persons,
      ...manifestRequest(excluded),
    },
  });
  let payload: unknown;
  try {
    payload = await res.json();
  } catch {
    throw sceneIntegrity();
  }
  const parsed = receiptSchema.safeParse(payload);
  if (!parsed.success || parsed.data.personCount !== persons.length) throw sceneIntegrity();
  if (Date.parse(parsed.data.expiresAt) <= Date.now())
    throw new ApiError(409, "SCENE_REVIEW_EXPIRED", "");
  return parsed.data;
}
