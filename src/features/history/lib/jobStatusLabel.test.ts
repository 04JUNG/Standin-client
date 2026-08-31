import { describe, expect, it } from "vitest";
import { isOpenable, jobStatusDisplay, unopenableReason } from "./jobStatusLabel";

describe("jobStatusDisplay", () => {
  it("완료와 진행 중을 구분한다", () => {
    expect(jobStatusDisplay({ status: "completed", errorCode: null }).tone).toBe("done");
    expect(jobStatusDisplay({ status: "queued", errorCode: null }).tone).toBe("running");
    expect(jobStatusDisplay({ status: "running", errorCode: null }).tone).toBe("running");
  });

  it("상류 혼잡은 일반 실패와 다른 안내를 준다", () => {
    // 뭉개면 화면이 "다른 이미지로 다시 시도"를 안내하는데, 상류가 붐비는 동안에는
    // 어떤 이미지도 실패한다. 같은 이미지로 잠시 뒤 다시 하는 것이 맞다.
    const upstream = jobStatusDisplay({ status: "failed", errorCode: "ANALYSIS_UNAVAILABLE" });
    const generic = jobStatusDisplay({ status: "failed", errorCode: null });
    expect(upstream.tone).toBe("failed");
    expect(upstream.detail).not.toBe(generic.detail);
    expect(upstream.detail).toContain("같은 이미지");
  });

  it("모르는 실패 코드는 일반 실패 문구로 떨어진다", () => {
    expect(jobStatusDisplay({ status: "failed", errorCode: "SOMETHING_NEW" }).detail).toBe(
      "포즈 분석에 실패했습니다.",
    );
  });
});

describe("isOpenable", () => {
  it("완료됐고 인물이 있을 때만 열 수 있다", () => {
    expect(isOpenable({ status: "completed", personCount: 2 })).toBe(true);
    expect(isOpenable({ status: "completed", personCount: 0 })).toBe(false);
    expect(isOpenable({ status: "running", personCount: 0 })).toBe(false);
    expect(isOpenable({ status: "failed", personCount: 0 })).toBe(false);
  });

  it("열 수 없으면 사유를 준다", () => {
    expect(unopenableReason({ status: "completed", personCount: 2 })).toBeNull();
    expect(unopenableReason({ status: "running", personCount: 0 })).toContain("분석이 끝나면");
    expect(unopenableReason({ status: "failed", personCount: 0 })).toContain("결과가 없습니다");
    expect(unopenableReason({ status: "completed", personCount: 0 })).toContain("인물을 찾지 못했");
  });
});
