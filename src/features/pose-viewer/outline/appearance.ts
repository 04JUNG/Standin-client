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
  "female-new-muscular-v0-4-0": "b22bf84b91a7af1dbb4328aaafa99fbe5d89c30b29dd2c8987b65fd0fb223a96",
  "female-base-lod-v4-20261118": "d9f65329a59ef043abcd7af48c33da1d0f8399632e27c65a29cbe545c99499d0",
  "female-slim-lod-v4-20261118": "c9a161e68f4959444832469c01c989372feafa946662cb3d6813e8f79aa76d5b",
  "female-ideal83-lod-v4-20261118": "47c69922eb2d8c120c3881a9ae960f2a2ba2d6f4c7a0f5fb212e5580cdf88aca",
  "female-ideal70-lod-v4-20261118": "a638c55251a4e40b8799533e5aa7eabfb0f437c604315703068234d491edb8ce",
  "female-toon64-lod-v4-20261118": "ebf2df8e137e4f991f00c167e3a7226e852b59dabb0f9a110c173e3417b53049",
  "female-muscular-lod-v4-20261118": "d0025f27202e430da3e8389627e9b314a50b0f4ba5046f83ffc8b18f7c7849cf",
  "female-muscle-max-lod-v4-20261118": "6c597944f5e2c01f0504ed721e06cd9c982d898bac6e15cdf99f8e83307369fd",
  "female-soft-lod-v4-20261118": "f0a2da5009893904ec02a1629f5cc3240a9a62167a5f254be826ae7116ef65ba",
  "female-fat-max-lod-v4-20261118": "f9f14caa69cce6345a94a7763e1b5ae8e2417b67e1aae93902a46c9104505708",
  "female-new-fat-lod-v4-20261118": "efb857a0ef8b617dc4ea6682e433440543e1a6e5133ad47c6d43cd390fd3b130",
  "female-new-muscular-lod-v4-20261118": "34a880888697d24ebb216caf4c34171952a23e2bad86fc3e49eabbbf31818a3d",
  "male-base-lod-v5p2-20261118": "3bed84be1bad274310fae73a2e1f14e279817006acc2c9b69936f99630f6078e",
  "male-ideal83-lod-v5p2-20261118": "1bd39f2f0c272f0dd7072a698bda5a74e5114a0e3eff8e76a00308e790991da4",
  "male-ideal70-lod-v5p2-20261118": "9e3422f04a474545f77b1319cf03fc71ee48da45f3ef222ad74bf6529fcd6cb5",
  "male-toon64-lod-v5p2-20261118": "7e5434290ac724f95e94c0005d10ced1dbafa3722372a54294ee45849489d0f0",
  "male-muscular-lod-v5p2-20261118": "3e28602b32dcbca6c571fb5dd4683d2313822c663d2b2dbff75baca471269aad",
  "male-muscle-max-lod-v5p2-20261118": "bf35f6756b28ec42ff6989b6b8a6b509d71a1d7fce566b7cfe0eb4d46fbc5c5f",
  "male-bulk-lod-v5p2-20261118": "d47ac50fb5fd42fc0ca3aef026fd94c101904f6fd4239ce44661f8cb6a42c5e8",
  "male-soft-lod-v5p2-20261118": "80b3ad2c7306f5d0f4f2a7fd24b725b7cb3fd429f106ffd1fdf0a43dcf7df053",
  "male-fat-max-lod-v5p2-20261118": "2ff74ce44455a9062122c48b5f142b9053a23f438c534aac436ed6d4d66be137"
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
