import { z } from "zod";
import { clampOutlineWidth } from "./outlineSettings";

export const appearanceSchema = z
  .object({
    version: z.literal("fbx-outline-v1"),
    width: z.number().finite().min(0).max(2),
  })
  .strict();
export type Appearance = z.infer<typeof appearanceSchema>;
export function outlineAppearance(width: number): Appearance | undefined {
  const value = clampOutlineWidth(width);
  return value > 0 ? { version: "fbx-outline-v1", width: value } : undefined;
}
export function sameAppearance(a?: Appearance, b?: Appearance) {
  return (a?.width ?? 0) === (b?.width ?? 0) && (!a || !b || a.version === b.version);
}
export const appearanceCapabilitySchema = z
  .object({
    version: z.literal("fbx-outline-v1"),
    available: z.boolean(),
  })
  .strict();
const sha = z.string().regex(/^[a-f0-9]{64}$/);
// Actual CSP rejected the current hull expression. A flag/claimed proof cannot certify it.
export const ACCEPTED_OUTLINE_EXPRESSIONS: ReadonlySet<string> = new Set();
const acceptedExpression = z.string().refine((value) => ACCEPTED_OUTLINE_EXPRESSIONS.has(value));
const nonzero = appearanceSchema.refine((a) => a.width > 0);
/** BFF verifies the converter's full manifest; the client checks final-file and appearance lineage. */
export const outlineReceiptSchema = z
  .object({
    artifactSha256: sha,
    artifactBytes: z
      .number()
      .int()
      .positive()
      .max(30 * 1024 * 1024),
    bindingSha256: sha,
    appearance: nonzero,
    sourceArtifactSha256: sha,
    runtimeRevision: sha,
    expression: acceptedExpression,
    mapping: z.literal("stature-relative-v1-experimental"),
    proof: z
      .object({
        version: z.literal("outlined-fbx-receipt-v1"),
        expression: acceptedExpression,
        mapping: z.literal("stature-relative-v1-experimental"),
        runtime_revision: sha,
        source_artifact_sha256: sha,
        fbx_sha256: sha,
        appearance: nonzero,
        binding_sha256: sha,
        character_sha256: sha,
        output_scope: z.enum(["full", "half", "bust", "shoulder_head", "head"]),
        base: z.object({ typed_fbx_values_preserved: z.literal(true) }).passthrough(),
        outline: z
          .object({
            skin_verified: z.literal(true),
            displacement_verified: z.literal(true),
            max_displacement_error_m: z.number().finite().nonnegative().max(0.000001),
          })
          .passthrough(),
        file_verified: z.literal(true),
        csp_certified: z.literal(true),
      })
      .passthrough(),
  })
  .strict()
  .superRefine((r, ctx) => {
    if (
      r.artifactSha256 !== r.proof.fbx_sha256 ||
      r.sourceArtifactSha256 !== r.proof.source_artifact_sha256 ||
      r.bindingSha256 !== r.proof.binding_sha256 ||
      r.runtimeRevision !== r.proof.runtime_revision ||
      !sameAppearance(r.appearance, r.proof.appearance)
    )
      ctx.addIssue({ code: "custom", message: "outline receipt changed" });
  });
