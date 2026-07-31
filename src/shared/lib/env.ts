/**
 * 환경변수 단일 접근점. 하드코딩된 서버 URL 금지(CLAUDE.md §10).
 * import.meta.env 값은 빌드 타임에 주입된다.
 */
type AppEnv = "development" | "production" | "test";

function readBool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  return value === "true" || value === "1";
}

const useMockApi = readBool(import.meta.env.VITE_USE_MOCK_API, true);

export const env = {
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000",
  // 랜딩페이지(별도 레포 Standin). 회원가입처럼 앱이 다루지 않는 흐름을 여기로 보낸다(docs/06 §1).
  // 기본값은 랜딩의 Vite dev 서버 포트다.
  webBaseUrl: (import.meta.env.VITE_WEB_BASE_URL ?? "http://localhost:5173").replace(/\/+$/, ""),
  useMockApi,
  // 포즈 분석 서버만 먼저 붙는 과도기 지원: 미설정이면 useMockApi를 그대로 따른다.
  useMockPoseApi: readBool(import.meta.env.VITE_USE_MOCK_POSE_API, useMockApi),
  appEnv: (import.meta.env.VITE_APP_ENV as AppEnv | undefined) ?? "development",
  get isProduction(): boolean {
    return this.appEnv === "production";
  },
} as const;
