/** Fixed, plain-language copy; never show upstream exception strings. */
export function generatedPoseNotice(
  status: string | null,
  reason?: string | null,
  hasOtherCandidates = false,
): string {
  if (reason === "source_missing") return "포즈 원본을 찾지 못했습니다. 다시 분석해 주세요.";
  if (reason === "source_changed")
    return "포즈 파일이 변경되어 선택할 수 없습니다. 다시 분석해 주세요.";
  if (hasOtherCandidates) {
    if (status === "timeout") return "새 포즈 생성 시간이 초과됐어요.";
    if (status === "rejected") return "새 포즈가 확인 과정을 통과하지 못했어요.";
    if (status === "failed" || status === "error") return "새 포즈를 만들지 못했어요.";
  }
  if (status === "timeout") return "포즈를 만드는 데 시간이 오래 걸렸습니다. 다시 분석해 주세요.";
  if (status === "rejected")
    return "만든 포즈가 확인 과정을 통과하지 못했습니다. 다른 포즈를 고르거나 그림을 바꿔 다시 분석해 주세요.";
  if (status === "failed" || status === "error")
    return "포즈를 만들지 못했습니다. 잠시 후 다시 분석해 주세요.";
  return "이 포즈는 지금 선택할 수 없습니다. 다른 포즈를 고르거나 다시 분석해 주세요.";
}
