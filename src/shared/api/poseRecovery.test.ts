import { describe, expect, it } from "vitest";
import { ApiError } from "./errors";
import { poseRecovery } from "./poseRecovery";

describe("pose recovery", () => {
  it.each([
    "PREVIEW_UNAVAILABLE",
    "PREVIEW_SOURCE_CHANGED",
    "PREVIEW_HASH_MISMATCH",
    "INVALID_EXPORT",
    "INVALID_SELECTION",
    "CONVERTER_REJECTED",
    "CONVERTER_INTEGRITY",
  ])("%s routes to candidates without exposing upstream text", (code) => {
    const recovery = poseRecovery(
      new ApiError(409, code, "private BVH SHA poseId capability release"),
    );
    expect(recovery.action).toBe("choose");
    expect(recovery.message).not.toMatch(/BVH|SHA|poseId|capability|release|private/);
    expect(recovery.label).toBe("후보 다시 고르기");
  });
  it.each([
    "HANDS_CHANGED",
    "BODY_PREVIEW_STALE",
    "OUTPUT_SCOPE_CHANGED",
    "PREVIEW_CHANGED",
    "MANUAL_REVIEW_REQUIRED",
  ])("%s requires another review", (code) => {
    expect(poseRecovery(new ApiError(409, code, "raw")).action).toBe("review");
  });
  it.each(["CONVERTER_TIMEOUT", "CONVERTER_FAILED", "EXPORT_FAILED"])("%s can retry", (code) => {
    expect(poseRecovery(new ApiError(502, code, "raw")).action).toBe("retry");
  });
  it("unknown failures use fixed copy", () => {
    expect(poseRecovery(new Error("secret")).message).not.toContain("secret");
  });
});
