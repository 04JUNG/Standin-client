/**
 * 오류 정규화. Rust/서버 원문 문자열을 그대로 UI에 노출하지 않는다.
 * docs/02_APP_ARCHITECTURE.md §9 참고.
 */
import { isSessionExpiredCode, messageForCode } from "./errorMessages";
import { joinQuotaMessage, type LimitDetails } from "./quotaMessage";

export type { LimitDetails };

/** 서버 오류 봉투(docs/08 §2). */
export type ServerErrorBody = {
  error: {
    code: string;
    message: string;
    details?: unknown;
    requestId?: string;
  };
};

/**
 * 정규화 전의 원시 서버 오류. UI는 이걸 직접 읽지 말고 `toAppError`를 거친다 —
 * `message`는 서버 원문이라 화면에 쓰면 안 된다.
 */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly requestId?: string,
    /**
     * 오류 봉투의 `details`. 사용량 제한은 여기에 재시도 시각을 담아 보낸다 —
     * 버리면 "언제 다시 쓸 수 있는지"를 사용자에게 알려줄 수 없다.
     */
    public readonly details?: unknown,
    /** `Retry-After` 헤더. `details`가 없는 응답의 폴백이다. */
    public readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = "ApiError";
  }

  /** `details`가 사용량 제한 형태일 때만 꺼낸다. */
  get limitDetails(): LimitDetails | null {
    const d = this.details;
    if (typeof d !== "object" || d === null || Array.isArray(d)) return null;
    return d as LimitDetails;
  }
}

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

/**
 * 무엇이 던져졌든 AppError로 만든다.
 *
 * `ApiError`는 `kind`가 없어서 `isAppError`를 통과하지 못했고, 그래서 호출부가
 * `err instanceof Error`로 흘러 **서버 원문 message를 그대로 화면에 찍고 있었다**.
 * 그 경로를 여기서 막는다 — 서버 문구 대신 코드로 고른 앱 문구를 쓴다(docs/06 §4).
 *
 * requestId는 화면에 노출하지 않고 콘솔에만 남긴다(docs/11 §3 — 로그에 요청 ID를 남기되
 * 토큰·비밀번호는 남기지 않는다).
 */
export function toAppError(err: unknown): AppError {
  if (err instanceof ApiError) {
    if (err.requestId) {
      console.warn(`[api] ${err.status} ${err.code} (requestId=${err.requestId})`);
    }
    const message = messageForCode(err.code, err.status);
    // 인증·세션 계열은 재시도해도 소용없다.
    if (err.status === 401 || err.status === 403 || isSessionExpiredCode(err.code)) {
      return authError(message);
    }
    // 429는 "지금은 안 되지만 나중엔 된다"라서 재시도 가능이다. 사용량 제한 계열이
    // 여기 걸린다 — 5xx만 재시도 가능으로 두면 쿼터 초과가 영구 실패로 분류된다.
    const retryable = err.status >= 500 || err.status === 429;
    return { kind: "native", message, code: err.code, retryable };
  }
  if (isAppError(err)) return err;
  // 여기까지 오면 앱 내부 버그(TypeError 등)다. 원문을 노출하지 않는다.
  return { kind: "native", message: "요청을 처리하지 못했습니다.", retryable: false };
}

/**
 * 화면에 띄울 문구 하나를 고른다. UI는 `err.message`를 직접 읽지 말고 이걸 쓴다 —
 * `ApiError.message`는 서버 원문이라 그대로 찍으면 안 된다(docs/06 §4).
 *
 * 사용량 제한(429)이면 한도와 다음 사용 가능 시점을 뒤에 붙인다. 그래서 화면마다
 * 따로 조립하지 않아도 "원인 + 다음 행동"이 함께 나간다(스프린트 UX-01).
 */
export function messageOf(err: unknown, fallback: string, now = new Date()): string {
  const base = toAppError(err).message || fallback;
  if (!(err instanceof ApiError) || err.status !== 429) return base;
  // 503(kill switch)은 재시도 시각을 줄 수 없다 — 고정 문구가 이미 안내를 담고 있다.
  const details = err.limitDetails ?? { retryAfterSeconds: err.retryAfterSeconds };
  return joinQuotaMessage(base, details, now);
}
