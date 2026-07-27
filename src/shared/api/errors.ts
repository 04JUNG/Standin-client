/**
 * 오류 정규화. Rust/서버 원문 문자열을 그대로 UI에 노출하지 않는다.
 * docs/02_APP_ARCHITECTURE.md §9 참고.
 */
export type AppError =
  | { kind: "network"; message: string; retryable: true }
  | { kind: "auth"; message: string; retryable: false }
  | { kind: "validation"; message: string; fields?: Record<string, string> }
  | { kind: "native"; message: string; code?: string; retryable: boolean };

export function networkError(message = "서버에 연결할 수 없습니다."): AppError {
  return { kind: "network", message, retryable: true };
}

export function authError(message = "인증에 실패했습니다."): AppError {
  return { kind: "auth", message, retryable: false };
}

export function isAppError(value: unknown): value is AppError {
  return typeof value === "object" && value !== null && "kind" in value && "message" in value;
}
