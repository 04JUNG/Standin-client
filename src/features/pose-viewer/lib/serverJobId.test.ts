import { describe, expect, it } from "vitest";
import { isServerJobId } from "./serverJobId";

describe("isServerJobId", () => {
  it("BFF가 발급한 id를 알아본다", () => {
    expect(isServerJobId("job_0f1e2d3c-4b5a-4968-8778-695a4b3c2d1e")).toBe(true);
  });

  it("라이브 분석의 클라이언트 id는 아니라고 답한다", () => {
    // InputPreviewPage/BarProgressPage가 crypto.randomUUID()로 만드는 형태.
    expect(isServerJobId("0f1e2d3c-4b5a-4968-8778-695a4b3c2d1e")).toBe(false);
  });

  it("값이 없으면 아니다", () => {
    expect(isServerJobId(undefined)).toBe(false);
    expect(isServerJobId("")).toBe(false);
  });
});
