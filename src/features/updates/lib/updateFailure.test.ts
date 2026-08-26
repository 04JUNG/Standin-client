import { describe, expect, it } from "vitest";
import { updateFailureReason } from "./updateFailure";

/**
 * 지표에 자유 텍스트가 새지 않는지, 그리고 확실하지 않은 것을 억지로 분류하지
 * 않는지 고정한다(ADR-011).
 */
describe("updateFailureReason", () => {
  it("서명 검증 실패를 구분한다", () => {
    expect(updateFailureReason(new Error("Signature verification failed"))).toBe("SIGNATURE");
    expect(updateFailureReason(new Error("minisign: bad key"))).toBe("SIGNATURE");
  });

  it("피드가 없는 경우를 구분한다", () => {
    // prerelease로 올렸거나 latest.json이 빠진 릴리스에서 실제로 나는 실패다.
    expect(updateFailureReason(new Error("Could not fetch: 404 Not Found"))).toBe("FEED_MISSING");
  });

  it("네트워크 실패를 구분한다", () => {
    expect(updateFailureReason(new Error("network error"))).toBe("NETWORK");
    expect(updateFailureReason(new Error("operation timed out"))).toBe("NETWORK");
  });

  it("분류할 수 없으면 UNKNOWN으로 둔다", () => {
    // 억지로 나누면 틀린 집계가 된다. 틀린 집계는 없는 집계보다 나쁘다.
    expect(updateFailureReason(new Error("something odd happened"))).toBe("UNKNOWN");
    expect(updateFailureReason("문자열 오류")).toBe("UNKNOWN");
    expect(updateFailureReason(null)).toBe("UNKNOWN");
  });

  it("오류 메시지 원문을 그대로 돌려주지 않는다", () => {
    // 업데이터 오류에는 파일 경로나 호스트명이 들어올 수 있다(docs/11 §5).
    const leaky = new Error("failed to write C:\\Users\\someone\\AppData\\Standin.exe");
    expect(updateFailureReason(leaky)).toBe("UNKNOWN");
  });
});
