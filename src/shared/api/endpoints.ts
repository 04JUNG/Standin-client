/**
 * 서버 엔드포인트 정본. docs/08_API_CONTRACT.md 기준(`/v1` prefix).
 */
export const endpoints = {
  installations: {
    register: "/v1/installations",
    currentData: "/v1/installations/current/data",
  },
  events: { batch: "/v1/events/batch" },
  auth: {
    login: "/v1/auth/login",
    refresh: "/v1/auth/refresh",
    logout: "/v1/auth/logout",
    me: "/v1/users/me",
    oauthStart: (provider: string) => `/v1/auth/oauth/${provider}/start`,
    /** 소셜 콜백이 딥링크로 넘긴 1회용 코드 → 토큰 교환. */
    oauthExchange: "/v1/auth/oauth/exchange",
    resendVerification: "/v1/auth/resend-verification",
  },
  analysis: {
    jobs: "/v1/analysis/jobs",
    job: (id: string) => `/v1/analysis/jobs/${id}`,
    result: (id: string) => `/v1/analysis/jobs/${id}/result`,
    rerun: (id: string) => `/v1/analysis/jobs/${id}/rerun`,
    cancel: (id: string) => `/v1/analysis/jobs/${id}/cancel`,
    selections: (id: string) => `/v1/analysis/jobs/${id}/selections`,
    feedback: (id: string) => `/v1/analysis/jobs/${id}/feedback`,
  },
  poseCandidates: {
    export: (id: string, jobId?: string, personIndex?: number, candidateId?: string) => {
      const path = `/v1/pose-candidates/${encodeURIComponent(id)}/export`;
      if (!jobId || personIndex === undefined || !candidateId) return path;
      return `${path}?${new URLSearchParams({
        jobId,
        personIndex: String(personIndex),
        candidateId,
      })}`;
    },
  },
} as const;
