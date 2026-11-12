import { z } from "zod";
import { skinSchema, sameSkin } from "./skin";
import { SKIN_ASSET_PINS } from "./skinAssetPins";
import { SKIN_CHOICE_SHA } from "./skinChoices";
const sha = z.string().regex(/^[a-f0-9]{64}$/);
const chosenSkin = skinSchema.refine((s) => s.id !== "default");
/** Full material/UV manifests are verified by BFF; client pins approved assets and final-file lineage. */
export const skinReceiptSchema = z
  .object({
    artifactSha256: sha,
    artifactBytes: z
      .number()
      .int()
      .positive()
      .max(30 * 1024 * 1024),
    bindingSha256: sha,
    skin: chosenSkin,
    sourceArtifactSha256: sha,
    runtimeRevision: sha,
    expression: z.literal("neutral-uv-embedded-basecolor-v1"),
    assetManifestSha256: sha,
    assetVersion: z.string().min(1).max(100),
    uvSha256: sha,
    textureSha256: sha,
    compatibility: z
      .object({
        characterId: z.string().min(1).max(200),
        characterSha256: sha,
        vertices: z.number().int().positive().max(500000),
        bones: z.number().int().positive().max(256),
        polygonIndicesSha256: sha,
        weightsSha256: sha,
        previewMesh: z.string().min(1).max(200),
        trianglesSha256: sha,
      })
      .strict(),
    proof: z
      .object({
        version: z.literal("skin-fbx-receipt-v1"),
        expression: z.literal("neutral-uv-embedded-basecolor-v1"),
        runtime_revision: sha,
        blender_version: z.string().min(1).max(100),
        source_artifact_sha256: sha,
        fbx_sha256: sha,
        skin: chosenSkin,
        skin_sha256: sha,
        binding_sha256: sha,
        character_id: z.string().min(1).max(200),
        character_sha256: sha,
        output_scope: z.literal("full"),
        asset_manifest_sha256: sha,
        asset_version: z.string().min(1).max(100),
        uv_sha256: sha,
        texture_sha256: sha,
        base: z
          .object({
            typed_fbx_values_preserved: z.literal(true),
            approved_surface_changes_only: z.literal(true),
            maxPositionErrorM: z.number().finite().nonnegative().max(0.0001),
            maxNormalError: z.number().finite().nonnegative().max(0.0001),
            maxMatrixError: z.number().finite().nonnegative().max(0.0001),
            maxWeightError: z.number().finite().nonnegative().max(0.000001),
          })
          .strict(),
        material: z
          .object({
            embedded: z.literal(true),
            uv_verified: z.literal(true),
            image_verified: z.literal(true),
            manifest: z
              .object({
                objects: z.record(z.string().regex(/^[1-9][0-9]{0,18}$/), sha),
                connections: z.array(sha).length(3),
                removed_connections: z.array(sha).length(1),
                geometry: z.string().regex(/^[1-9][0-9]{0,18}$/),
                uv: sha,
                uv_layer_link: sha,
                texture_sha256: sha,
                embedded: z.literal(true),
                meshes: z.literal(1),
              })
              .strict(),
          })
          .strict(),
        file_verified: z.literal(true),
        csp_certified: z.literal(true),
        verification_seconds: z.number().finite().nonnegative(),
      })
      .strict(),
  })
  .strict()
  .superRefine((r, ctx) => {
    const p = r.proof;
    if (
      p.skin.id === "default" ||
      p.skin_sha256 !== SKIN_CHOICE_SHA[p.skin.id as keyof typeof SKIN_CHOICE_SHA] ||
      r.artifactSha256 !== p.fbx_sha256 ||
      r.bindingSha256 !== p.binding_sha256 ||
      r.sourceArtifactSha256 !== p.source_artifact_sha256 ||
      r.runtimeRevision !== p.runtime_revision ||
      r.expression !== p.expression ||
      r.assetManifestSha256 !== p.asset_manifest_sha256 ||
      r.assetVersion !== p.asset_version ||
      r.compatibility.characterId !== p.character_id ||
      r.compatibility.characterSha256 !== p.character_sha256 ||
      r.uvSha256 !== p.uv_sha256 ||
      r.textureSha256 !== p.texture_sha256 ||
      r.textureSha256 !== p.material.manifest.texture_sha256 ||
      !sameSkin(r.skin, p.skin)
    )
      ctx.addIssue({ code: "custom", message: "skin receipt changed" });
    if (
      !SKIN_ASSET_PINS.some(
        (pin) =>
          pin.manifestSha256 === r.assetManifestSha256 &&
          pin.assetVersion === r.assetVersion &&
          pin.characterId === p.character_id &&
          pin.characterSha256 === p.character_sha256 &&
          pin.skinId === r.skin.id &&
          pin.uvSha256 === r.uvSha256 &&
          pin.textureSha256 === r.textureSha256 &&
          pin.vertices === r.compatibility.vertices &&
          pin.bones === r.compatibility.bones &&
          pin.previewMesh === r.compatibility.previewMesh &&
          pin.trianglesSha256 === r.compatibility.trianglesSha256 &&
          pin.polygonIndicesSha256 === r.compatibility.polygonIndicesSha256 &&
          pin.weightsSha256 === r.compatibility.weightsSha256 &&
          pin.scope === p.output_scope,
      )
    )
      ctx.addIssue({ code: "custom", message: "unsupported skin asset" });
  });
export type SkinReceipt = z.infer<typeof skinReceiptSchema>;
