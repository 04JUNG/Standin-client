import type { PosePresentation } from "./posePresentation";

export function hasPresentationCandidates(p?: PosePresentation): boolean {
  return (
    !!p &&
    [p.library_candidates, p.review_candidates, p.generated_candidates].some((g) => g.length > 0)
  );
}

/** Fixed copy only: upstream diagnostics must never become user-facing text. */
export function presentationNotice(p: PosePresentation): string | null {
  const hasCandidates = hasPresentationCandidates(p);
  if (
    p.search_reason === "presentation_contract_invalid" ||
    p.search_reason === "presentation_contract_unsupported" ||
    p.issues.some((i) => /^(invalid_|unsupported_|nonorthogonal_|reflected_)/.test(i))
  )
    return "포즈 응답을 확인하지 못했어요. 앱을 업데이트한 뒤 다시 분석해 주세요.";
  if (
    /hand_skin|validation|screen_unavailable/.test([p.search_reason, ...p.issues].join(" ")) ||
    p.search_status === "blocked" ||
    p.search_status === "undetermined" ||
    p.issues.length > 0
  )
    return hasCandidates
      ? "일부 포즈의 확인을 마치지 못했어요."
      : "포즈 확인을 마치지 못했어요. 자세가 잘 보이는 러프로 다시 분석해 주세요.";
  if (["error", "partial_error", "failed", "timeout"].includes(p.search_status))
    return hasCandidates
      ? "일부 후보를 불러오지 못했어요."
      : "포즈를 불러오지 못했어요. 다시 시도해 주세요.";
  if (!hasCandidates) {
    if (p.preview_status === "unavailable" && p.search_status === "ok")
      return "표시할 수 있는 포즈가 없어요. 다시 분석해 주세요.";
    return "비슷한 포즈를 찾지 못했어요.";
  }
  return null;
}

export function presentationGenerationNotice(p: PosePresentation): string | null {
  if (hasPresentationCandidates(p) && !p.generation_status) return null;
  if (
    ["not_requested", "not_run", "disabled", "unavailable"].includes(p.generation_status ?? "") ||
    (!p.generation_status && !hasPresentationCandidates(p))
  )
    return p.generation_status || /no_generation/.test(p.search_reason ?? "")
      ? "새 참고 포즈는 만들지 않았어요."
      : "새 참고 포즈 결과가 없어요.";
  return null;
}
