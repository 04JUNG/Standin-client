import { z } from "zod";
import { skinIdSchema, type SkinId } from "./skinChoices";

/** Independent from the unchanged strict outline appearance contract. */
export const skinSchema = z
  .object({
    version: z.literal("fbx-skin-v1"),
    id: skinIdSchema,
  })
  .strict();
export type Skin = z.infer<typeof skinSchema>;
export function selectedSkin(id: SkinId = "default"): Skin | undefined {
  skinIdSchema.parse(id);
  return id === "default" ? undefined : { version: "fbx-skin-v1", id };
}
export function sameSkin(a?: Skin, b?: Skin) {
  return (a?.id ?? "default") === (b?.id ?? "default") && (!a || !b || a.version === b.version);
}

export const skinCapabilitySchema = z
  .object({
    version: z.literal("fbx-skin-v1"),
    available: z.boolean(),
    supportedIds: z.array(skinIdSchema).min(1).max(5),
  })
  .strict()
  .refine(
    (c) =>
      new Set(c.supportedIds).size === c.supportedIds.length && c.supportedIds.includes("default"),
  );
