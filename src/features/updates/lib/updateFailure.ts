/**
 * 업데이트 실패를 지표용 코드 하나로 좁힌다(ADR-011).
 *
 * ⚠ **오류 메시지 원문은 절대 지표로 보내지 않는다.** 자유 텍스트가 섞이면 집계가
 * 불가능해지고, 업데이터 오류에는 파일 경로나 호스트명이 들어올 수 있다(docs/11 §5
 * "로그에 포함 금지").
 *
 * 업데이터 플러그인은 `AnalysisError`처럼 코드를 주지 않아 메시지로 갈래를 나눈다.
 * 그래서 **확실한 것만 코드로 올리고 나머지는 UNKNOWN으로 둔다** — 억지로 나누면
 * 틀린 집계가 되고, 틀린 집계는 없는 집계보다 나쁘다.
 */

/** 업데이트가 어느 단계에서 멈췄는지. 사유보다 이쪽이 더 믿을 만하다. */
export type UpdatePhase = "check" | "download" | "install";

export function updateFailureReason(error: unknown): string {
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  if (!message) return "UNKNOWN";

  // 서명 검증 실패. 공개키와 개인키가 어긋났거나 패키지가 손상된 경우다.
  if (message.includes("signature") || message.includes("minisign")) return "SIGNATURE";
  // 피드 자체가 없다. prerelease로 올렸거나 latest.json이 빠진 릴리스에서 난다.
  if (message.includes("404") || message.includes("not found")) return "FEED_MISSING";
  if (
    message.includes("network") ||
    message.includes("timed out") ||
    message.includes("timeout") ||
    message.includes("connect")
  ) {
    return "NETWORK";
  }
  return "UNKNOWN";
}
