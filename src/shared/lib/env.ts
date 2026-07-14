/**
 * 환경변수 단일 접근점. 하드코딩된 서버 URL 금지(CLAUDE.md §10).
 * import.meta.env 값은 빌드 타임에 주입된다.
 */
type AppEnv = "development" | "production" | "test";

function readBool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  return value === "true" || value === "1";
}

export const env = {
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000",
  useMockApi: readBool(import.meta.env.VITE_USE_MOCK_API, true),
  appEnv: (import.meta.env.VITE_APP_ENV as AppEnv | undefined) ?? "development",
  get isProduction(): boolean {
    return this.appEnv === "production";
  },
} as const;
