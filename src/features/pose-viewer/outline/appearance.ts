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
// Actual automatic CSP import/posed FBX evidence: docs/OUTLINE_FBX_CSP.md.
// This accepts a receipt representation, not a deployment or server feature flag.
export const ACCEPTED_OUTLINE_EXPRESSIONS: ReadonlySet<string> = new Set([
  "skinned-outward-transparent-native-outline-v2",
]);
const acceptedCharacters: Record<string, string> = {
  "male-default83-v0-7-6-p1": "085dd9c65a3a66035f7e0ce9e0a9171b9abb0e33dada92194676d92e00c8b026",
  "female-default80-v0-3-9-p1": "712ac75e58efd4d6ccded0b1e931590900015de023327f1320cf6d7d94026ffc",
  "male-base-v0-8-0": "705035f1bd247b3bf63a6d293065a5a39390b2d228df559474f9dc6682bf8c43",
  "male-ideal83-v0-8-0": "56248a449cbe312b87687c7e6ffcb35149ed62ee02f1dc8700052025a7dc786f",
  "male-ideal70-v0-8-0": "5c29616fd615db67070f4ab26bb3c46158f43801805cdf53dacc10819ec969cb",
  "male-toon64-v0-8-0": "29aacebd756619bf62dd6f760a9966797e42dcd485dfcff82f0f878adabc595a",
  "male-muscular-v0-8-0": "37c6ad6e8f61354dc51f99594efecdc8b4c48d03b7e611a4e648fc0e64925e2a",
  "male-muscle-max-v0-8-0": "11e88a4df956e9bd2c25f058265eb7530257f196ae54f1ad5f01099f090f38b4",
  "male-bulk-v0-8-0": "9bbd89667c4d38a80b6600f318b84550021d389a0a92c3713b9bb8fb22be2901",
  "male-soft-v0-8-0": "a9dcd65e68d03e62d89ff3cffd27c330361595d9407d02ba16b2720086582f2e",
  "male-fat-max-v0-8-0": "61d0ededbc9e7d71c01b44196e93aa1278ff49fe603bfca28cca2cbd2eac4234",
  "female-base-v0-4-0": "ffd7b57d6ebba06299be252976b511afe5684a237e6f7d440bb90b2ba20f0c33",
  "female-slim-v0-4-0": "33e5041fdfc61ef26553a12d52464a1050cfa8a7a04d98668aeb250f9fb33c38",
  "female-ideal83-v0-4-0": "4cbc58767c54c0ccc1dfd46a7d086a3503af3fc7e1dfa69a21c02eedd1a2234d",
  "female-ideal70-v0-4-0": "669d62723f743163fce7cb1351004f7300cb6d5903761b8e8d2add38b754a6ba",
  "female-toon64-v0-4-0": "dc12c453dbc46f175351d72a73fc8b0f8bc3f8ec15316fb72d2a1082b66a4a68",
  "female-muscular-v0-4-0": "76558d763ba524101fd9c3b50458641423869a2602d9198d05d41cc46efcd522",
  "female-muscle-max-v0-4-0": "8e2407d0118a7d38b4d2553d260778683c5ef8ef3819e6dba18bf43650c7585f",
  "female-soft-v0-4-0": "5d0345f98d881ce46777fdf91129d02a54ff20619ee63e5af9c47738ec4057b2",
  "female-fat-max-v0-4-0": "87563be9bbb84e8d3c2f22b542a27a5c9d49bd939156338b45c40e323fb82cb9",
  "female-new-fat-v0-4-0": "43e0cff054daed6a7d76b5e338c6a0bb941760cecff417c7ca9f4ae3f5bf0f3f",
  "female-new-muscular-v0-4-0": "b22bf84b91a7af1dbb4328aaafa99fbe5d89c30b29dd2c8987b65fd0fb223a96"
};
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
    mapping: z.literal("csp-native-scope-stature-v2-experimental"),
    proof: z
      .object({
        version: z.literal("outlined-fbx-receipt-v1"),
        expression: acceptedExpression,
        mapping: z.literal("csp-native-scope-stature-v2-experimental"),
        runtime_revision: sha,
        source_artifact_sha256: sha,
        fbx_sha256: sha,
        appearance: nonzero,
        binding_sha256: sha,
        character_id: z.string().refine((id) => Object.prototype.hasOwnProperty.call(acceptedCharacters, id)),
        character_sha256: sha,
        output_scope: z.enum(["full", "half", "bust", "shoulder_head", "head"]),
        culling: z.literal("CullingOff"),
        base: z.object({ typed_fbx_values_preserved: z.literal(true) }).passthrough(),
        outline: z
          .object({
            manifest: z
              .object({
                surface: z.literal("outward-transparent"),
                culling: z.literal("CullingOff"),
              })
              .passthrough(),
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
      r.expression !== r.proof.expression ||
      r.mapping !== r.proof.mapping ||
      acceptedCharacters[r.proof.character_id] !== r.proof.character_sha256 ||
      (r.proof.output_scope !== "full" && (r.appearance.width !== 2 || !["male-default83-v0-7-6-p1", "female-default80-v0-3-9-p1"].includes(r.proof.character_id))) ||
      !sameAppearance(r.appearance, r.proof.appearance)
    )
      ctx.addIssue({ code: "custom", message: "outline receipt changed" });
  });
