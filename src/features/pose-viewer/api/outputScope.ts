import { z } from "zod";
import { apiFetch } from "@/shared/api/client";
import { endpoints } from "@/shared/api/endpoints";
import { env } from "@/shared/lib/env";

export const bodyScopeSchema = z.enum(["full", "half", "bust", "shoulder_head", "head"]);
export const scopeSelectionSchema = z.enum([
  "auto",
  "full",
  "half",
  "bust",
  "shoulder_head",
  "head",
]);
const outputScopeSchema = z.object({
  selection: scopeSelectionSchema,
  detected: bodyScopeSchema.nullable(),
  meshScope: bodyScopeSchema.nullable().optional(),
  detectionSource: z.enum([
    "vlm_person",
    "vlm_description",
    "legacy_shot",
    "observed_legs",
    "unknown",
  ]),
  resolved: bodyScopeSchema,
  resolutionSource: z.enum(["auto", "user", "fallback"]),
});
export type BodyScope = z.infer<typeof bodyScopeSchema>;
export type ScopeSelection = z.infer<typeof scopeSelectionSchema>;
export type OutputScope = z.infer<typeof outputScopeSchema>;

export const SCOPE_LABELS: Record<BodyScope, string> = {
  full: "전신",
  half: "반신",
  bust: "흉상",
  shoulder_head: "어깨~머리",
  head: "두상",
};
export function readOutputScope(value: unknown): OutputScope {
  const parsed = outputScopeSchema.safeParse(value);
  return parsed.success
    ? parsed.data
    : {
        selection: "auto",
        detected: null,
        detectionSource: "unknown",
        resolved: "full",
        resolutionSource: "fallback",
      };
}

// Explicit development mock; separate from real server persistence.
const mockScopes = new Map<string, OutputScope>();
export function mockOutputScope(jobId: string, index: number, detected: BodyScope): OutputScope {
  return (
    mockScopes.get(`${jobId}:${index}`) ?? {
      selection: "auto",
      detected,
      detectionSource: "vlm_person",
      resolved: detected,
      resolutionSource: "auto",
    }
  );
}

export async function saveOutputScope(
  jobId: string,
  personIndex: number,
  selection: ScopeSelection,
  current: OutputScope,
): Promise<OutputScope> {
  if (env.useMockPoseApi && !env.isProduction) {
    const value: OutputScope = {
      ...current,
      selection,
      resolved:
        selection === "auto"
          ? (current.meshScope ??
            (current.detected === "bust" ? "half" : current.detected) ??
            "full")
          : selection,
      resolutionSource: selection !== "auto" ? "user" : current.detected ? "auto" : "fallback",
    };
    mockScopes.set(`${jobId}:${personIndex}`, value);
    return value;
  }
  const raw = await apiFetch<unknown>(endpoints.analysis.outputScope(jobId, personIndex), {
    method: "PUT",
    auth: false,
    body: { selection },
  });
  return z
    .object({ personIndex: z.literal(personIndex), outputScope: outputScopeSchema })
    .parse(raw).outputScope;
}

/** Current BFF resolves preferences; older results may only carry presentation scope. */
export function previewScope(person?: {
  outputScope?: OutputScope;
  posePresentation?: { output_scope: string | null } | null;
}): BodyScope {
  if (person?.outputScope) return readOutputScope(person.outputScope).resolved;
  const parsed = bodyScopeSchema.safeParse(person?.posePresentation?.output_scope);
  return parsed.success ? parsed.data : "full";
}
