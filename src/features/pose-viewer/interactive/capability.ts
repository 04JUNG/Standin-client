import { z } from "zod";
import type { AnalysisResult } from "../api/pose.contract";

/** Final operation support is independent of cached Top5 display assets. */
export const interactiveStateCapabilitySchema = z
  .object({
    schemaVersion: z.literal("standin.interactive-http.v1"),
    available: z.boolean(),
    transport: z.literal("polling"),
    localHands: z.literal(false),
    initialFbxRequired: z.literal(true),
  })
  .strict();
export type InteractiveStateCapability = z.infer<typeof interactiveStateCapabilitySchema>;
export function canUseInteractiveOperations(
  capabilities?: AnalysisResult["capabilities"],
): boolean {
  return (
    capabilities?.interactiveState?.available === true ||
    capabilities?.interactivePreview?.operations === true
  );
}
