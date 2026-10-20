import { bodyScopeSchema } from "@/features/pose-viewer/api/outputScope";
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
/** Numeric controls an operator declared for one body (`body-shape.v1`). */
export const shapeControlSchema = z.object({
  key: z.string().regex(/^[a-z][a-z0-9_]{0,39}$/),
  min: z.number().finite(),
  max: z.number().finite(),
  step: z.number().positive(),
  default: z.number().finite(),
  /** 화면 이름. 없으면 key로 앱이 정한 이름(shapeLabels). 체형마다 같은 key를 달리 부를 수 있다. */
  label: z.string().min(1).max(24).optional(),
});
export const shapeSpecSchema = z.object({
  schemaVersion: z.literal("body-shape.v1"),
  controls: z.array(shapeControlSchema).min(1).max(64),
  /** 앞에서부터 기본으로 보일 조절 수. 나머지는 "세부 조절". 없으면 5. */
  basic: z.number().int().min(1).max(12).optional(),
});
const controlsSchema = z.record(z.number().finite());
export const bodyShapeSchema = z.object({
  schemaVersion: z.literal("body-shape.v1"),
  controls: controlsSchema,
  shapeSha256: sha,
});
export const shapeDefaultSchema = z.object({ characterId: id, controls: controlsSchema });
export const selectionSchema = z.object({
  schemaVersion: z.literal("body-selection.v1"),
  previewOnly: z.literal(true).optional(),
  personIndex: z.number().int().nonnegative(),
  intent: z.enum(["inherit", "manual", "auto"]),
  manualCharacterId: id.nullable(),
  /** Older BFFs omit it. Null = the cataloged body as is. */
  shape: bodyShapeSchema.nullable().optional(),
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
      "last_used",
      "auto_recommendation",
      "user_default_fallback",
      "catalog_default_fallback",
    ])
    .nullable(),
  resolutionStatus: z.enum(["ready", "needs_selection", "unavailable", "not_applicable"]),
  selectionRevision: z.number().int().nonnegative(),
});
/** Only authenticated, relative BFF URLs may carry installation credentials. */
export const localUrl = z
  .string()
  .refine((v) => v.startsWith("/v1/") && !v.includes("\\") && !v.includes("#"), "invalid BFF path");
export const neutralSchema = z.object({
  url: localUrl,
  sha256: sha,
  characterSha256: sha,
  pose: z.enum(["t_pose", "attention"]),
  framing: z.literal("body-comparison.v1"),
});
/**
 * 실시간 체형 미리보기 자산(`standin-shape-runtime.v1`). 조절 가능한 체형이 같은 자산을 쓰고
 * `preset`으로 시작 값을 고른다. 없거나 규칙이 다르면 고정 그림만 쓴다.
 */
export const shapeRuntimeSchema = z.object({
  url: localUrl,
  sha256: sha,
  bytes: z
    .number()
    .int()
    .positive()
    .max(32 * 1024 * 1024),
  format: z.enum(["standin-shape-runtime.v1", "standin-shape-runtime.v2"]),
  rules: z.string().min(1).max(64),
  preset: z.string().regex(/^[A-Z][A-Z0-9_]{0,31}$/),
  /** 서버가 이 체형을 굽는 원본(컨트롤러 VERSION·해시). 자산 머리말과 같아야 쓴다. */
  source: z
    .object({
      rules: z.string().min(1).max(64),
      blendSha256: sha,
      controllerSha256: sha,
    })
    .optional(),
});
/** 체형 커스텀에서 이름 붙여 저장한 체형("주인공 A"). 성별은 기준 체형(characterId)을 따른다. */
export const bodyCardSchema = z.object({
  cardId: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/),
  name: z.string().min(1).max(64),
  characterId: id,
  controls: controlsSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
});
export const preferencesSchema = z.object({
  version: z.literal("body-preferences.v1"),
  scope: z.literal("installation"),
  /** `last_used`: 새 작업은 마지막으로 직접 고른 체형으로 시작(없으면 남성 기본형). */
  mode: z.enum(["auto", "fixed_default", "last_used"]),
  defaultCharacterId: id.nullable(),
  /** 예전 "내 기본값". 새 BFF는 카드로도 보여 준다(`cards`의 "my-default"). */
  shapeDefault: shapeDefaultSchema.nullable().optional(),
  /** 내 체형 카드. 카드를 모르는 BFF는 빼고 보낸다. */
  cards: z.array(bodyCardSchema).optional(),
  /** 마지막으로 직접 고른 체형. 서버가 체형을 고를 때마다 적는다. */
  lastUsed: z
    .object({ characterId: id, controls: controlsSchema.nullable(), usedAt: z.string() })
    .nullable()
    .optional(),
  /**
   * 설정에서 수치를 정할 수 있는 체형. 이름·고정 그림·실시간 미리보기 자산은 새 BFF만 준다
   * (작업 밖에서도 "내 기본값" 화면이 그 체형을 그릴 수 있게).
   */
  shapeEditable: z
    .array(
      z.object({
        characterId: id,
        shape: shapeSpecSchema,
        displayName: z.string().optional(),
        neutralPreview: neutralSchema.optional(),
        shapeRuntime: shapeRuntimeSchema.optional(),
      }),
    )
    .optional(),
  revision: z.number().int().nonnegative(),
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
      shape: shapeSpecSchema.optional(),
      shapeRuntime: shapeRuntimeSchema.optional(),
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
  outputScope: bodyScopeSchema,
  hands: z
    .object({ revision: z.number().int().nonnegative(), library_sha256: sha })
    .passthrough()
    .nullable()
    .optional(),
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
/** 체형을 그리는 데 필요한 것만(작업 밖 설정 화면은 bodyRef·선택 가능 여부가 없을 수 있다). */
export type BodyLook = Pick<
  BodyOption,
  "characterId" | "displayName" | "neutralPreview" | "shape" | "shapeRuntime"
> & { bodyRef?: BodyOption["bodyRef"] };
export type ShapeSpec = z.infer<typeof shapeSpecSchema>;
export type ShapeControl = z.infer<typeof shapeControlSchema>;
export type ShapeDefault = z.infer<typeof shapeDefaultSchema>;
export type BodyCard = z.infer<typeof bodyCardSchema>;
export type BodyChange =
  | { intent: "auto" | "inherit" }
  | { intent: "manual"; characterId: string; shape?: { controls: Record<string, number> } };
export function sameBody(a: unknown, b: unknown) {
  const aa = bodyRefSchema.safeParse(a),
    bb = bodyRefSchema.safeParse(b);
  return aa.success && bb.success && JSON.stringify(aa.data) === JSON.stringify(bb.data);
}
