import { z } from "zod";
import { apiFetch } from "@/shared/api/client";
import { endpoints } from "@/shared/api/endpoints";
import { env } from "@/shared/lib/env";

export const bodyScopeSchema = z.enum(["full", "half", "bust", "head"]);
export const scopeSelectionSchema = z.enum(["auto", "full", "half", "bust", "head"]);
const outputScopeSchema = z.object({
  selection: scopeSelectionSchema,
  detected: bodyScopeSchema.nullable(),
  detectionSource: z.enum(["vlm_person", "legacy_shot", "unknown"]),
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
      resolved: selection === "auto" ? (current.detected ?? "full") : selection,
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
