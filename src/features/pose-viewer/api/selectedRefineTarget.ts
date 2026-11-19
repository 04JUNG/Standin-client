import { z } from "zod";
import { overlaySchema } from "./analysisProgress";

/** The owned rough's observed targets. Never solver activity or predicted motion. */
const schema = z
  .object({
    version: z.literal("selected-refine-target.v1"),
    width: z.number().finite().positive(),
    height: z.number().finite().positive(),
    skeleton: overlaySchema,
    targetJoints: z.array(z.number().int().min(5).max(16)).min(1).max(12),
  })
  .refine(
    (v) =>
      new Set(v.targetJoints).size === v.targetJoints.length &&
      v.targetJoints.every((i) => v.skeleton.points[i] !== null),
  );
export type SelectedRefineTarget = z.infer<typeof schema>;
export function readSelectedRefineTarget(raw: unknown): SelectedRefineTarget | undefined {
  const result = schema.safeParse(raw);
  return result.success ? result.data : undefined;
}
