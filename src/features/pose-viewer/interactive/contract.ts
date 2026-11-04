import { z } from "zod";

export const digest = z.string().regex(/^[a-f0-9]{64}$/);
const finite = z.number().finite();
const vector = z.tuple([finite, finite, finite]);
const matrix = z.array(finite).length(16);
// Credentials are only sent to an installation-owned BFF path, never an artifact URL supplied by a third party.
export const ownedPath = z
  .string()
  .max(2048)
  .refine(
    (s) =>
      /^\/v1\/[A-Za-z0-9_/?=&%.:-]+$/.test(s) && !/%(?:2f|5c|2e)/i.test(s) && !s.includes(".."),
  );
export const cameraSchema = z
  .object({
    schemaVersion: z.literal("interactive-camera-v1"),
    projection: z.enum(["orthographic", "perspective"]),
    viewMatrix: matrix,
    projectionMatrix: matrix,
    matrixLayout: z.literal("column-major"),
    basis: z.literal("right-handed-Y-up"),
    clipSpace: z.literal("webgl-minus-one-to-one"),
    origin: z.literal("hips"),
    units: z.literal("meters"),
    distanceTorso: finite.positive().nullable(),
    torsoReferenceSha256: digest,
    target: vector,
    referenceAspect: finite.positive().max(10),
    // Projection includes the search center, scale and crop. Never fit the mesh again.
    framing: z.literal("projection-includes-center-scale-crop"),
    baked: z.enum(["none", "view"]),
  })
  .strict();
export type SearchCamera = z.infer<typeof cameraSchema>;
export const assetSchema = z
  .object({
    schemaVersion: z.literal("interactive-static-asset-v1"),
    url: ownedPath,
    sha256: digest,
    bytes: z
      .number()
      .int()
      .min(28)
      .max(8 * 1024 * 1024),
    sourceSha256: digest,
    characterId: z.string().min(1).max(200),
    characterSha256: digest,
    revision: z.string().min(1).max(128),
    scope: z.enum(["full", "half", "bust", "head", "shoulder_head"]),
    modelVersion: z.literal("posed-mesh-v1"),
    camera: cameraSchema.refine(
      (camera) => camera.baked === "none",
      "static camera must not be baked",
    ),
  })
  .strict();
export type StaticAsset = z.infer<typeof assetSchema>;
export const capabilitySchema = z
  .object({
    schemaVersion: z.literal("interactive-preview-capability-v1"),
    top5: z.literal(true),
    operations: z.boolean(),
  })
  .strict();
export type InteractiveCapability = z.infer<typeof capabilitySchema>;
export function readAsset(raw: unknown, source: string | undefined, scope: string | undefined) {
  const parsed = assetSchema.safeParse(raw);
  return parsed.success &&
    parsed.data.sourceSha256 === source &&
    parsed.data.scope === (scope ?? "full")
    ? parsed.data
    : undefined;
}
export type StateIdentity = { revision: number; stateHash: string };
export function sameState(a: StateIdentity | undefined, b: StateIdentity | undefined) {
  return !!a && !!b && a.revision === b.revision && a.stateHash === b.stateHash;
}
