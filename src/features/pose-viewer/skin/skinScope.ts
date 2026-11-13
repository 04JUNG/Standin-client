import { z } from "zod";
import { ApiError } from "@/shared/api/errors";
import { bodyScopeSchema, type BodyScope } from "../api/outputScope";

/**
 * Mirrors BFF `skinSupportsScope`. Approved skins cover only uncropped full meshes; the Converter
 * crops every other output scope, so the BFF refuses them as SKIN_UNSUPPORTED.
 */
export function skinSupportsScope(scope: BodyScope) {
  return scope === "full";
}
export const SKIN_SCOPE_NOTE = "전신 포즈에서만 스킨을 쓸 수 있어요.";

/** Optional head sibling of `skinExport` (BFF 2026-11-13). Older servers omit it. */
export const skinUnavailableSchema = z
  .object({
    code: z.string().regex(/^SKIN_[A-Z_]{1,40}$/),
    outputScope: bodyScopeSchema.optional(),
  })
  .passthrough();
export type SkinUnavailable = z.infer<typeof skinUnavailableSchema>;

/** Permanent for this selection: retrying cannot help, switching to the default skin does. */
const PERMANENT = new Set(["SKIN_UNSUPPORTED", "SKIN_UV_INCOMPATIBLE"]);
/** Head said no to the chosen skin. Only a named transient reason stays retryable (503). */
export function skinUnavailableError(reason?: SkinUnavailable, listed = false) {
  if (reason?.outputScope && !skinSupportsScope(reason.outputScope))
    return skinScopeError(reason.outputScope);
  if (reason && PERMANENT.has(reason.code)) return new ApiError(422, reason.code, "");
  // Available, but the chosen id is not offered for this selection.
  if (listed) return new ApiError(422, "SKIN_UNSUPPORTED", "");
  return new ApiError(503, reason?.code ?? "SKIN_DISABLED", "");
}
export function skinScopeError(scope: BodyScope) {
  return new ApiError(422, "SKIN_UNSUPPORTED", "", undefined, { outputScope: scope });
}
/** The cropped scope behind a SKIN_UNSUPPORTED failure, if that is the reason. */
export function skinFailureScope(error: unknown): BodyScope | undefined {
  if (!(error instanceof ApiError) || error.code !== "SKIN_UNSUPPORTED") return undefined;
  const scope = bodyScopeSchema.safeParse(
    (error.details as { outputScope?: unknown } | undefined)?.outputScope,
  ).data;
  return scope && !skinSupportsScope(scope) ? scope : undefined;
}
export function isSkinFailure(error: unknown) {
  return error instanceof ApiError && error.code.startsWith("SKIN_");
}
/** Retrying the same selection cannot fix these. */
export function permanentSkinFailure(error: unknown) {
  return error instanceof ApiError && PERMANENT.has(error.code);
}
