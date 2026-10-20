import { expect, it } from "vitest";
import { generatedPoseNotice } from "./generatedPoseNotice";
it.each([
  [null, "source_missing", "원본"],
  [null, "source_changed", "변경"],
  ["timeout", null, "시간"],
  ["rejected", null, "확인 과정"],
  ["failed", null, "만들지 못"],
  ["error", null, "만들지 못"],
] as const)("explains generated %s/%s without implementation terms", (status, reason, expected) => {
  const text = generatedPoseNotice(status, reason);
  expect(text).toContain(expected);
  expect(text).toMatch(/다시 분석|다른 포즈/);
  expect(text).not.toMatch(/poseId|BVH|SHA|capability|release/);
});
