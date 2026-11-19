import type { RefineOutcome } from "../api/refine.contract";
export type SelectedRefineProgress = {
  jobId: string;
  personIndex: number;
  candidateId: string;
  status:
    | "requested"
    | "refining"
    | "preparing"
    | "improved"
    | "unchanged"
    | "reverted"
    | "skipped"
    | "failed"
    | "cancelled";
  enteredAt: number;
  target?: import("../api/selectedRefineTarget").SelectedRefineTarget;
};
export function refineResultStatus(outcome: RefineOutcome): SelectedRefineProgress["status"] {
  if (outcome.refined) return "improved";
  if (
    ["upstream_unavailable", "upstream_missing_bvh", "artifact_store_failed"].includes(
      outcome.reasonCode,
    )
  )
    return "failed";
  if (
    [
      "feature_disabled",
      "storage_unavailable",
      "context_unavailable",
      "skeleton_policy",
      "disabled",
      "low_skeleton_score",
      "base_mismatch",
      "multiframe_base",
      "insufficient_target_bones",
      "low_observability",
      "no_solvable_joints",
      "entangled_set",
    ].includes(outcome.reasonCode)
  )
    return "skipped";
  if (/revert|safety|withheld/.test(outcome.reasonCode)) return "reverted";
  return "unchanged";
}
export const SELECTED_REFINE_COPY: Record<SelectedRefineProgress["status"], string> = {
  requested: "선택한 포즈를 확인하고 있어요",
  refining: "러프에 맞춰 조정하고 있어요",
  preparing: "최종 결과를 준비하고 있어요",
  improved: "러프 맞춤 완료",
  unchanged: "원본 포즈 유지",
  reverted: "안전하게 원본 포즈로 복구",
  skipped: "러프 맞춤 건너뜀",
  failed: "러프 맞춤 실패 · 원본 포즈 유지",
  cancelled: "러프 맞춤 취소",
};

export const SELECTED_REFINE_DETAIL: Record<SelectedRefineProgress["status"], string> = {
  requested: "선택한 포즈와 보정 가능 여부를 확인해요.",
  refining: "자동 보정 결과를 기다리고 있어요.",
  preparing: "결과 확인과 파일 준비가 끝나면 미리보기를 표시해요.",
  improved: "조정된 포즈로 최종 결과를 준비해요.",
  unchanged: "비교 결과에 따라 원래 포즈를 유지해요.",
  reverted: "안전 확인 결과에 따라 원래 포즈를 유지해요.",
  skipped: "자동 보정을 실행하지 않고 원래 포즈를 준비해요.",
  failed: "자동 보정을 완료하지 못해 원래 포즈를 유지해요.",
  cancelled: "이 요청의 진행 표시를 종료했어요.",
};
