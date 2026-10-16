/** BFF의 저장된 분석 실패 코드만 해석한다. 서버 원문은 화면에 노출하지 않는다. */
export type UpstreamAnalysisCode =
  | "UPSTREAM_UNAVAILABLE"
  | "UPSTREAM_RATE_LIMITED"
  | "UPSTREAM_DAILY_QUOTA_EXHAUSTED"
  | "UPSTREAM_TIMEOUT"
  | "UPSTREAM_ERROR";

type FailureGuidance = {
  code: UpstreamAnalysisCode;
  message: string;
  retryable: boolean;
};

const GUIDANCE: Readonly<Record<string, FailureGuidance>> = {
  ANALYSIS_UNAVAILABLE: {
    code: "UPSTREAM_UNAVAILABLE",
    message: "지금 분석 서버가 혼잡합니다. 잠시 후 다시 시도해 주세요.",
    retryable: true,
  },
  ANALYSIS_RATE_LIMITED: {
    code: "UPSTREAM_RATE_LIMITED",
    message: "AI 분석 요청 한도에 일시적으로 도달했습니다. 잠시 기다린 뒤 다시 시도해 주세요.",
    retryable: true,
  },
  ANALYSIS_DAILY_QUOTA_EXHAUSTED: {
    code: "UPSTREAM_DAILY_QUOTA_EXHAUSTED",
    message:
      "AI 제공 서비스의 일일 사용 한도가 소진되어 지금은 분석할 수 없습니다. 한도 복구 또는 운영자 확인이 필요합니다.",
    retryable: false,
  },
  ANALYSIS_UPSTREAM_TIMEOUT: {
    code: "UPSTREAM_TIMEOUT",
    message: "AI 분석 응답 시간이 초과되었습니다. 잠시 후 다시 시도해 주세요.",
    retryable: true,
  },
  ANALYSIS_UPSTREAM_ERROR: {
    code: "UPSTREAM_ERROR",
    message: "AI 제공 서비스에 일시적인 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.",
    retryable: true,
  },
};

export function upstreamAnalysisFailure(code: string | null): FailureGuidance | undefined {
  return code !== null && Object.prototype.hasOwnProperty.call(GUIDANCE, code)
    ? GUIDANCE[code]
    : undefined;
}

export function upstreamAnalysisRetryable(code: string): boolean {
  return Object.values(GUIDANCE).some((item) => item.code === code && item.retryable);
}
