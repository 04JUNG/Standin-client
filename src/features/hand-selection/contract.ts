import { z } from "zod";
const id = z.string().regex(/^[a-z][a-z0-9_]{0,63}$/);
export const sha = z.string().regex(/^[a-f0-9]{64}$/);
export const sides = ["left", "right"] as const;
export type Side = (typeof sides)[number];
export const choiceSchema = z.object({
  preset: id,
  source: z.enum(["vlm", "default"]),
  confidence: z.enum(["high", "low"]).nullable(),
  visible: z.boolean().nullable(),
  candidates: z.array(id).max(4),
});
export const observationSchema = z.object({
  left: choiceSchema,
  right: choiceSchema,
  library_version: z.string(),
  status: z.enum(["vlm", "not_requested", "unavailable"]),
});
export const catalogSchema = z.object({
  schema_version: z.literal(1),
  library_version: z.string(),
  library_sha256: sha,
  default_preset: id,
  fallback_order: z.array(id),
  thumbnails_available: z.boolean(),
  categories: z.array(
    z.object({
      id,
      label: z.string(),
      presets: z.array(
        z.object({
          id,
          label: z.string(),
          description: z.string(),
          thumbnails: z.object({ left: z.string(), right: z.string() }).nullable(),
        }),
      ),
    }),
  ),
});
export const selectionSchema = z.object({
  personIndex: z.number().int().nonnegative(),
  left: id,
  right: id,
  recommended: z.object({ left: id, right: id }),
  observation: observationSchema,
  library_version: z.string(),
  library_sha256: sha,
  revision: z.number().int().nonnegative(),
  changed: z.array(z.enum(sides)),
});
export type HandSelection = z.infer<typeof selectionSchema>;
export type HandCatalog = z.infer<typeof catalogSchema>;
export type HandPreset = HandCatalog["categories"][number]["presets"][number];
