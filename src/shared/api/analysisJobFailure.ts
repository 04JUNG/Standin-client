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
    message: "잠시 사용할 수 있는 분석 횟수를 모두 썼어요. 조금 뒤에 다시 시도해 주세요.",
    retryable: true,
  },
  ANALYSIS_DAILY_QUOTA_EXHAUSTED: {
    code: "UPSTREAM_DAILY_QUOTA_EXHAUSTED",
    message: "오늘 사용할 수 있는 분석 횟수를 모두 썼어요. 지금은 새 분석을 할 수 없어요.",
    retryable: false,
  },
  ANALYSIS_UPSTREAM_TIMEOUT: {
    code: "UPSTREAM_TIMEOUT",
    message: "분석에 시간이 너무 오래 걸렸어요. 잠시 후 다시 시도해 주세요.",
    retryable: true,
  },
  ANALYSIS_UPSTREAM_ERROR: {
    code: "UPSTREAM_ERROR",
    message: "분석 중 잠시 문제가 생겼어요. 잠시 후 다시 시도해 주세요.",
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
