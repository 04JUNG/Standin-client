/**
 * "이메일 기억" 저장. 이메일은 민감정보가 아니므로 사용자가 선택하면 일반 저장 가능(docs/06 §6).
 * 비밀번호·토큰은 절대 저장하지 않는다.
 */
const KEY = "standin.rememberedEmail";

export function getRememberedEmail(): string {
  try {
    return localStorage.getItem(KEY) ?? "";
  } catch {
    return "";
  }
}

export function setRememberedEmail(email: string): void {
  try {
    localStorage.setItem(KEY, email);
  } catch {
    // 저장 실패는 무시(프라이빗 모드 등).
  }
}

export function clearRememberedEmail(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // 무시
  }
}
