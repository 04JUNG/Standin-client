import { z } from "zod";
import { apiFetch, ApiError } from "@/shared/api/client";
import { endpoints } from "@/shared/api/endpoints";

const capabilitiesSchema = z.object({
  available: z.boolean(),
  maxQueryLength: z.literal(500),
  maxTopK: z.number().int().min(1).max(20),
  supportsAllResults: z.boolean().default(false),
});
const responseSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("ok"), jobId: z.string().regex(/^job_[0-9a-f-]{36}$/) }),
  z.object({ status: z.literal("no_result"), jobId: z.null() }),
]);
export const semanticCandidateSchema = z.object({
  familyId: z.string().min(1).max(200),
  alternate: z.boolean(),
  description: z.string().max(1000),
});
export const semanticResultSchema = z.object({
  query: z.string().min(1).max(500),
  index: z.record(z.string()),
});
function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new ApiError(502, "SEMANTIC_CONTRACT", "invalid search response");
  return result.data;
}
export async function searchCapabilities(signal?: AbortSignal) {
  return parse(
    capabilitiesSchema,
    await apiFetch<unknown>(endpoints.semantic.capabilities, { auth: false, signal }),
  );
}
export async function searchPoses(query: string, signal?: AbortSignal, topK: number | null = null) {
  const trimmed = query.trim();
  if (
    !trimmed ||
    trimmed.length > 500 ||
    (topK !== null && (!Number.isSafeInteger(topK) || topK < 1))
  )
    throw new ApiError(400, "INVALID_INPUT", "invalid query");
  return parse(
    responseSchema,
    await apiFetch<unknown>(endpoints.semantic.search, {
      method: "POST",
      auth: false,
      body: { query: trimmed, topK },
      signal,
    }),
  );
}
