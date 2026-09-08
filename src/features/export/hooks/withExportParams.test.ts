import { describe, expect, it } from "vitest";
import { withExportParams } from "./useSaveFlow";

/**
 * export URL은 두 곳에서 온다 — 후보의 `bvhUrl`(쿼리 있음)과 refine의 `exportUrl`
 * (서버가 만든 문자열). 어느 쪽이든 안전하게 덧붙여야 한다.
 */
describe("withExportParams", () => {
  it("쿼리가 이미 있으면 &로, 없으면 ?로 잇는다", () => {
    expect(withExportParams("/export?jobId=j", "fbx", null)).toBe("/export?jobId=j&format=fbx");
    expect(withExportParams("/export", "fbx", null)).toBe("/export?format=fbx");
  });

  it("체형을 고르면 fbx에 실어 보낸다", () => {
    expect(withExportParams("/export", "fbx", "standin-female-v2-lbs")).toBe(
      "/export?format=fbx&characterId=standin-female-v2-lbs",
    );
  });

  it("BVH에는 체형을 싣지 않는다 — 동작만 담는 포맷이라 서버 로그가 거짓말을 하게 된다", () => {
    expect(withExportParams("/export", "bvh", "standin-female-v2-lbs")).toBe("/export?format=bvh");
  });

  it("체형이 null이면 파라미터를 아예 붙이지 않는다 — 서버 기본값으로 저장된다", () => {
    expect(withExportParams("/export", "fbx", null)).toBe("/export?format=fbx");
  });
});
