import { describe, expect, it } from "vitest";
import { ApiError } from "@/shared/api/errors";
import { AnalysisError } from "../api/pose.contract";
import { analysisFailure } from "./analysisFailure";

describe("analysisFailure", () => {
  // 2026-08-21 장애: 상류(Gemini)가 붐비는 동안 분석이 실패했는데 화면은 "다른 이미지로
  // 다시 시도해 주세요"라고 안내했다. 그 시간에는 어떤 이미지도 실패한다.
  it("상류 혼잡은 같은 입력으로 다시 시도하도록 안내한다", () => {
    const failure = analysisFailure(
      new AnalysisError("UPSTREAM_UNAVAILABLE", "지금 분석 서버가 혼잡합니다. 잠시 후 다시 시도해 주세요."),
    );

    expect(failure.message).toContain("잠시 후");
    expect(failure.message).not.toContain("다른 이미지");
    expect(failure.retryable).toBe(true);
  });

  // `messageOf`는 ApiError 전용이라 AnalysisError를 "요청을 처리하지 못했습니다."로
  // 뭉갠다. 그러면 앱이 직접 쓴 원인 설명이 화면에서 전부 사라진다.
  it("앱이 쓴 실패 문구를 일반 문구로 뭉개지 않는다", () => {
    expect(analysisFailure(new AnalysisError("NO_PEOPLE", "이미지에서 인물을 찾지 못했습니다.")).message).toBe(
      "이미지에서 인물을 찾지 못했습니다.",
    );
  });

  it("입력이 문제인 실패에는 다시 시도를 권하지 않는다", () => {
    // 같은 이미지로 다시 해도 결과가 같다. 재시도 버튼은 사용자를 붙잡아 둘 뿐이다.
    expect(analysisFailure(new AnalysisError("NO_PEOPLE", "인물 없음")).retryable).toBe(false);
    expect(analysisFailure(new AnalysisError("JOB_FAILED", "분석 실패")).retryable).toBe(false);
  });

  it("시간 초과와 중단은 다시 시도할 수 있다", () => {
    expect(analysisFailure(new AnalysisError("TIMEOUT", "오래 걸립니다")).retryable).toBe(true);
    expect(analysisFailure(new AnalysisError("ABANDONED", "중단됨")).retryable).toBe(true);
  });

  it("서버 오류는 code로 고른 앱 문구를 쓴다(서버 원문 노출 금지)", () => {
    const failure = analysisFailure(new ApiError(503, "SERVICE_PAUSED", "paused by operator"));

    expect(failure.message).not.toContain("paused by operator");
    expect(failure.retryable).toBe(true);
  });

  it("네트워크 실패도 다시 시도할 수 있다", () => {
    expect(analysisFailure({ kind: "network", message: "서버에 연결할 수 없습니다.", retryable: true }))
      .toMatchObject({ retryable: true });
  });
});
