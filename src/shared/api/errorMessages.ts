/**
 * 서버 오류 코드 → 사용자에게 보여줄 문구.
 *
 * 서버가 내려준 `message`는 화면에 쓰지 않는다(docs/06 §4). 서버 문구는 언제든 바뀌고,
 * 영어이거나 기술적일 수 있으며, 계정 존재 여부 같은 정보를 흘릴 수 있다. 앱은 `code`만
 * 보고 자기 문구를 고른다.
 *
 * 코드 목록은 BFF(`Standin-app-server`)의 실제 errorEnvelope 호출부 기준이다.
 */
const MESSAGES: Record<string, string> = {
  // 로그인
  INVALID_CREDENTIALS: "이메일 또는 비밀번호가 올바르지 않습니다.",
  EMAIL_NOT_VERIFIED: "이메일 인증이 필요합니다. 메일함을 확인해 주세요.",
  INVALID_INPUT: "입력한 내용을 다시 확인해 주세요.",
  EMAIL_TAKEN: "이미 다른 방법으로 가입된 이메일입니다. 기존 방식으로 로그인해 주세요.",

  // 세션
  UNAUTHENTICATED: "세션이 만료되었습니다. 다시 로그인해 주세요.",
  INVALID_TOKEN: "세션이 만료되었습니다. 다시 로그인해 주세요.",

  // 소셜 로그인
  PROVIDER_UNAVAILABLE: "지금은 이 소셜 로그인을 사용할 수 없습니다.",
  OAUTH_FAILED: "소셜 로그인을 완료하지 못했습니다. 다시 시도해 주세요.",
  OAUTH_STATE_MISMATCH: "소셜 로그인이 만료되었습니다. 다시 시도해 주세요.",
  EMAIL_REQUIRED: "소셜 계정의 이메일 제공에 동의해야 로그인할 수 있습니다.",
  INVALID_CODE: "로그인 정보가 만료되었습니다. 다시 시도해 주세요.",

  // 기타
  NOT_FOUND: "요청한 정보를 찾을 수 없습니다.",
  RATE_LIMITED: "요청이 많습니다. 잠시 후 다시 시도해 주세요.",
};

const SERVER_ERROR = "서버에 문제가 있습니다. 잠시 후 다시 시도해 주세요.";
const FALLBACK = "요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.";

/** 세션이 끝났음을 뜻하는 코드. 이 경우 화면은 로그인으로 돌아가야 한다. */
export function isSessionExpiredCode(code: string): boolean {
  return code === "UNAUTHENTICATED" || code === "INVALID_TOKEN";
}

/**
 * 코드와 HTTP 상태로 문구를 고른다. 모르는 코드라도 서버 원문으로 새지 않는다.
 * 5xx는 코드가 무엇이든 "서버 문제"로 묶는다 — 사용자가 할 수 있는 일이 같다.
 */
export function messageForCode(code: string, status?: number): string {
  const known = MESSAGES[code];
  if (known) return known;
  if (status !== undefined && status >= 500) return SERVER_ERROR;
  return FALLBACK;
}
