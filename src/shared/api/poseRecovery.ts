import { ApiError } from "./errors";
import { messageForCode } from "./errorMessages";

const CHOOSE = new Set([
  "GENERATED_CHECKS_FAILED",
  "GENERATED_SOURCE_UNAVAILABLE",
  "PREVIEW_UNAVAILABLE",
  "PREVIEW_SOURCE_CHANGED",
  "PREVIEW_HASH_MISMATCH",
  "POSE_UNAVAILABLE",
  "INVALID_EXPORT",
  "INVALID_SELECTION",
  "MANUAL_SELECTION_REQUIRED",
  "CONVERTER_REJECTED",
  "CONVERTER_INTEGRITY",
  "BODY_UNAVAILABLE",
  "INVALID_CHARACTER",
  "CHARACTER_UNAVAILABLE",
]);
const REVIEW = new Set([
  "GENERATED_FBX_REQUIRED",
  "BODY_PREVIEW_STALE",
  "BODY_REVIEW_REQUIRED",
  "HAND_REVIEW_REQUIRED",
  "HANDS_CHANGED",
  "HAND_LIBRARY_CHANGED",
  "OUTPUT_SCOPE_CHANGED",
  "PREVIEW_CHANGED",
  "MANUAL_REVIEW_REQUIRED",
]);

/** Recovery stays separate from server prose and never substitutes another asset. */
export function poseRecovery(error: unknown) {
  const code = error instanceof ApiError ? error.code : undefined;
  const action =
    code && CHOOSE.has(code) ? "choose" : code && REVIEW.has(code) ? "review" : "retry";
  return {
    action,
    message: code
      ? messageForCode(code, (error as ApiError).status)
      : "저장할 모습을 불러오지 못했어요. 다시 시도해 주세요.",
    label:
      action === "choose" ? "후보 다시 고르기" : action === "review" ? "다시 확인" : "다시 시도",
  } as const;
}
