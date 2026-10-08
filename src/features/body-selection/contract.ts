import { z } from "zod";
const id = z.string().min(1).max(200);
export const sha = z.string().regex(/^[a-f0-9]{64}$/);
export const bodyRefSchema = z.object({
  bodyId: id,
  bodyVersion: id,
  assetSha256: sha,
  rigVersion: id,
  measurementVersion: id,
  characterId: id,
});
export const selectionSchema = z.object({
  schemaVersion: z.literal("body-selection.v1"),
  personIndex: z.number().int().nonnegative(),
  intent: z.enum(["inherit", "manual", "auto"]),
  manualCharacterId: id.nullable(),
  recommendation: z.object({
    status: z.enum(["available", "unavailable", "disabled", "not_applicable"]),
    body: bodyRefSchema.nullable(),
    reasonCodes: z.array(z.string()),
  }),
  resolvedBody: bodyRefSchema.nullable(),
  resolvedSource: z
    .enum([
      "manual",
      "fixed_default",
      "auto_recommendation",
      "user_default_fallback",
      "catalog_default_fallback",
    ])
    .nullable(),
  resolutionStatus: z.enum(["ready", "needs_selection", "unavailable", "not_applicable"]),
  selectionRevision: z.number().int().nonnegative(),
});
export const preferencesSchema = z.object({
  version: z.literal("body-preferences.v1"),
  scope: z.literal("installation"),
  mode: z.enum(["auto", "fixed_default"]),
  defaultCharacterId: id.nullable(),
  revision: z.number().int().nonnegative(),
});
/** Only authenticated, relative BFF URLs may carry installation credentials. */
export const localUrl = z
  .string()
  .refine((v) => v.startsWith("/v1/") && !v.includes("\\") && !v.includes("#"), "invalid BFF path");
export const neutralSchema = z.object({
  url: localUrl,
  sha256: sha,
  characterSha256: sha,
  pose: z.literal("attention"),
  framing: z.literal("body-comparison.v1"),
});
export const optionsSchema = z.object({
  catalogRevision: z.string(),
  characters: z.array(
    z.object({
      characterId: id,
      bodyRef: bodyRefSchema,
      selectable: z.boolean(),
      reasonCodes: z.array(z.string()),
      displayName: z.string().optional(),
      neutralPreview: neutralSchema.optional(),
    }),
  ),
});
export const manifestSchema = z.object({
  schemaVersion: z.literal("body-previews.v1"),
  jobId: id,
  personIndex: z.number().int().nonnegative(),
  selectionRevision: z.number().int().nonnegative(),
  resolvedBody: bodyRefSchema,
  renderKey: sha,
  outputScope: z.literal("full"),
  status: z.literal("renderable"),
  runtime: z.object({ previewRevision: sha, modelRevision: sha }),
  candidates: z
    .array(
      z.object({
        candidateId: id,
        poseId: id,
        rank: z.number().int().positive(),
        sourceBvhSha256: sha,
        thumbnailUrl: localUrl,
        previewModel: z.object({
          url: localUrl,
          rotation: z.array(z.array(z.number())),
          sourceSha: sha,
          characterId: id,
          characterSha256: sha,
          modelRevision: sha,
          previewRevision: sha,
        }),
      }),
    )
    .min(1),
});
export type BodySelection = z.infer<typeof selectionSchema>;
export type BodyPreferences = z.infer<typeof preferencesSchema>;
export type BodyManifest = z.infer<typeof manifestSchema>;
export type BodyOption = z.infer<typeof optionsSchema>["characters"][number];
export type BodyChange = { intent: "auto" | "inherit" } | { intent: "manual"; characterId: string };
export function sameBody(a: unknown, b: unknown) {
  const aa = bodyRefSchema.safeParse(a),
    bb = bodyRefSchema.safeParse(b);
  return aa.success && bb.success && JSON.stringify(aa.data) === JSON.stringify(bb.data);
}
