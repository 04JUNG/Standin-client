/**
 * 서버 엔드포인트 정본. docs/08_API_CONTRACT.md 기준(`/v1` prefix).
 */
export const endpoints = {
  auth: {
    login: "/v1/auth/login",
    refresh: "/v1/auth/refresh",
    logout: "/v1/auth/logout",
    me: "/v1/users/me",
    oauthStart: (provider: string) => `/v1/auth/oauth/${provider}/start`,
  },
  analysis: {
    jobs: "/v1/analysis/jobs",
    job: (id: string) => `/v1/analysis/jobs/${id}`,
    result: (id: string) => `/v1/analysis/jobs/${id}/result`,
    rerun: (id: string) => `/v1/analysis/jobs/${id}/rerun`,
    cancel: (id: string) => `/v1/analysis/jobs/${id}/cancel`,
  },
} as const;
